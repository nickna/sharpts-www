import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/SharpTS.Www.SelfHost/rate-limiter';

describe('RateLimiter', () => {
    it('enforces an exact sliding window', () => {
        const limiter = new RateLimiter({
            maximumIdentities: 4,
            requestsPerWindow: 2,
            windowMs: 1000
        });

        expect(limiter.allow('client', 1000)).toBe(true);
        expect(limiter.allow('client', 1100)).toBe(true);
        expect(limiter.allow('client', 1200)).toBe(false);
        expect(limiter.allow('client', 2001)).toBe(true);
    });

    it('evicts the least recently used identity at the configured bound', () => {
        const limiter = new RateLimiter({
            maximumIdentities: 2,
            requestsPerWindow: 1,
            windowMs: 60_000
        });

        expect(limiter.allow('oldest', 1000)).toBe(true);
        expect(limiter.allow('recent', 1001)).toBe(true);
        expect(limiter.allow('oldest', 1002)).toBe(false);
        expect(limiter.allow('new', 1003)).toBe(true);
        expect(limiter.identityCount).toBe(2);
        expect(limiter.allow('recent', 1004)).toBe(true);
    });
});
