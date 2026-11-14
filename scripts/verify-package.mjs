/**
 * Proves the **published artefact** works, which is the only thing a consumer ever sees.
 *
 * `@iveri/react-kit` once shipped a directory import every Vite app accepted and Node rejected, and
 * `@iveri/nest-sdk` once shipped a root that required an optional peer, so it threw wherever that peer
 * was absent. Neither was visible to `tsc`, a linter or a reviewer. So this checks the build, not the
 * source, and checks each entry point in a separate Node process **with the peers it must not need made
 * unresolvable**:
 *
 * - the root loads with neither `react-dom` nor `react-native` installed: an Expo app has no `react-dom`
 *   and a website no React Native, and both import the root;
 * - `/web` loads without `react-native`;
 * - `/native` loads without `react-dom`, with `react-native` replaced by a stub that exports exactly the
 *   names the build imports, because React Native's real entry point is Flow and no Node can load it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const failures = [];

const included = new Set(manifest.files);
const isPublished = (relative) =>
    relative === 'package.json' || included.has(relative) || included.has(relative.split('/')[0]);

for (const target of Object.values(manifest.exports).flatMap((node) =>
    typeof node === 'string' ? [node] : Object.values(node),
)) {
    const relative = target.replace(/^\.\//u, '');
    if (!existsSync(resolve(relative))) failures.push(`exports "${target}" points at a file that does not exist`);
    else if (!isPublished(relative)) failures.push(`exports "${target}" is not covered by "files"`);
}

for (const field of ['main', 'module', 'types', 'typesVersions']) {
    if (field in manifest) failures.push(`package.json still declares "${field}"; the exports map is the only entry`);
}

for (const peer of ['react-dom', 'react-native', 'livekit-client', '@livekit/react-native']) {
    if (manifest.peerDependenciesMeta?.[peer]?.optional !== true) failures.push(`${peer} must be an optional peer`);
}

/** Every name `dist/native` imports from `react-native`, so the stub can export exactly those. */
function nativeImports() {
    const names = new Set();
    const walk = (directory) => {
        for (const entry of readdirSync(directory)) {
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith('.js')) {
                for (const match of readFileSync(path, 'utf8').matchAll(
                    /import\s*\{([^}]*)\}\s*from\s*'react-native'/gu,
                )) {
                    for (const name of match[1].split(',')) {
                        const trimmed = name.trim().split(/\s+as\s+/u)[0];
                        if (trimmed.length > 0 && !trimmed.startsWith('type ')) names.add(trimmed);
                    }
                }
            }
        }
    };
    walk(resolve('dist/native'));
    walk(resolve('dist/native-call'));

    return [...names];
}

/** Loads one entry point in a child Node, with some packages unresolvable and React Native optionally stubbed. */
function load(entry, { blocked, stubNative }) {
    const stub = stubNative
        ? `const Stub = () => null; ${nativeImports()
              .map((name) =>
                  name === 'StyleSheet'
                      ? 'export const StyleSheet = { create: (s) => s, flatten: (s) => s, hairlineWidth: 1, absoluteFill: {} };'
                      : name === 'Platform'
                        ? "export const Platform = { OS: 'ios', select: (o) => o.ios };"
                        : `export const ${name} = Stub;`,
              )
              .join(' ')}`
        : '';
    const hooks = `
        import { registerHooks } from 'node:module';
        const blocked = ${JSON.stringify(blocked)};
        const stub = ${JSON.stringify(stub)};
        // LiveKit's React Native module needs a phone, like React Native itself; its two names are stood in for.
        const livekitNative = 'export const AudioSession = {}; export const VideoView = () => null;';
        registerHooks({
            resolve(specifier, context, next) {
                const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
                if (stub.length > 0 && name === 'react-native') return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
                if (stub.length > 0 && name === '@livekit/react-native') return { url: 'data:text/javascript,' + encodeURIComponent(livekitNative), shortCircuit: true };
                if (blocked.includes(name)) {
                    const error = new Error('Cannot find package ' + name + ' (made unresolvable by verify-package)');
                    error.code = 'ERR_MODULE_NOT_FOUND';
                    throw error;
                }
                return next(specifier, context);
            },
        });
        const loaded = await import(${JSON.stringify(pathToFileURL(resolve(entry)).href)});
        console.log(Object.keys(loaded).length);
    `;

    return Number(execFileSync(process.execPath, ['--input-type=module', '-e', hooks], { encoding: 'utf8' }).trim());
}

// `livekit-client` and `@livekit/react-native` are optional peers only the call entry points need: blocked
// everywhere else, so an app that never calls never has to install them.
const checks = [
    {
        entry: 'dist/index.js',
        blocked: ['react-dom', 'react-native', 'livekit-client', '@livekit/react-native'],
        stubNative: false,
    },
    {
        entry: 'dist/web/index.js',
        blocked: ['react-native', 'livekit-client', '@livekit/react-native'],
        stubNative: false,
    },
    { entry: 'dist/web-call/index.js', blocked: ['react-native', '@livekit/react-native'], stubNative: false },
    {
        entry: 'dist/native/index.js',
        blocked: ['react-dom', 'livekit-client', '@livekit/react-native'],
        stubNative: true,
    },
    { entry: 'dist/native-call/index.js', blocked: ['react-dom'], stubNative: true },
];

for (const check of checks) {
    try {
        const count = load(check.entry, check);
        if (count === 0) throw new Error('loaded but exported nothing');
        console.log(
            `@iveri/chat-kit: ${check.entry} loads under Node without ${check.blocked.join(', ')} (${count} exports)`,
        );
    } catch (error) {
        failures.push(
            `${check.entry} is not loadable: ${error instanceof Error ? error.message.split('\n').slice(0, 6).join(' ') : error}`,
        );
    }
}

/** The stylesheet points Tailwind at the built components; a wrong path ships a half-styled chat. */
const css = readFileSync(resolve('styles/web.css'), 'utf8');
const sources = [...css.matchAll(/@source '([^']+)'/gu)].map((match) => match[1]);
for (const entry of ['../dist/web', '../dist/web-call']) {
    if (!sources.includes(entry) || !existsSync(resolve('styles', entry))) {
        failures.push(`styles/web.css has no @source for the built ${entry.replace('../dist/', '/')} components`);
    }
}

if (failures.length > 0) {
    console.error('@iveri/chat-kit: the published package would be broken');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log('@iveri/chat-kit: every export is published and every entry point loads');
