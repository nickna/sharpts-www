import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    acquireExecutionSlot,
    cancelExecutionSlot,
    createExecutionQueue,
    releaseExecutionSlot,
    shutdownExecutionQueue
} from '../../src/SharpTS.Www.SelfHost/execution-queue';

describe('ExecutionQueue', () => {
    afterEach(() => vi.useRealTimers());

    it('bounds queued work and admits it in FIFO order', () => {
        const queue = createExecutionQueue({ maximumConcurrent: 1, maximumQueued: 1, waitMs: 1000 });
        const results: string[] = [];

        acquireExecutionSlot(queue, (acquired) => results.push('first:' + acquired));
        acquireExecutionSlot(queue, (acquired) => results.push('second:' + acquired));
        acquireExecutionSlot(queue, (acquired) => results.push('third:' + acquired));

        expect(results).toEqual(['first:true', 'third:false']);
        expect(queue.activeCount).toBe(1);
        expect(queue.waiting).toHaveLength(1);

        releaseExecutionSlot(queue);
        expect(results).toEqual(['first:true', 'third:false', 'second:true']);
        expect(queue.activeCount).toBe(1);
        expect(queue.waiting).toHaveLength(0);
    });

    it('removes cancelled waiters immediately', () => {
        const queue = createExecutionQueue({ maximumConcurrent: 1, maximumQueued: 1, waitMs: 1000 });
        acquireExecutionSlot(queue, () => undefined);
        const waiting = acquireExecutionSlot(queue, () => {
            throw new Error('A cancelled waiter must not be completed.');
        });

        cancelExecutionSlot(queue, waiting);
        expect(queue.waiting).toHaveLength(0);
        releaseExecutionSlot(queue);
        expect(queue.activeCount).toBe(0);
    });

    it('rejects timed-out and shutdown waiters', () => {
        vi.useFakeTimers();
        const queue = createExecutionQueue({ maximumConcurrent: 1, maximumQueued: 2, waitMs: 1000 });
        const results: boolean[] = [];
        acquireExecutionSlot(queue, () => undefined);
        acquireExecutionSlot(queue, (acquired) => results.push(acquired));
        vi.advanceTimersByTime(1000);
        expect(results).toEqual([false]);

        acquireExecutionSlot(queue, (acquired) => results.push(acquired));
        shutdownExecutionQueue(queue);
        expect(results).toEqual([false, false]);
        expect(queue.accepting).toBe(false);
    });
});
