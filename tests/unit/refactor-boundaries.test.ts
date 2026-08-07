import { describe, expect, it, vi } from 'vitest';
import type { ServerConfig, SupervisorConfig } from '../../src/SharpTS.Www.SelfHost/config';
import { createHttpServer } from '../../src/SharpTS.Www.SelfHost/http-server';
import {
    classifyWorkerExit,
    createBoundedStreamCapture,
    createSupervisor
} from '../../src/SharpTS.Www.SelfHost/supervisor';
import {
    executionTimeoutPolicy,
    networkBlockHost,
    networkBlockProxyUrl
} from '../../src/SharpTS.Www.Shared/execution-policy';

const supervisorConfig: SupervisorConfig = {
    workerPath: 'worker',
    requireRssMonitoring: false,
    maximumSourceBytes: 1024,
    maximumWorkerRssBytes: 96 * 1024 * 1024,
    maximumWorkerOutputBytes: 1024,
    memoryPollIntervalMs: 500,
    workerTimeoutBufferMs: 1000,
    maximumConcurrentWorkers: 1,
    maximumQueuedExecutions: 1,
    concurrencyWaitMs: 100
};

describe('refactored runtime boundaries', () => {
    it('uses one execution policy across timeout and network enforcement', () => {
        expect(executionTimeoutPolicy).toEqual({ defaultMs: 5000, minimumMs: 100, maximumMs: 10_000 });
        expect(networkBlockProxyUrl).toBe(`http://${networkBlockHost}:9`);
    });

    it('expresses configured memory limits in MiB', () => {
        expect(
            classifyWorkerExit({
                cancelled: false,
                killedForMemory: true,
                killedForTimeout: false,
                killedForOutput: false,
                timeoutMs: 5000,
                maximumWorkerRssBytes: 96 * 1024 * 1024,
                exitCode: null,
                stderr: '',
                mode: 'interpret',
                hasOutput: false
            })?.message
        ).toContain('96 MiB');
    });

    it('applies one bounded byte budget identically to stdout and stderr', () => {
        const exceeded = vi.fn();
        const budget = { bytes: 0, exceeded: false };
        const stdout = createBoundedStreamCapture(5, budget, exceeded);
        const stderr = createBoundedStreamCapture(5, budget, exceeded);
        stdout.append({ length: 3, toString: () => 'out' });
        stderr.append({ length: 3, toString: () => 'err' });
        expect(stdout.value()).toBe('out');
        expect(stderr.value()).toBe('err');
        expect(exceeded).toHaveBeenCalledOnce();
    });

    it('keeps shutdown state isolated between supervisor instances', () => {
        const dependencies = { fileExists: () => true, log: () => undefined };
        const first = createSupervisor(supervisorConfig, dependencies);
        const second = createSupervisor(supervisorConfig, dependencies);
        expect(first.isReady()).toBe(true);
        expect(second.isReady()).toBe(true);
        first.beginShutdown();
        expect(first.isReady()).toBe(false);
        expect(second.isReady()).toBe(true);
    });

    it('constructs the HTTP application without listening', () => {
        const listen = vi.fn();
        const server = {
            address: () => ({ address: '127.0.0.1', port: 8080 }),
            close: vi.fn(),
            closeAllConnections: vi.fn(),
            listen
        };
        const config: ServerConfig = {
            port: 8080,
            host: '127.0.0.1',
            publicOrigin: '',
            contentRoot: 'public',
            trustPrivateProxy: false,
            trustedProxyAddresses: [],
            maximumBodyBytes: 1024,
            requestBodyTimeoutMs: 1000,
            executionProbeIntervalMs: 100,
            maximumRateLimitIdentities: 16,
            executionRequestsPerMinute: 10,
            shutdownCutoffMs: 1000
        };
        createHttpServer(
            config,
            {
                execute: vi.fn(),
                isReady: () => true,
                beginShutdown: vi.fn(),
                killAllWorkers: vi.fn()
            },
            { createServer: () => server as never, log: () => undefined }
        );
        expect(listen).not.toHaveBeenCalled();
    });
});
