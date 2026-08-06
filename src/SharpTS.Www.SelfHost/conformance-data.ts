import * as fs from 'fs';
import * as path from 'path';
import { normalizeNewlines } from './site-html';

export type ConformanceMode = 'interpreted' | 'compiled';
export type ConformanceSuite = 'Test262' | 'TypeScript';

export interface ResultCounts {
    Pass: number;
    Fail: number;
    RuntimeError: number;
    ParseError: number;
    TypeCheckError: number;
    Timeout: number;
    HarnessError: number;
    Skipped: number;
}

export interface ConformanceNode {
    name: string;
    localizationKey: string | null;
    interpreted: ResultCounts | null;
    compiled: ResultCounts | null;
    children: ConformanceNode[];
}

export interface ConformanceProvenance {
    sharpTsRevision: string;
    test262Revision: string;
    typeScriptRevision: string;
}

export interface ConformanceData {
    formatVersion: number;
    provenance: ConformanceProvenance;
    roots: ConformanceNode[];
}

interface BaselineEntry {
    testPath: string;
    bucket: string;
}

export interface ParsedBaseline {
    corpusRevision: string;
    entries: BaselineEntry[];
}

interface MutableNode extends ConformanceNode {
    childMap: { [name: string]: MutableNode };
}

interface NodeIdentity {
    name: string;
    localizationKey: string | null;
}

const formatVersion = 1;
function fail(message: string): never {
    throw new Error('Conformance aggregation failed: ' + message);
}

function isAllowedBucket(suite: ConformanceSuite, bucket: string): boolean {
    if (bucket === 'Pass' || bucket === 'Fail' || bucket === 'ParseError' ||
        bucket === 'TypeCheckError' || bucket === 'HarnessError' || bucket === 'Skipped')
        return true;
    return suite === 'Test262' &&
        (bucket === 'RuntimeError' || bucket === 'Timeout');
}

function emptyCounts(): ResultCounts {
    return {
        Pass: 0,
        Fail: 0,
        RuntimeError: 0,
        ParseError: 0,
        TypeCheckError: 0,
        Timeout: 0,
        HarnessError: 0,
        Skipped: 0
    };
}

export function parseBaselineText(text: string, expectedSuite: ConformanceSuite,
    description: string): ParsedBaseline {
    const lines = normalizeNewlines(text).split('\n');
    const header = lines[0] || '';
    const headerMatch = /^# SharpTS baseline-format=(\d+) suite=(Test262|TypeScript) corpus=([0-9a-f]{40}) — /.exec(header);
    if (!headerMatch)
        fail(description + ' has a missing or malformed version header');
    const version = Number(headerMatch[1]);
    if (version !== formatVersion)
        fail(description + ' uses unsupported baseline format ' + version);
    if (headerMatch[2] !== expectedSuite)
        fail(description + ' declares suite ' + headerMatch[2] + ', expected ' + expectedSuite);

    const entries: BaselineEntry[] = [];
    const seen: { [testPath: string]: boolean } = {};
    for (let index = 1; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line)
            continue;
        if (line.startsWith('#'))
            fail(description + ' contains an unexpected comment on line ' + (index + 1));
        const match = /^(\S+)\s+(\S+)$/.exec(line);
        if (!match)
            fail(description + ' contains an unparseable line ' + (index + 1));
        const testPath = match[1];
        if (seen[testPath])
            fail(description + ' contains duplicate path ' + testPath);
        seen[testPath] = true;
        const bucket = match[2].split(':')[0];
        if (!isAllowedBucket(expectedSuite, bucket))
            fail(description + ' contains unknown bucket ' + match[2] + ' on line ' + (index + 1));
        if (expectedSuite === 'TypeScript' && bucket === 'Skipped' && match[2].indexOf(':') < 0)
            fail(description + ' contains Skipped without a reason on line ' + (index + 1));
        entries.push({ testPath, bucket });
    }
    if (entries.length === 0)
        fail(description + ' contains no results');
    return { corpusRevision: headerMatch[3], entries };
}

