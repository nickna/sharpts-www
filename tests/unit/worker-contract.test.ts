import { describe, expect, it } from 'vitest';
import { serializeWorkerMessage } from '../../src/SharpTS.Www.Shared/execution-contract';
import { aggregateTimings, normalizeWorkerResponse } from '../../src/SharpTS.Www.SelfHost/supervisor';

describe('worker protocol serialization', () => {
    it('round-trips Unicode through an ASCII-only wire message', () => {
        const payload = {
            Source: 'console.log("✓ TypeScript — 你好 🌍");',
            TimeoutMs: 5_000,
            Mode: 'interpret'
        };

        const message = serializeWorkerMessage(payload);

        expect(Array.from(message).every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
        expect(message).toContain('\\u2713');
        expect(JSON.parse(message)).toEqual(payload);
    });
});

describe('worker response normalization', () => {
    it('maps the expanded worker payload and uses outer aggregates for compiled overhead', () => {
        expect(
            normalizeWorkerResponse(
                {
                    Success: true,
                    Output: 'hello\n',
                    Errors: [],
                    ExecutionTimeMs: 3,
                    CompileTimeMs: 40,
                    Timings: [
                        { Name: 'tokenize', DurationMs: 1.25, Status: 'completed' },
                        { Name: 'validateModules', DurationMs: 0.5, Status: 'completed' },
                        { Name: 'analyzeDeadCode', DurationMs: 4.5, Status: 'completed' },
                        { Name: 'serializeAssembly', DurationMs: 5, Status: 'completed' },
                        { Name: 'load', DurationMs: 0.5, Status: 'completed' },
                        { Name: 'execute', DurationMs: 0.25, Status: 'completed' }
                    ]
                },
                60,
                2
            )
        ).toEqual({
            success: true,
            output: 'hello\n',
            errors: [],
            executionTimeMs: 3,
            compileTimeMs: 40,
            timings: {
                serverDurationMs: 62,
                phases: [
                    { name: 'queue', durationMs: 2, status: 'completed' },
                    { name: 'isolatedWorker', durationMs: 17, status: 'completed' },
                    { name: 'tokenize', durationMs: 1.25, status: 'completed' },
                    { name: 'validateModules', durationMs: 0.5, status: 'completed' },
                    { name: 'analyzeDeadCode', durationMs: 4.5, status: 'completed' },
                    { name: 'serializeAssembly', durationMs: 5, status: 'completed' },
                    { name: 'load', durationMs: 0.5, status: 'completed' },
                    { name: 'execute', durationMs: 0.25, status: 'completed' }
                ]
            }
        });
    });

    it('rejects malformed or non-finite payload fields', () => {
        const response = normalizeWorkerResponse(
            {
                Success: true,
                Output: 'unsafe',
                Errors: [],
                ExecutionTimeMs: Number.NaN,
                CompileTimeMs: null,
                Timings: []
            },
            17
        );

        expect(response.success).toBe(false);
        expect(response.executionTimeMs).toBe(0);
        expect(response.errors[0].message).toMatch(/invalid worker response/);
        expect(response.timings?.phases).toEqual([
            { name: 'queue', durationMs: 0, status: 'completed' },
            { name: 'isolatedWorker', durationMs: 17, status: 'failed' }
        ]);
    });

    it('rejects non-finite phase values', () => {
        const response = normalizeWorkerResponse(
            {
                Success: true,
                Output: '',
                Errors: [],
                ExecutionTimeMs: 1,
                CompileTimeMs: null,
                Timings: [{ Name: 'execute', DurationMs: Number.POSITIVE_INFINITY, Status: 'completed' }]
            },
            8
        );

        expect(response.success).toBe(false);
        expect(response.timings?.phases[1]).toMatchObject({ name: 'isolatedWorker', status: 'failed' });
    });

    it('replaces network sentinel details with a stable message', () => {
        const response = normalizeWorkerResponse(
            {
                Success: false,
                Output: '',
                Errors: [{ Message: 'fetch sharpts-network-blocked.invalid failed' }],
                ExecutionTimeMs: 3,
                CompileTimeMs: null,
                Timings: [{ Name: 'execute', DurationMs: 3, Status: 'failed' }]
            },
            17
        );

        expect(response.errors[0].message).toMatch(/Network access is disabled/);
        expect(response.errors[0].message).not.toContain('invalid');
    });

    it('uses an explicit SharpTS aggregate without requiring granular phases to add up', () => {
        expect(
            aggregateTimings(
                [
                    { name: 'tokenize', durationMs: 4, status: 'completed' },
                    { name: 'execute', durationMs: 9, status: 'completed' }
                ],
                3,
                20,
                'completed',
                15
            )
        ).toEqual({
            serverDurationMs: 23,
            phases: [
                { name: 'queue', durationMs: 3, status: 'completed' },
                { name: 'isolatedWorker', durationMs: 5, status: 'completed' },
                { name: 'tokenize', durationMs: 4, status: 'completed' },
                { name: 'execute', durationMs: 9, status: 'completed' }
            ]
        });
    });
});
