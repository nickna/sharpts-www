import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeNewlines } from './site-html';

export type PerformanceDirection = 'lowerIsBetter' | 'higherIsBetter';
export type PerformanceUnit = 'milliseconds' | 'nanoseconds' | 'bytes' |
    'operationsPerSecond' | 'collectionsPer1000Operations';
export type RuntimeId = 'interpreter' | 'compiled' | 'node' | 'bun';
export type ComparisonClass = 'faster' | 'nearParity' | 'behind';

export const PRACTICAL_PARITY_TOLERANCE = 0.05;

export interface CrossRuntimeMeasurement {
    launch: number;
    mean: number;
    minimum: number;
    standardDeviation: number;
    sampleCount: number;
    innerIterations: number;
    sampledDuration: number;
}

export interface CrossRuntimeResult {
    id: RuntimeId;
    status: 'measured' | 'missing';
    measurements?: CrossRuntimeMeasurement[];
    reason?: string;
}

export interface CrossRuntimeCase {
    id: string;
    family: string;
    name: string;
    parameters: { n: number };
    unit: 'milliseconds' | 'bytes' | 'operationsPerSecond';
    direction: PerformanceDirection;
    runtimes: CrossRuntimeResult[];
}

export interface Revision {
    commit: string;
    dirty: boolean;
}

export interface CrossRuntimeSnapshot {
    $schema: string;
    schemaVersion: 1;
    run: {
        timestampUtc: string;
        revision: Revision;
        environment: {
            operatingSystem: string;
            architecture: string;
            cpu: string;
            runner: string;
        };
        tools: {
            dotnet: string;
            runtimes: Array<{
                id: RuntimeId;
                selected: boolean;
                available: boolean;
                version: string | null;
            }>;
        };
    };
    methodology: {
        harnessVersion: number;
        id: string;
        timingScope: string;
        clock: string;
        includes: string[];
        excludes: string[];
        sampling: {
            warmupCapMilliseconds: number;
            minimumSampleDurationMilliseconds: number;
            targetDurationMilliseconds: number;
            minimumSamples: number;
            hardCapMilliseconds: number;
            maximumSamples: number;
        };
    };
    cases: CrossRuntimeCase[];
}

export interface NormalizedMeasurement {
    id: string;
    unit: Exclude<PerformanceUnit, 'milliseconds'>;
    direction: PerformanceDirection;
    status: 'measured' | 'missing';
    actual?: number;
    reason?: string;
    budget?: { limit: number; sourceId: string };
}

export interface NormalizedBenchmarkCase {
    id: string;
    family: string;
    method: string;
    categories: string[];
    parameters: Array<{ name: string; value: string | number | boolean | null }>;
    implementation: string;
    operationsPerInvoke: number;
    displayInfo: string;
    statistics?: {
        status: 'measured' | 'missing';
        sampleCount?: number;
        meanNanoseconds?: number;
        minimumNanoseconds?: number;
        maximumNanoseconds?: number;
        standardDeviationNanoseconds?: number;
        originalValuesNanoseconds?: number[];
        reason?: string;
    };
    measurements: NormalizedMeasurement[];
}

export interface NormalizedRun {
    suite: 'compiler-micro' | 'gui';
    source: 'benchmarkDotNet' | 'nativeAotPackaging';
    run: {
        timestampUtc: string;
        revision: Revision;
        environment: {
            operatingSystem: string;
            architecture: string;
            processor: string;
            runner: string;
            benchmarkDotNetHost?: Record<string, unknown>;
        };
        tools: Record<string, string>;
    };
    methodology: {
        id: string;
        sourceFormat: string;
        timingScope: string;
        units: Record<string, string>;
        budgetContract?: { path: string; schemaVersion: number };
    };
    cases: NormalizedBenchmarkCase[];
}

export interface PerformanceData {
    formatVersion: 1;
    sourceRevision: string;
    generatedAtUtc: string;
    practicalParityTolerance: number;
    crossRuntimeRuns: Array<{ suite: 'cross-runtime'; source: 'snapshot-v1'; snapshot: CrossRuntimeSnapshot }>;
    compilerMicroRuns: NormalizedRun[];
    guiRuns: NormalizedRun[];
}