function category(name: string, localizationKey: string): NodeIdentity {
    return { name, localizationKey };
}

function codeName(name: string): NodeIdentity {
    return { name, localizationKey: null };
}

function general(): NodeIdentity {
    return category('General', 'Category_General');
}

function classifyTest262(testPath: string): NodeIdentity[] {
    const parts = testPath.split('/');
    if (parts.length < 4 || parts[0] !== 'test')
        fail('unexpected Test262 path ' + testPath);
    if (parts[1] === 'built-ins') {
        const area = parts[2];
        const directories = parts.slice(3, -1);
        let feature = directories.length > 0 ? directories[0] : '';
        if (feature === 'prototype' && directories.length > 1)
            feature = directories[1];
        return [category('Built-ins', 'Category_BuiltIns'), codeName(area), feature ? codeName(feature) : general()];
    }
    if (parts[1] === 'language') {
        const area = parts[2];
        const feature = parts.length > 4 ? parts[3] : '';
        return [category('Language', 'Category_Language'), codeName(area), feature ? codeName(feature) : general()];
    }
    return [codeName(parts[1]), codeName(parts[2]), parts.length > 4 ? codeName(parts[3]) : general()];
}

function classifyTypeScript(testPath: string): NodeIdentity[] {
    const prefix = 'tests/cases/conformance/';
    if (!testPath.startsWith(prefix))
        fail('unexpected TypeScript conformance path ' + testPath);
    const parts = testPath.slice(prefix.length).split('/');
    if (parts.length < 2)
        fail('unexpected TypeScript conformance path ' + testPath);
    if (parts[0] === 'types') {
        const area = parts.length > 2 ? parts[1] : 'types';
        const feature = parts.length > 3 ? parts[2] : '';
        return [category('Type system', 'Category_TypeSystem'), codeName(area), feature ? codeName(feature) : general()];
    }
    const feature = parts.length > 2 ? parts[1] : '';
    return [category('Type system', 'Category_TypeSystem'), codeName(parts[0]), feature ? codeName(feature) : general()];
}

function ensureNode(nodes: { [name: string]: MutableNode }, identity: NodeIdentity): MutableNode {
    const mapKey = 'node:' + identity.name;
    let node = nodes[mapKey];
    if (!node) {
        node = {
            name: identity.name,
            localizationKey: identity.localizationKey,
            interpreted: null,
            compiled: null,
            children: [],
            childMap: {}
        };
        nodes[mapKey] = node;
    }
    return node;
}

function addEntry(rootMap: { [name: string]: MutableNode }, pathParts: NodeIdentity[],
    mode: ConformanceMode, bucket: string): void {
    let level = rootMap;
    for (const identity of pathParts) {
        const node = ensureNode(level, identity);
        if (mode === 'interpreted') {
            let counts = node.interpreted;
            if (!counts) {
                counts = emptyCounts();
                node.interpreted = counts;
            }
            incrementCount(counts as ResultCounts, bucket);
        }
        else {
            let counts = node.compiled;
            if (!counts) {
                counts = emptyCounts();
                node.compiled = counts;
            }
            incrementCount(counts as ResultCounts, bucket);
        }
        level = node.childMap;
    }
}

function incrementCount(counts: ResultCounts, bucket: string): void {
    if (bucket === 'Pass') counts.Pass++;
    else if (bucket === 'Fail') counts.Fail++;
    else if (bucket === 'RuntimeError') counts.RuntimeError++;
    else if (bucket === 'ParseError') counts.ParseError++;
    else if (bucket === 'TypeCheckError') counts.TypeCheckError++;
    else if (bucket === 'Timeout') counts.Timeout++;
    else if (bucket === 'HarnessError') counts.HarnessError++;
    else if (bucket === 'Skipped') counts.Skipped++;
    else fail('cannot aggregate unknown bucket ' + bucket);
}

