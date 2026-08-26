import { describe, expect, it } from 'vitest';
import {
    budgetStatus,
    classifyRelativeSpeed,
    formatBytes,
    formatDuration,
    formatRatio,
    formatThroughput,
    geometricMean,
    loadPerformanceData,
    parsePerformanceSnapshot,
    relativeSpeed
} from '../../src/SharpTS.Www.SelfHost/performance-data';
import type { CrossRuntimeCase } from '../../src/SharpTS.Www.SelfHost/performance-data';
import path from 'node:path';

const revision = '0123456789abcdef0123456789abcdef01234567';
const schema = 'https://raw.githubusercontent.com/nickna/SharpTS/main/benchmarks/cross-runtime/snapshot-v1.schema.json';

function runtime(id: string, mean: number | null): Record<string, unknown> {
    return mean === null
        ? { id, status: 'missing', reason: 'unavailable' }
        : {
              id,
              status: 'measured',
              measurements: [
                  {
                      launch: 1,
                      mean,
                      minimum: mean * 0.9,
                      standardDeviation: mean * 0.1,
                      sampleCount: 10,
                      innerIterations: 2,
                      sampledDuration: 100
                  }
              ]
          };
}

function snapshot(): Record<string, unknown> {
    return {
        $schema: schema,
        schemaVersion: 1,
        run: {
            timestampUtc: '2026-08-26T00:00:00Z',
            revision: { commit: revision, dirty: false },
            environment: { operatingSystem: 'Test OS', architecture: 'x64', cpu: 'Test CPU', runner: 'fixture' },
            tools: {
                dotnet: '10.0.0',
                runtimes: [
                    { id: 'interpreter', selected: true, available: true, version: revision },
                    { id: 'compiled', selected: true, available: true, version: revision },
                    { id: 'node', selected: true, available: true, version: 'v24' },
                    { id: 'bun', selected: true, available: false, version: null }
                ]
            }
        },
        methodology: {
            harnessVersion: 1,
            id: 'performance-now-auto-batched-v1',
            timingScope: 'inProcessWorkload',
            clock: 'performance.now',
            includes: ['workload'],
            excludes: ['startup'],
            sampling: {
                warmupCapMilliseconds: 100,
                minimumSampleDurationMilliseconds: 1,
                targetDurationMilliseconds: 300,
                minimumSamples: 8,
                hardCapMilliseconds: 2000,
                maximumSamples: 100000
            }
        },
        cases: [
            {
                id: 'arrays/arrays?n=1000',
                family: 'arrays',
                name: 'arrays',
                parameters: { n: 1000 },
                unit: 'milliseconds',
                direction: 'lowerIsBetter',
                runtimes: [runtime('interpreter', 8), runtime('compiled', 2), runtime('node', 3), runtime('bun', null)]
            }
        ]
    };
}

