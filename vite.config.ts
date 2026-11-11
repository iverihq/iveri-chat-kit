import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// This package emits its JavaScript with `tsc`, not Vite: the plugin is here only so the specs can
// render JSX. Two projects, because the native components cannot be rendered by React Native in a
// test runner (its entry point is Flow, which nothing here can transform) and are rendered through
// `react-native-web` instead, while everything else must never see that alias.
export default defineConfig({
    plugins: [react()],
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'dom',
                    environment: 'jsdom',
                    include: ['src/**/*.spec.{ts,tsx}'],
                    exclude: ['src/native/**'],
                    setupFiles: ['./src/test-setup.ts'],
                    // Node 25 began defining its own global `localStorage`, which shadows jsdom's.
                    execArgv: ['--no-experimental-webstorage'],
                },
            },
            {
                extends: true,
                resolve: { alias: { 'react-native': 'react-native-web' } },
                test: {
                    name: 'native',
                    environment: 'jsdom',
                    include: ['src/native/**/*.spec.{ts,tsx}'],
                    setupFiles: ['./src/test-setup.ts'],
                    execArgv: ['--no-experimental-webstorage'],
                },
            },
        ],
    },
});
