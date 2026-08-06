import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/browser/**/*.test.ts', 'tests/unit/**/*.test.ts'],
        restoreMocks: true,
        clearMocks: true
    }
});