type RevisionMatcher = (candidate: string, expected: string) => boolean;

const crossRuntimeSchema =
    'https://raw.githubusercontent.com/nickna/SharpTS/main/benchmarks/cross-runtime/snapshot-v1.schema.json';
const publicSchema =
    'https://raw.githubusercontent.com/nickna/SharpTS/main/benchmarks/snapshots/snapshot-v2.schema.json';
const revisionPattern = /^[0-9a-f]{40}$/;
const casePattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\?n=[0-9.eE+-]+$/;
const normalizedCasePattern = /^[a-z0-9][a-z0-9%.-]*\/[a-z0-9][a-z0-9%.-]*(\?.+)?$/;

function fail(message: string): never {
    throw new Error('Performance snapshot validation failed: ' + message);
}

function record(value: unknown, description: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        fail(description + ' must be an object');
    return value as Record<string, unknown>;
}

function array(value: unknown, description: string): unknown[] {
    if (!Array.isArray(value) || value.length === 0)
        fail(description + ' must be a non-empty array');
    return value as unknown[];
}

function string(value: unknown, description: string): string {
    if (typeof value !== 'string' || value.length === 0)
        fail(description + ' must be a non-empty string');
    return value as string;
}

function finite(value: unknown, description: string, minimum: number = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)
        fail(description + ' must be a finite number >= ' + minimum);
    return value as number;
}

function integer(value: unknown, description: string, minimum: number = 1): number {
    const result = finite(value, description, minimum);
    if (!Number.isInteger(result)) fail(description + ' must be an integer');
    return result;
}

function date(value: unknown, description: string): string {
    const result = string(value, description);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(result))
        fail(description + ' must be an ISO date-time');
    return result;
}

function revision(value: unknown, description: string, expected: string, matches: RevisionMatcher): Revision {
    const result = record(value, description);
    const commit = string(result.commit, description + '.commit');
    if (!revisionPattern.test(commit)) fail(description + '.commit must be a lowercase 40-character SHA');
    if (typeof result.dirty !== 'boolean') fail(description + '.dirty must be boolean');
    if (result.dirty) fail(description + ' records a dirty SharpTS checkout');
    if (!matches(commit, expected))
        fail(description + '.commit ' + commit + ' is not the pinned SharpTS revision ' + expected +
            ' or one of its ancestors');
    return { commit, dirty: false };
}

function direction(value: unknown, description: string): PerformanceDirection {
    if (value !== 'lowerIsBetter' && value !== 'higherIsBetter')
        fail(description + ' has unsupported direction ' + String(value));
    return value as PerformanceDirection;
}

function uniqueStrings(values: unknown, description: string): string[] {
    if (!Array.isArray(values)) fail(description + ' must be an array');
    const result = values.map((value, index) => string(value, description + '[' + index + ']'));
    if (new Set(result).size !== result.length) fail(description + ' contains duplicates');
    return result;
}

function runtimeId(value: unknown, description: string): RuntimeId {
    if (value !== 'interpreter' && value !== 'compiled' && value !== 'node' && value !== 'bun')
        fail(description + ' has unsupported runtime ' + String(value));
    return value as RuntimeId;
}