describe('performance snapshot data', () => {
    it('loads the checked-in snapshot and keeps it tied to pinned SharpTS history', () => {
        const data = loadPerformanceData(path.resolve('.'));
        expect(data.crossRuntimeRuns).toHaveLength(1);
        expect(data.crossRuntimeRuns[0].snapshot.cases.length).toBeGreaterThan(20);
        expect(data.sourceRevision).toMatch(/^[0-9a-f]{40}$/);
        expect(data.compilerMicroRuns).toEqual([]);
        expect(data.guiRuns).toEqual([]);
    });

    it('validates the versioned snapshot and preserves missing runtimes', () => {
        const data = parsePerformanceSnapshot(snapshot(), revision);
        const benchmark = data.crossRuntimeRuns[0].snapshot.cases[0];
        expect(relativeSpeed(benchmark, 'compiled', 'node')).toBe(1.5);
        expect(relativeSpeed(benchmark, 'compiled', 'bun')).toBeNull();
        expect(benchmark.runtimes.find((candidate) => candidate.id === 'bun')).toMatchObject({
            status: 'missing',
            reason: 'unavailable'
        });
    });

    it('normalizes schema-v2 compiler and GUI runs without combining their environments', () => {
        const run = (suite: 'compiler-micro' | 'gui', implementation: string, budget: boolean) => ({
            suite,
            source: 'benchmarkDotNet',
            run: {
                timestampUtc: suite === 'compiler-micro' ? '2026-08-26T01:00:00Z' : '2026-08-26T02:00:00Z',
                revision: { commit: revision, dirty: false },
                environment: {
                    operatingSystem: suite + ' OS',
                    architecture: 'x64',
                    processor: suite + ' CPU',
                    runner: suite + ' runner'
                },
                tools: { dotnet: '10.0.0', benchmarkDotNet: '0.15.0' }
            },
            methodology: {
                id: suite + '-v1',
                sourceFormat: 'benchmarkdotnet-json-with-sharpts-metadata-v1',
                timingScope: 'in-process benchmark invocation',
                units: {
                    duration: 'nanoseconds',
                    allocation: 'bytes',
                    throughput: 'operationsPerSecond',
                    gc: 'collectionsPer1000Operations'
                }
            },
            cases: [
                {
                    id: 'arrays/run',
                    family: 'arrays',
                    method: 'run',
                    categories: [],
                    parameters: [],
                    implementation,
                    operationsPerInvoke: 1,
                    displayInfo: suite + ' arrays',
                    measurements: [
                        {
                            id: 'mean',
                            unit: 'nanoseconds',
                            direction: 'lowerIsBetter',
                            status: 'measured',
                            actual: suite === 'compiler-micro' ? 12 : 4,
                            ...(budget ? { budget: { limit: 5, sourceId: 'fixture-budget' } } : {})
                        }
                    ]
                }
            ]
        });
        const data = parsePerformanceSnapshot(
            {
                $schema:
                    'https://raw.githubusercontent.com/nickna/SharpTS/main/benchmarks/snapshots/snapshot-v2.schema.json',
                schemaVersion: 2,
                generatedAtUtc: '2026-08-26T03:00:00Z',
                runs: [run('compiler-micro', 'sharpTsCompiled', false), run('gui', 'sharpTsGui', true)]
            },
            revision
        );
        expect(data.compilerMicroRuns).toHaveLength(1);
        expect(data.guiRuns).toHaveLength(1);
        expect(data.compilerMicroRuns[0].run.environment.processor).toBe('compiler-micro CPU');
        expect(data.guiRuns[0].cases[0].measurements[0]).toMatchObject({
            actual: 4,
            budget: { limit: 5, sourceId: 'fixture-budget' }
        });
    });

    it('honors higher-is-better directionality', () => {
        const benchmark = {
            ...parsePerformanceSnapshot(snapshot(), revision).crossRuntimeRuns[0].snapshot.cases[0],
            unit: 'operationsPerSecond',
            direction: 'higherIsBetter'
        } as CrossRuntimeCase;
        expect(relativeSpeed(benchmark, 'compiled', 'node')).toBeCloseTo(2 / 3);
    });

    it('rejects unsupported schemas, mismatched revisions, dirty runs, invalid values, and duplicate IDs', () => {
        expect(() => parsePerformanceSnapshot({ ...snapshot(), schemaVersion: 9 }, revision)).toThrow(
            /unsupported schema/
        );
        expect(() => parsePerformanceSnapshot(snapshot(), 'f'.repeat(40))).toThrow(/not the pinned SharpTS revision/);
        const dirty = structuredClone(snapshot());
        ((dirty.run as Record<string, unknown>).revision as Record<string, unknown>).dirty = true;
        expect(() => parsePerformanceSnapshot(dirty, revision)).toThrow(/dirty SharpTS checkout/);
        const invalid = structuredClone(snapshot());
        (
            (((invalid.cases as unknown[])[0] as Record<string, unknown>).runtimes as unknown[])[0] as Record<
                string,
                unknown
            >
        ).measurements = [{ ...((runtime('compiled', 2).measurements as unknown[])[0] as object), mean: Number.NaN }];
        expect(() => parsePerformanceSnapshot(invalid, revision)).toThrow(/finite number/);
        const duplicate = structuredClone(snapshot());
        (duplicate.cases as unknown[]).push(structuredClone((duplicate.cases as unknown[])[0]));
        expect(() => parsePerformanceSnapshot(duplicate, revision)).toThrow(/duplicate ID/);
    });

    it('calculates practical parity and geometric summaries without averaging unlike run envelopes', () => {
        expect(classifyRelativeSpeed(1.06)).toBe('faster');
        expect(classifyRelativeSpeed(1.05)).toBe('nearParity');
        expect(classifyRelativeSpeed(0.95)).toBe('nearParity');
        expect(classifyRelativeSpeed(0.94)).toBe('behind');
        expect(geometricMean([0.5, 2])).toBe(1);
        expect(geometricMean([])).toBeNull();
        expect(() => geometricMean([1, 0])).toThrow(/positive and finite/);
    });

    it('calculates lower- and higher-is-better budgets', () => {
        expect(budgetStatus(80, 100, 'lowerIsBetter')).toEqual({ utilization: 0.8, headroom: 0.2, passes: true });
        expect(budgetStatus(120, 100, 'lowerIsBetter').passes).toBe(false);
        expect(budgetStatus(120, 100, 'higherIsBetter')).toEqual({
            utilization: 100 / 120,
            headroom: 0.2,
            passes: true
        });
    });

    it('formats ratios, durations, bytes, and throughput with raw values unchanged', () => {
        expect(formatRatio(1.234)).toBe('1.23×');
        expect(formatDuration(0.0012, 'milliseconds')).toBe('1.2 µs');
        expect(formatBytes(1536)).toBe('1.5 KiB');
        expect(formatThroughput(2_500_000)).toBe('2.5M ops/s');
    });
});
