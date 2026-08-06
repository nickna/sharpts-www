interface RateLimitEntry {
    timestamps: number[];
}

export interface RateLimiterOptions {
    maximumIdentities: number;
    requestsPerWindow: number;
    windowMs: number;
}

/**
 * Exact sliding-window limiter with insertion-ordered LRU identity eviction.
 * Both timestamps per identity and the number of identities are bounded.
 */
export class RateLimiter {
    private readonly entries = new Map<string, RateLimitEntry>();

    constructor(private readonly options: RateLimiterOptions) {
        if (!Number.isInteger(options.maximumIdentities) || options.maximumIdentities < 1)
            throw new Error('maximumIdentities must be a positive integer.');
        if (!Number.isInteger(options.requestsPerWindow) || options.requestsPerWindow < 1)
            throw new Error('requestsPerWindow must be a positive integer.');
        if (!Number.isFinite(options.windowMs) || options.windowMs <= 0)
            throw new Error('windowMs must be positive.');
    }

    allow(identity: string, now: number = Date.now()): boolean {
        const cutoff = now - this.options.windowMs;
        let entry = this.entries.get(identity);
        if (entry) {
            this.entries.delete(identity);
            entry.timestamps = entry.timestamps.filter(timestamp => timestamp > cutoff);
        } else {
            if (this.entries.size >= this.options.maximumIdentities) {
                const oldest = this.entries.keys().next();
                if (!oldest.done)
                    this.entries.delete(oldest.value);
            }
            entry = { timestamps: [] };
        }

        this.entries.set(identity, entry);
        if (entry.timestamps.length >= this.options.requestsPerWindow)
            return false;
        entry.timestamps.push(now);
        return true;
    }

    get identityCount(): number {
        return this.entries.size;
    }
}
