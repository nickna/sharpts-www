type TimerHandle = ReturnType<typeof setTimeout>;

interface QueueEntry {
    id: number;
    settled: boolean;
    completed: (acquired: boolean) => void;
    timer: TimerHandle | null;
}

export interface ExecutionQueueOptions {
    maximumConcurrent: number;
    maximumQueued: number;
    waitMs: number;
}

export interface ExecutionQueueState {
    options: ExecutionQueueOptions;
    activeCount: number;
    accepting: boolean;
    sequence: number;
    waiting: QueueEntry[];
}

/** Create isolated state for a bounded FIFO playground worker queue. */
export function createExecutionQueue(options: ExecutionQueueOptions): ExecutionQueueState {
    if (!Number.isInteger(options.maximumConcurrent) || options.maximumConcurrent < 1)
        throw new Error('maximumConcurrent must be a positive integer.');
    if (!Number.isInteger(options.maximumQueued) || options.maximumQueued < 0)
        throw new Error('maximumQueued must be a non-negative integer.');
    if (!Number.isFinite(options.waitMs) || options.waitMs <= 0)
        throw new Error('waitMs must be positive.');
    return { options, activeCount: 0, accepting: true, sequence: 0, waiting: [] };
}

export function acquireExecutionSlot(queue: ExecutionQueueState,
    completed: (acquired: boolean) => void): number {
    if (!queue.accepting) {
        completed(false);
        return 0;
    }
    if (queue.activeCount < queue.options.maximumConcurrent) {
        queue.activeCount++;
        completed(true);
        return 0;
    }
    if (queue.waiting.length >= queue.options.maximumQueued) {
        completed(false);
        return 0;
    }

    const entry: QueueEntry = {
        id: ++queue.sequence,
        settled: false,
        completed,
        timer: null
    };
    // SharpTS's timer declaration requires a localized Node callback adapter cast.
    entry.timer = setTimeout((() => rejectEntry(queue, entry)) as any, queue.options.waitMs);
    queue.waiting.push(entry);
    return entry.id;
}

export function cancelExecutionSlot(queue: ExecutionQueueState, requestId: number): void {
    if (requestId === 0)
        return;
    const entry = queue.waiting.find(candidate => candidate.id === requestId);
    if (!entry || entry.settled)
        return;
    entry.settled = true;
    if (entry.timer !== null)
        clearTimeout(entry.timer);
    removeEntry(queue, entry);
}

export function releaseExecutionSlot(queue: ExecutionQueueState): void {
    if (queue.activeCount > 0)
        queue.activeCount--;
    while (queue.accepting && queue.waiting.length > 0) {
        const entry = queue.waiting.shift();
        if (!entry || entry.settled)
            continue;
        entry.settled = true;
        if (entry.timer !== null)
            clearTimeout(entry.timer);
        queue.activeCount++;
        entry.completed(true);
        return;
    }
}

export function shutdownExecutionQueue(queue: ExecutionQueueState): void {
    queue.accepting = false;
    while (queue.waiting.length > 0) {
        const entry = queue.waiting.shift();
        if (!entry || entry.settled)
            continue;
        entry.settled = true;
        if (entry.timer !== null)
            clearTimeout(entry.timer);
        entry.completed(false);
    }
}

function rejectEntry(queue: ExecutionQueueState, entry: QueueEntry): void {
    if (entry.settled)
        return;
    entry.settled = true;
    removeEntry(queue, entry);
    entry.completed(false);
}

function removeEntry(queue: ExecutionQueueState, entry: QueueEntry): void {
    const index = queue.waiting.indexOf(entry);
    if (index >= 0)
        queue.waiting.splice(index, 1);
}
