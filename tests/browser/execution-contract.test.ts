import { describe, expect, it } from 'vitest';
import {
    normalizeExecutionMode,
    normalizeExecutionTimeout,
    parseRunRequest
} from '../../src/SharpTS.Www.SelfHost/execution-contract';

describe('playground execution contract', () => {
    it('turns malformed JSON values into a safely rejectable request', () => {
        expect(parseRunRequest(null)).toEqual({ source: '' });
        expect(parseRunRequest('console.log(1)')).toEqual({ source: '' });
        expect(parseRunRequest({ source: 42, timeoutMs: 'slow', mode: false })).toEqual({
            source: ''
        });
    });

    it('preserves valid request fields without coercing untrusted values', () => {
        expect(parseRunRequest({
            source: 'console.log("safe");',
            timeoutMs: 2_500,
            mode: 'compile'
        })).toEqual({
            source: 'console.log("safe");',
            timeoutMs: 2_500,
            mode: 'compile'
        });
    });

    it('normalizes execution modes and clamps timeouts', () => {
        expect(normalizeExecutionMode(undefined)).toBe('interpret');
        expect(normalizeExecutionMode('COMPILE')).toBe('compile');
        expect(normalizeExecutionMode('native')).toBeNull();
        expect(normalizeExecutionTimeout(undefined)).toBe(5_000);
        expect(normalizeExecutionTimeout(1)).toBe(100);
        expect(normalizeExecutionTimeout(60_000)).toBe(10_000);
    });
});