function validateCrossRuntimeSnapshot(value: unknown, expectedRevision: string,
    matches: RevisionMatcher): CrossRuntimeSnapshot {
    const snapshot = record(value, 'cross-runtime snapshot');
    if (snapshot.$schema !== crossRuntimeSchema || snapshot.schemaVersion !== 1)
        fail('cross-runtime snapshot uses an unsupported schema');
    const run = record(snapshot.run, 'cross-runtime run');
    date(run.timestampUtc, 'cross-runtime run.timestampUtc');
    revision(run.revision, 'cross-runtime run.revision', expectedRevision, matches);
    const environment = record(run.environment, 'cross-runtime run.environment');
    for (const key of ['operatingSystem', 'architecture', 'cpu', 'runner'])
        string(environment[key], 'cross-runtime run.environment.' + key);
    const tools = record(run.tools, 'cross-runtime run.tools');
    string(tools.dotnet, 'cross-runtime run.tools.dotnet');
    const toolRuntimes = array(tools.runtimes, 'cross-runtime run.tools.runtimes');
    if (toolRuntimes.length !== 4) fail('cross-runtime tools must describe exactly four runtimes');
    const toolIds = toolRuntimes.map((entry, index) => {
        const tool = record(entry, 'cross-runtime runtime tool ' + index);
        const id = runtimeId(tool.id, 'cross-runtime runtime tool ' + index);
        if (typeof tool.selected !== 'boolean' || typeof tool.available !== 'boolean')
            fail('cross-runtime runtime tool ' + id + ' has invalid availability flags');
        if (tool.version !== null && typeof tool.version !== 'string')
            fail('cross-runtime runtime tool ' + id + ' has invalid version');
        return id;
    });
    if (new Set(toolIds).size !== toolIds.length) fail('cross-runtime tools contain duplicate runtime IDs');
    const methodology = record(snapshot.methodology, 'cross-runtime methodology');
    const supportedHarness =
        (methodology.harnessVersion === 1 && methodology.id === 'performance-now-auto-batched-v1') ||
        (methodology.harnessVersion === 2 && methodology.id === 'performance-now-confirmed-probe-auto-batched-v2');
    if (!supportedHarness ||
        methodology.timingScope !== 'inProcessWorkload' || methodology.clock !== 'performance.now')
        fail('cross-runtime methodology uses an unsupported timing contract');
    uniqueStrings(methodology.includes, 'cross-runtime methodology.includes');
    uniqueStrings(methodology.excludes, 'cross-runtime methodology.excludes');
    const sampling = record(methodology.sampling, 'cross-runtime methodology.sampling');
    finite(sampling.warmupCapMilliseconds, 'cross-runtime sampling.warmupCapMilliseconds');
    finite(sampling.minimumSampleDurationMilliseconds, 'cross-runtime sampling.minimumSampleDurationMilliseconds',
        1e-300);
    finite(sampling.targetDurationMilliseconds, 'cross-runtime sampling.targetDurationMilliseconds', 1e-300);
    integer(sampling.minimumSamples, 'cross-runtime sampling.minimumSamples');
    finite(sampling.hardCapMilliseconds, 'cross-runtime sampling.hardCapMilliseconds', 1e-300);
    integer(sampling.maximumSamples, 'cross-runtime sampling.maximumSamples');
    const cases = array(snapshot.cases, 'cross-runtime cases');
    const caseIds = new Set<string>();
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        const benchmark = record(cases[caseIndex], 'cross-runtime case ' + caseIndex);
        const id = string(benchmark.id, 'cross-runtime case id');
        if (!casePattern.test(id)) fail('cross-runtime case has invalid stable ID ' + id);
        if (caseIds.has(id)) fail('cross-runtime cases contain duplicate ID ' + id);
        caseIds.add(id);
        string(benchmark.family, id + '.family');
        string(benchmark.name, id + '.name');
        const parameters = record(benchmark.parameters, id + '.parameters');
        finite(parameters.n, id + '.parameters.n');
        if (benchmark.unit !== 'milliseconds' && benchmark.unit !== 'bytes' &&
            benchmark.unit !== 'operationsPerSecond')
            fail(id + ' has unsupported unit ' + String(benchmark.unit));
        direction(benchmark.direction, id + '.direction');
        const runtimeEntries = array(benchmark.runtimes, id + '.runtimes');
        if (runtimeEntries.length !== 4) fail(id + ' must contain exactly four runtime records');
        const seenRuntimes = new Set<string>();
        for (const entry of runtimeEntries) {
            const runtime = record(entry, id + ' runtime');
            const runtimeName = runtimeId(runtime.id, id + ' runtime.id');
            if (seenRuntimes.has(runtimeName)) fail(id + ' contains duplicate runtime ' + runtimeName);
            seenRuntimes.add(runtimeName);
            if (runtime.status === 'missing') {
                string(runtime.reason, id + ' ' + runtimeName + '.reason');
                continue;
            }
            if (runtime.status !== 'measured') fail(id + ' ' + runtimeName + ' has invalid status');
            const measurements = array(runtime.measurements, id + ' ' + runtimeName + '.measurements');
            for (const measurementValue of measurements) {
                const measurement = record(measurementValue, id + ' ' + runtimeName + ' measurement');
                integer(measurement.launch, id + '.launch');
                finite(measurement.mean, id + '.mean');
                finite(measurement.minimum, id + '.minimum');
                finite(measurement.standardDeviation, id + '.standardDeviation');
                integer(measurement.sampleCount, id + '.sampleCount');
                integer(measurement.innerIterations, id + '.innerIterations');
                finite(measurement.sampledDuration, id + '.sampledDuration');
            }
        }
    }
    return value as CrossRuntimeSnapshot;
}

