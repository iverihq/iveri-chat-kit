import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHAT_KIT_FORBIDDEN_WORDS, findForbiddenWords } from './forbidden-words.js';
import {
    CHAT_ACCOUNT_MESSAGE_KEYS,
    CHAT_KIT_MESSAGE_KEYS,
    CHAT_PRODUCT_TEXT_MESSAGE_KEYS,
    CHAT_REFUSAL_MESSAGE_KEYS,
    CHAT_REPORT_REASON_MESSAGE_KEYS,
    CHAT_SYSTEM_MESSAGE_KEYS,
} from './message-keys.js';

const ROOT = resolve(import.meta.dirname, '..');

function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return entry === 'testing' ? [] : sourceFiles(path);

        return /\.tsx?$/u.test(entry) && !/\.spec\.tsx?$/u.test(entry) && !path.includes(`${join('src', 'i18n')}`)
            ? [path]
            : [];
    });
}

/** Every `'chat.…'` literal the components and helpers write. */
function literalKeys(): Set<string> {
    const keys = new Set<string>();
    for (const file of sourceFiles(ROOT)) {
        for (const match of readFileSync(file, 'utf8').matchAll(/['`](chat\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)['`]/gu))
            keys.add(match[1]);
    }

    return keys;
}

/** Keys the server sends rather than the components write: notices, refusals, report reasons, product labels. */
const SERVER_KEYS = new Set<string>([
    ...CHAT_SYSTEM_MESSAGE_KEYS,
    ...CHAT_REFUSAL_MESSAGE_KEYS,
    ...CHAT_REPORT_REASON_MESSAGE_KEYS,
    ...CHAT_PRODUCT_TEXT_MESSAGE_KEYS,
    ...CHAT_ACCOUNT_MESSAGE_KEYS,
]);

describe('CHAT_KIT_MESSAGE_KEYS', () => {
    it('holds every key the source writes, so an app pulling the namespace has them all', () => {
        const listed = new Set<string>(CHAT_KIT_MESSAGE_KEYS);
        expect([...literalKeys()].filter((key) => !listed.has(key))).toEqual([]);
    });

    it('holds nothing the source no longer writes, apart from what the server sends', () => {
        const written = literalKeys();
        // Built from a value rather than written out: `chat.inbox.tab.${folder}` on a phone, and the
        // web's tables of the same keys, which are literals and therefore counted.
        // The date names are composed from a value (`chat.date.month.${name}`), never written out whole.
        const composed = ['chat.date.weekday.', 'chat.date.month.'];
        const stale = CHAT_KIT_MESSAGE_KEYS.filter(
            (key) => !SERVER_KEYS.has(key) && !written.has(key) && !composed.some((prefix) => key.startsWith(prefix)),
        );
        expect(stale).toEqual([]);
    });

    it('has no key twice', () => {
        expect(new Set(CHAT_KIT_MESSAGE_KEYS).size).toBe(CHAT_KIT_MESSAGE_KEYS.length);
    });
});

describe('CHAT_KIT_FORBIDDEN_WORDS', () => {
    it('catches the claim in all three languages, whatever its case or ending', () => {
        expect(findForbiddenWords('Messages are Encrypted')).toEqual(['encrypt']);
        expect(findForbiddenWords('Сообщения защищены')).toEqual(['защищ']);
        expect(findForbiddenWords('დაშიფრული მიმოწერა')).toEqual(['დაშიფრ']);
        expect(findForbiddenWords('Write a message')).toEqual([]);
        expect(Object.keys(CHAT_KIT_FORBIDDEN_WORDS)).toEqual(['en', 'ru', 'ka']);
    });
});

/**
 * The namespace itself lives in `iveri-infra`, which CI does not check out. Run locally with that
 * repository beside this one (the workspace layout) or `IVERI_INFRA_DIR` pointing at a checkout; each
 * consuming app's `catalog.spec.ts` asserts the same against the catalogue it actually pulled.
 */
const namespaceFile = resolve(
    process.env.IVERI_INFRA_DIR ?? resolve(ROOT, '..', '..', 'iveri-infra'),
    'scripts/i18n/chat-kit.mjs',
);

describe.skipIf(!existsSync(namespaceFile))('the chat-kit namespace in iveri-infra', () => {
    it('defines every key the kit can render, in all three languages, and nothing else', () => {
        // Loaded by Node itself, outside the test bundler, exactly as the seed loads it; this is also what
        // runs the file's own refusal of a forbidden word.
        const script = `const m = await import(${JSON.stringify(pathToFileURL(namespaceFile).href)}); console.log(JSON.stringify(m.namespace));`;
        const module = {
            namespace: JSON.parse(
                execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }),
            ) as {
                key: string;
                messages: { key: string; values: Record<string, string> }[];
            },
        };
        const defined = module.namespace.messages.map((entry) => entry.key);

        expect(module.namespace.key).toBe('chat-kit');
        expect(CHAT_KIT_MESSAGE_KEYS.filter((key) => !defined.includes(key))).toEqual([]);
        expect(defined.filter((key) => !(CHAT_KIT_MESSAGE_KEYS as readonly string[]).includes(key))).toEqual([]);
        for (const entry of module.namespace.messages) {
            expect(Object.keys(entry.values).sort(), entry.key).toEqual(['en', 'ka', 'ru']);
            for (const value of Object.values(entry.values))
                expect(findForbiddenWords(value), `${entry.key}: ${value}`).toEqual([]);
        }
    });
});
