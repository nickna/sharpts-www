import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        restoreMocks: true,
        clearMocks: true,
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['tests/unit/**/*.test.ts']
                }
            },
            {
                extends: true,
                test: {
                    name: 'browser',
                    environment: 'jsdom',
                    include: ['tests/browser/**/*.test.ts']
                }
            }
        ]
    }
});