function validateNormalizedRun(value: unknown, expectedRevision: string,
    matches: RevisionMatcher): NormalizedRun {
    const normalized = record(value, 'normalized run');
    if (normalized.suite !== 'compiler-micro' && normalized.suite !== 'gui')
        fail('normalized run has unsupported suite ' + String(normalized.suite));
    if (normalized.source !== 'benchmarkDotNet' && normalized.source !== 'nativeAotPackaging')
        fail('normalized run has unsupported source ' + String(normalized.source));
    if (normalized.suite === 'compiler-micro' && normalized.source !== 'benchmarkDotNet')
        fail('compiler-micro run must use BenchmarkDotNet evidence');
    const run = record(normalized.run, normalized.suite + ' run');
    date(run.timestampUtc, normalized.suite + ' run.timestampUtc');
    revision(run.revision, normalized.suite + ' run.revision', expectedRevision, matches);
    const environment = record(run.environment, normalized.suite + ' run.environment');
    for (const key of ['operatingSystem', 'architecture', 'processor', 'runner'])
        string(environment[key], normalized.suite + ' run.environment.' + key);
    const tools = record(run.tools, normalized.suite + ' run.tools');
    string(tools.dotnet, normalized.suite + ' run.tools.dotnet');
    const methodology = record(normalized.methodology, normalized.suite + ' methodology');
    for (const key of ['id', 'sourceFormat', 'timingScope'])
        string(methodology[key], normalized.suite + ' methodology.' + key);
    const units = record(methodology.units, normalized.suite + ' methodology.units');
    if (units.duration !== 'nanoseconds' || units.allocation !== 'bytes' ||
        units.throughput !== 'operationsPerSecond' || units.gc !== 'collectionsPer1000Operations')
        fail(normalized.suite + ' methodology has unsupported canonical units');
    if (methodology.budgetContract !== undefined) {
        const contract = record(methodology.budgetContract, normalized.suite + ' methodology.budgetContract');
        string(contract.path, normalized.suite + ' methodology.budgetContract.path');
        integer(contract.schemaVersion, normalized.suite + ' methodology.budgetContract.schemaVersion');
    }
    const cases = array(normalized.cases, normalized.suite + ' cases');
    const seenCases = new Set<string>();
    for (let index = 0; index < cases.length; index++) {
        const benchmark = record(cases[index], normalized.suite + ' case ' + index);
        const id = string(benchmark.id, normalized.suite + ' case id');
        if (!normalizedCasePattern.test(id)) fail(normalized.suite + ' case has invalid stable ID ' + id);
        if (seenCases.has(id)) fail(normalized.suite + ' cases contain duplicate ID ' + id);
        seenCases.add(id);
        string(benchmark.family, id + '.family');
        string(benchmark.method, id + '.method');
        uniqueStrings(benchmark.categories, id + '.categories');
        if (!Array.isArray(benchmark.parameters)) fail(id + '.parameters must be an array');
        const parameterNames = new Set<string>();
        for (const value of benchmark.parameters) {
            const parameter = record(value, id + ' parameter');
            const name = string(parameter.name, id + ' parameter.name');
            if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(id + ' has invalid parameter name ' + name);
            if (parameterNames.has(name)) fail(id + ' contains duplicate parameter ' + name);
            parameterNames.add(name);
            if (parameter.value !== null && typeof parameter.value !== 'string' &&
                typeof parameter.value !== 'number' && typeof parameter.value !== 'boolean')
                fail(id + ' parameter ' + name + ' has unsupported value');
            if (typeof parameter.value === 'number') finite(parameter.value, id + ' parameter ' + name);
        }
        string(benchmark.implementation, id + '.implementation');
        integer(benchmark.operationsPerInvoke, id + '.operationsPerInvoke');
        string(benchmark.displayInfo, id + '.displayInfo');
        if (benchmark.statistics !== undefined) {
            const statistics = record(benchmark.statistics, id + '.statistics');
            if (statistics.status === 'measured') {
                integer(statistics.sampleCount, id + '.statistics.sampleCount');
                finite(statistics.meanNanoseconds, id + '.statistics.meanNanoseconds');
                finite(statistics.minimumNanoseconds, id + '.statistics.minimumNanoseconds');
                finite(statistics.maximumNanoseconds, id + '.statistics.maximumNanoseconds');
                finite(statistics.standardDeviationNanoseconds, id + '.statistics.standardDeviationNanoseconds');
                const originals = array(statistics.originalValuesNanoseconds,
                    id + '.statistics.originalValuesNanoseconds');
                for (const original of originals) finite(original, id + '.statistics original value');
            } else if (statistics.status === 'missing') {
                string(statistics.reason, id + '.statistics.reason');
            } else {
                fail(id + '.statistics has invalid status');
            }
        }
        const measurements = array(benchmark.measurements, id + '.measurements');
        const measurementIds = new Set<string>();
        for (const value of measurements) {
            const measurement = record(value, id + ' measurement');
            const measurementId = string(measurement.id, id + ' measurement.id');
            if (measurementIds.has(measurementId)) fail(id + ' contains duplicate measurement ' + measurementId);
            measurementIds.add(measurementId);
            if (measurement.unit !== 'nanoseconds' && measurement.unit !== 'operationsPerSecond' &&
                measurement.unit !== 'bytes' && measurement.unit !== 'collectionsPer1000Operations')
                fail(id + ' measurement ' + measurementId + ' has unsupported unit');
            direction(measurement.direction, id + ' measurement ' + measurementId + '.direction');
            if (measurement.status === 'measured')
                finite(measurement.actual, id + ' measurement ' + measurementId + '.actual');
            else if (measurement.status === 'missing')
                string(measurement.reason, id + ' measurement ' + measurementId + '.reason');
            else
                fail(id + ' measurement ' + measurementId + ' has invalid status');
            if (measurement.budget !== undefined) {
                const budget = record(measurement.budget, id + ' measurement ' + measurementId + '.budget');
                finite(budget.limit, id + ' measurement ' + measurementId + '.budget.limit');
                string(budget.sourceId, id + ' measurement ' + measurementId + '.budget.sourceId');
            }
        }
    }
    return value as NormalizedRun;
}