function finishNodes(map: { [name: string]: MutableNode }): ConformanceNode[] {
    return Object.keys(map).sort((left, right) => left.localeCompare(right)).map(key => {
        const mutable = map[key];
        mutable.children = finishNodes(mutable.childMap);
        return {
            name: mutable.name,
            localizationKey: mutable.localizationKey,
            interpreted: mutable.interpreted,
            compiled: mutable.compiled,
            children: mutable.children
        };
    });
}

function samePaths(left: ParsedBaseline, right: ParsedBaseline): boolean {
    if (left.entries.length !== right.entries.length)
        return false;
    const paths: { [testPath: string]: boolean } = {};
    for (const entry of left.entries) paths[entry.testPath] = true;
    for (const entry of right.entries) {
        if (paths[entry.testPath] !== true) return false;
    }
    return true;
}

function readSourceRevision(repoRoot: string): string {
    const sourcePath = path.join(repoRoot, 'sharpts-source.env');
    const lines = normalizeNewlines(String(fs.readFileSync(sourcePath, 'utf8'))).split('\n');
    for (const line of lines) {
        if (line.startsWith('SHARPTS_SOURCE_REVISION=')) {
            const revision = line.slice('SHARPTS_SOURCE_REVISION='.length);
            if (/^[0-9a-f]{40}$/.test(revision)) return revision;
        }
    }
    return fail('sharpts-source.env has no valid SHARPTS_SOURCE_REVISION');
}

export function loadConformanceData(repoRoot: string): ConformanceData {
    const test262Root = path.join(repoRoot, 'lib', 'SharpTS', 'SharpTS.Test262', 'baselines');
    const typeScriptRoot = path.join(repoRoot, 'lib', 'SharpTS', 'SharpTS.TypeScriptConformance', 'baselines');
    const interpreted = parseBaselineText(String(fs.readFileSync(path.join(test262Root, 'interpreted.txt'), 'utf8')),
        'Test262', 'Test262 interpreted baseline');
    const compiled = parseBaselineText(String(fs.readFileSync(path.join(test262Root, 'compiled.txt'), 'utf8')),
        'Test262', 'Test262 compiled baseline');
    const typeScript = parseBaselineText(String(fs.readFileSync(path.join(typeScriptRoot, 'interpreted.txt'), 'utf8')),
        'TypeScript', 'TypeScript interpreted baseline');
    if (interpreted.corpusRevision !== compiled.corpusRevision)
        fail('Test262 baselines declare different corpus revisions');
    if (!samePaths(interpreted, compiled))
        fail('Test262 interpreted and compiled baselines contain different test paths');

    const rootMap: { [name: string]: MutableNode } = {};
    for (const entry of interpreted.entries)
        addEntry(rootMap, classifyTest262(entry.testPath), 'interpreted', entry.bucket);
    for (const entry of compiled.entries)
        addEntry(rootMap, classifyTest262(entry.testPath), 'compiled', entry.bucket);
    for (const entry of typeScript.entries)
        addEntry(rootMap, classifyTypeScript(entry.testPath), 'interpreted', entry.bucket);

    return {
        formatVersion,
        provenance: {
            sharpTsRevision: readSourceRevision(repoRoot),
            test262Revision: interpreted.corpusRevision,
            typeScriptRevision: typeScript.corpusRevision
        },
        roots: finishNodes(rootMap)
    };
}

export function totalResults(counts: ResultCounts): number {
    return counts.Pass + counts.Fail + counts.RuntimeError + counts.ParseError +
        counts.TypeCheckError + counts.Timeout + counts.HarnessError + counts.Skipped;
}

export function eligibleResults(counts: ResultCounts): number {
    return totalResults(counts) - counts.Skipped;
}

export function passPercentage(counts: ResultCounts): number {
    const eligible = eligibleResults(counts);
    return eligible === 0 ? 0 : counts.Pass * 100 / eligible;
}
