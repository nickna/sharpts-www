export const executionTimeoutPolicy = {
    defaultMs: 5_000,
    minimumMs: 100,
    maximumMs: 10_000
} as const;

export const networkBlockHost = 'sharpts-network-blocked.invalid';
export const networkBlockProxyUrl = `http://${networkBlockHost}:9`;