export function parsePerformanceSnapshot(value: unknown, expectedRevision: string,
    matches: RevisionMatcher = (candidate, expected) => candidate === expected): PerformanceData {
    if (!revisionPattern.test(expectedRevision))
        fail('expected SharpTS revision must be a lowercase 40-character SHA');
    const root = record(value, 'snapshot root');
    if (root.$schema === crossRuntimeSchema && root.schemaVersion === 1) {
        const snapshot = validateCrossRuntimeSnapshot(value, expectedRevision, matches);
        return {
            formatVersion: 1,
            sourceRevision: expectedRevision,
            generatedAtUtc: snapshot.run.timestampUtc,
            practicalParityTolerance: PRACTICAL_PARITY_TOLERANCE,
            crossRuntimeRuns: [{ suite: 'cross-runtime', source: 'snapshot-v1', snapshot }],
            compilerMicroRuns: [],
            guiRuns: []
        };
    }
    if (root.$schema !== publicSchema || root.schemaVersion !== 2)
        fail('snapshot root uses an unsupported schema version');
    const generatedAtUtc = date(root.generatedAtUtc, 'snapshot root.generatedAtUtc');
    const runs = array(root.runs, 'snapshot root.runs');
    const crossRuntimeRuns: PerformanceData['crossRuntimeRuns'] = [];
    const compilerMicroRuns: NormalizedRun[] = [];
    const guiRuns: NormalizedRun[] = [];
    const runIds = new Set<string>();
    for (const value of runs) {
        const run = record(value, 'snapshot run');
        let timestamp: string;
        let commit: string;
        if (run.suite === 'cross-runtime') {
            if (run.source !== 'snapshot-v1') fail('cross-runtime run has unsupported source');
            const snapshot = validateCrossRuntimeSnapshot(run.snapshot, expectedRevision, matches);
            crossRuntimeRuns.push({ suite: 'cross-runtime', source: 'snapshot-v1', snapshot });
            timestamp = snapshot.run.timestampUtc;
            commit = snapshot.run.revision.commit;
        } else {
            const normalized = validateNormalizedRun(value, expectedRevision, matches);
            if (normalized.suite === 'compiler-micro') compilerMicroRuns.push(normalized);
            else guiRuns.push(normalized);
            timestamp = normalized.run.timestampUtc;
            commit = normalized.run.revision.commit;
        }
        const identity = String(run.suite) + ':' + timestamp + ':' + commit;
        if (runIds.has(identity)) fail('snapshot contains duplicate run identity ' + identity);
        runIds.add(identity);
    }
    return {
        formatVersion: 1,
        sourceRevision: expectedRevision,
        generatedAtUtc,
        practicalParityTolerance: PRACTICAL_PARITY_TOLERANCE,
        crossRuntimeRuns,
        compilerMicroRuns,
        guiRuns
    };
}

