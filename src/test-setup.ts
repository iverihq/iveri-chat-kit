import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts between tests only when it finds a global `afterEach`; the specs import
// the test API explicitly, so the cleanup is registered here instead.
afterEach(() => {
    cleanup();
});
