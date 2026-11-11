import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The component gallery. Not published and not part of the build: it exists so a design change can be
 * looked at rather than inferred. It consumes the kit's stylesheet and `@iveri/react-kit/theme.css`
 * exactly as an app does, and reads the real `chat-kit` strings from `iveri-infra` beside this repository
 * (or `IVERI_INFRA_DIR`), so what it shows is what an app shows after pulling the namespace.
 */
const namespace = resolve(
    process.env.IVERI_INFRA_DIR ?? resolve(import.meta.dirname, '../../iveri-infra'),
    'scripts/i18n/chat-kit.mjs',
);

if (!existsSync(namespace)) {
    throw new Error(
        `The gallery reads the chat-kit strings from ${namespace}; check out iveri-infra beside this repository.`,
    );
}

export default defineConfig({
    root: 'preview',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { 'virtual:chat-kit-namespace': namespace } },
    server: {
        port: 5191,
        strictPort: true,
        fs: { allow: [resolve(import.meta.dirname, '..'), resolve(namespace, '..')] },
    },
});