function readSourceRevision(repoRoot: string): string {
    const source = normalizeNewlines(String(fs.readFileSync(path.join(repoRoot, 'sharpts-source.env'), 'utf8')));
    const match = /^SHARPTS_SOURCE_REVISION=([0-9a-f]{40})$/m.exec(source);
    if (!match) fail('sharpts-source.env has no valid SHARPTS_SOURCE_REVISION');
    return match[1];
}

function isPinnedHistory(repoRoot: string, candidate: string, expected: string): boolean {
    if (candidate === expected) return true;
    try {
        execFileSync('git', ['-c', `safe.directory=${path.join(repoRoot, 'lib', 'SharpTS')}`,
            '-C', path.join(repoRoot, 'lib', 'SharpTS'), 'merge-base', '--is-ancestor', candidate, expected],
        { cwd: repoRoot, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export function loadPerformanceData(repoRoot: string): PerformanceData {
    const sharpTsRoot = path.join(repoRoot, 'lib', 'SharpTS');
    const publicPath = path.join(sharpTsRoot, 'benchmarks', 'snapshots', 'public-snapshot.json');
    const crossRuntimePath = path.join(sharpTsRoot, 'benchmarks', 'cross-runtime', 'snapshots', 'latest.json');
    const snapshotPath = fs.existsSync(publicPath) ? publicPath : crossRuntimePath;
    if (!fs.existsSync(snapshotPath)) fail('no checked-in benchmark snapshot found at ' + snapshotPath);
    let value: unknown;
    try {
        value = JSON.parse(String(fs.readFileSync(snapshotPath, 'utf8')));
    } catch (error) {
        fail('cannot parse ' + snapshotPath + ': ' + String(error));
    }
    const expectedRevision = readSourceRevision(repoRoot);
    return parsePerformanceSnapshot(value, expectedRevision,
        (candidate, expected) => isPinnedHistory(repoRoot, candidate, expected));
}

export function runtimeMeasurement(benchmark: CrossRuntimeCase, runtime: RuntimeId): CrossRuntimeMeasurement | null {
    const result = benchmark.runtimes.find(candidate => candidate.id === runtime);
    // biome-ignore lint/complexity/useOptionalChain: explicit narrowing is required by the self-host compiler.
    if (!result || result.status !== 'measured') return null;
    const measurements = result.measurements;
    return measurements && measurements.length > 0 ? measurements[0] : null;
}

export function relativeSpeed(benchmark: CrossRuntimeCase, implementation: RuntimeId,
    reference: RuntimeId): number | null {
    const actual = runtimeMeasurement(benchmark, implementation)?.mean;
    const baseline = runtimeMeasurement(benchmark, reference)?.mean;
    if (actual === undefined || baseline === undefined || actual <= 0 || baseline <= 0) return null;
    return benchmark.direction === 'lowerIsBetter' ? baseline / actual : actual / baseline;
}

export function classifyRelativeSpeed(ratio: number,
    tolerance: number = PRACTICAL_PARITY_TOLERANCE): ComparisonClass {
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Relative speed must be a positive finite number.');
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance >= 1)
        throw new Error('Parity tolerance must be between zero and one.');
    if (ratio > 1 + tolerance) return 'faster';
    if (ratio < 1 - tolerance) return 'behind';
    return 'nearParity';
}

export function geometricMean(values: number[]): number | null {
    if (values.length === 0) return null;
    if (values.some(value => !Number.isFinite(value) || value <= 0))
        throw new Error('Geometric mean values must be positive and finite.');
    return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

export interface BudgetStatus {
    utilization: number;
    headroom: number;
    passes: boolean;
}

export function budgetStatus(actual: number, limit: number, valueDirection: PerformanceDirection): BudgetStatus {
    if (!Number.isFinite(actual) || !Number.isFinite(limit) || actual < 0 || limit <= 0)
        throw new Error('Budget actual and limit must be finite, with a positive limit.');
    const utilization = valueDirection === 'lowerIsBetter' ? actual / limit : limit / Math.max(actual, 2.220446049250313e-16);
    const headroom = valueDirection === 'lowerIsBetter' ? (limit - actual) / limit : (actual - limit) / limit;
    return { utilization, headroom, passes: valueDirection === 'lowerIsBetter' ? actual <= limit : actual >= limit };
}

export function formatRatio(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '—';
    const digits = value >= 10 ? 1 : 2;
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + '×';
}

export function formatDuration(value: number, unit: 'milliseconds' | 'nanoseconds'): string {
    if (!Number.isFinite(value) || value < 0) return '—';
    const nanoseconds = unit === 'milliseconds' ? value * 1_000_000 : value;
    if (nanoseconds < 1_000) return formatNumber(nanoseconds) + ' ns';
    if (nanoseconds < 1_000_000) return formatNumber(nanoseconds / 1_000) + ' µs';
    if (nanoseconds < 1_000_000_000) return formatNumber(nanoseconds / 1_000_000) + ' ms';
    return formatNumber(nanoseconds / 1_000_000_000) + ' s';
}

export function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value < 0) return '—';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let scaled = value;
    let index = 0;
    while (scaled >= 1024 && index < units.length - 1) {
        scaled /= 1024;
        index++;
    }
    return formatNumber(scaled) + ' ' + units[index];
}

export function formatThroughput(value: number): string {
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 1_000_000_000) return formatNumber(value / 1_000_000_000) + 'B ops/s';
    if (value >= 1_000_000) return formatNumber(value / 1_000_000) + 'M ops/s';
    if (value >= 1_000) return formatNumber(value / 1_000) + 'K ops/s';
    return formatNumber(value) + ' ops/s';
}

export function formatMeasurement(value: number, unit: PerformanceUnit): string {
    if (unit === 'milliseconds' || unit === 'nanoseconds') return formatDuration(value, unit);
    if (unit === 'bytes') return formatBytes(value);
    if (unit === 'operationsPerSecond') return formatThroughput(value);
    return formatNumber(value) + ' collections / 1k ops';
}

function formatNumber(value: number): string {
    if (value === 0) return '0';
    const maximumFractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    // biome-ignore lint/style/useExponentiationOperator: Math.pow is supported by the self-host runtime.
    const factor = Math.pow(10, maximumFractionDigits);
    let formatted = (Math.round(value * factor) / factor).toFixed(maximumFractionDigits)
        .replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    if (value >= 1000) {
        const parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formatted = parts.join('.');
    }
    return formatted;
}

export function humanizeBenchmarkId(value: string): string {
    const withoutParameters = value.split('?')[0].split('/').pop() || value;
    return withoutParameters.split('-').filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
