import { describe, expect, it } from 'vitest';
import { serializeWorkerMessage } from '../../src/SharpTS.Www.Shared/execution-contract';
import { normalizeWorkerResponse } from '../../src/SharpTS.Www.SelfHost/supervisor';

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
    it('maps a valid worker payload without coercion', () => {
        expect(
            normalizeWorkerResponse(
                {
                    Success: true,
                    Output: 'hello\n',
                    Errors: [],
                    ExecutionTimeMs: 0,
                    CompileTimeMs: 4
                },
                99
            )
        ).toEqual({
            success: true,
            output: 'hello\n',
            errors: [],
            executionTimeMs: 0,
            compileTimeMs: 4
        });
    });

    it('rejects malformed or non-finite payload fields', () => {
        const response = normalizeWorkerResponse(
            {
                Success: true,
                Output: 'unsafe',
                Errors: [],
                ExecutionTimeMs: Number.NaN,
                CompileTimeMs: null
            },
            17
        );

        expect(response.success).toBe(false);
        expect(response.executionTimeMs).toBe(17);
        expect(response.errors[0].message).toMatch(/invalid worker response/);
    });

    it('replaces network sentinel details with a stable message', () => {
        const response = normalizeWorkerResponse(
            {
                Success: false,
                Output: '',
                Errors: [{ Message: 'fetch sharpts-network-blocked.invalid failed' }],
                ExecutionTimeMs: 3,
                CompileTimeMs: null
            },
            17
        );

        expect(response.errors[0].message).toMatch(/Network access is disabled/);
        expect(response.errors[0].message).not.toContain('invalid');
    });
});
