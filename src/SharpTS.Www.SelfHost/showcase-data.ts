export interface ShowcaseExample {
    key: string;
    source: string;
    expectedOutput: string;
    expectedOutputIncludes: string[];
    executionSurface: 'worker' | 'cli';
}

export const showcaseExamples: ShowcaseExample[] = [
    {
        key: 'Ex1',
        source: [
            'const greeting: string = "Hello from SharpTS!";',
            'const version: number = 1.0;',
            'console.log(`${greeting} v${version}`);',
            '',
            'const languages = ["TypeScript", "C#", ".NET"];',
            'languages.forEach(lang => console.log(`  ✓ ${lang}`));'
        ].join('\n'),
        expectedOutput: 'Hello from SharpTS! v1\n  ✓ TypeScript\n  ✓ C#\n  ✓ .NET',
        expectedOutputIncludes: ['Hello from SharpTS! v1', '✓ .NET'],
        executionSurface: 'worker'
    },
    {
        key: 'Ex2',
        source: [
            'interface Comparable<T> { compareTo(other: T): number; }',
            'class Temperature implements Comparable<Temperature> {',
            '    constructor(private celsius: number) {}',
            '    get fahrenheit(): number { return this.celsius * 9 / 5 + 32; }',
            '    compareTo(other: Temperature): number { return this.celsius - other.celsius; }',
            '    toString(): string { return `${this.celsius}°C (${this.fahrenheit}°F)`; }',
            '}',
            'const temps = [new Temperature(100), new Temperature(0), new Temperature(37)];',
            'temps.sort((a, b) => a.compareTo(b));',
            'temps.forEach(t => console.log(t.toString()));'
        ].join('\n'),
        expectedOutput: '0°C (32°F)\n37°C (98.6°F)\n100°C (212°F)',
        expectedOutputIncludes: ['0°C (32°F)', '100°C (212°F)'],
        executionSurface: 'worker'
    },
    {
        key: 'Ex3',
        source: [
            'async function delay(ms: number): Promise<string> { return `Done after ${ms}ms`; }',
            'async function main() {',
            '    console.log(await delay(100));',
            '    const all = await Promise.all([delay(50), delay(100), delay(150)]);',
            '    all.forEach(result => console.log(result));',
            '}',
            'main();'
        ].join('\n'),
        expectedOutput: 'Done after 100ms\nDone after 50ms\nDone after 100ms\nDone after 150ms',
        expectedOutputIncludes: ['Done after 50ms', 'Done after 150ms'],
        executionSurface: 'worker'
    },
    {
        key: 'Ex4',
        source: [
            'const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];',
            'const result = data.filter(n => n % 2 === 0).map(n => n ** 2).reduce((sum, n) => sum + n, 0);',
            'console.log(`Sum of squares of evens: ${result}`);',
            'const [first, second, ...rest] = data;',
            'console.log(`First: ${first}, Second: ${second}`);',
            'console.log(`Rest: [${rest.join(", ")}]`);'
        ].join('\n'),
        expectedOutput: 'Sum of squares of evens: 220\nFirst: 1, Second: 2\nRest: [3, 4, 5, 6, 7, 8, 9, 10]',
        expectedOutputIncludes: ['Sum of squares of evens: 220', 'Rest: [3, 4, 5, 6, 7, 8, 9, 10]'],
        executionSurface: 'worker'
    },
    {
        key: 'Ex5',
        source: [
            'console.log(`PI = ${Math.PI}`);',
            'console.log(`E  = ${Math.E}`);',
            'console.log(`sqrt(144) = ${Math.sqrt(144)}`);',
            'const now = new Date("2026-03-02T12:00:00.000Z");',
            'console.log(`ISO: ${now.toISOString()}`);',
            'const obj = { name: "SharpTS", nums: [1, 2, 3] };',
            'console.log(`JSON: ${JSON.stringify(obj)}`);'
        ].join('\n'),
        expectedOutput: 'PI = 3.141592653589793\nE  = 2.718281828459045\nsqrt(144) = 12\nISO: 2026-03-02T12:00:00.000Z\nJSON: {"name":"SharpTS","nums":[1,2,3]}',
        expectedOutputIncludes: ['PI = 3.141592653589793', 'sqrt(144) = 12', 'JSON: {"name":"SharpTS","nums":[1,2,3]}'],
        executionSurface: 'worker'
    },
    {
        key: 'Ex6',
        source: [
            '// Full CLI interop (the public playground intentionally disables module loading)',
            '@DotNetType("System.Text.StringBuilder")',
            'declare class StringBuilder {',
            '    constructor();',
            '    append(value: string): StringBuilder;',
            '    toString(): string;',
            '}',
            '@DotNetType("System.TimeSpan")',
            'declare class TimeSpan {',
            '    static fromHours(value: number): TimeSpan;',
            '    readonly totalMinutes: number;',
            '}',
            'const sb = new StringBuilder();',
            'sb.append("1.5 hours = ");',
            'sb.append(`${TimeSpan.fromHours(1.5).totalMinutes} minutes`);',
            'console.log(sb.toString());'
        ].join('\n'),
        expectedOutput: '1.5 hours = 90 minutes',
        expectedOutputIncludes: ['1.5 hours = 90 minutes'],
        executionSurface: 'cli'
    }
];

export interface ComparisonFeature {
    key: string;
    status: 'done' | 'partial' | 'missing';
    note?: string;
}

export interface ComparisonGroup {
    key: string;
    features: ComparisonFeature[];
}

/** SharpTS revision against which this human-reviewed matrix was verified. */
export const featureMatrixRevision = 'e599e1e37e17796e207b22de24c24de044508a19';

export const comparisonGroups: ComparisonGroup[] = [
    { key: 'Group_TypeSystem', features: [
        { key: 'Feat_PrimitiveTypes', status: 'done' }, { key: 'Feat_Generics', status: 'done', note: 'Note_Generics' },
        { key: 'Feat_UnionIntersection', status: 'done' }, { key: 'Feat_LiteralTypes', status: 'done' },
        { key: 'Feat_TupleTypes', status: 'done', note: 'Note_TupleTypes' }, { key: 'Feat_ConditionalTypes', status: 'done', note: 'Note_ConditionalTypes' },
        { key: 'Feat_MappedTypes', status: 'done', note: 'Note_MappedTypes' }, { key: 'Feat_TemplateLiteralTypes', status: 'done' },
        { key: 'Feat_UtilityTypes', status: 'done', note: 'Note_UtilityTypes' }
    ] },
    { key: 'Group_Classes', features: [
        { key: 'Feat_ClassesInheritance', status: 'done' }, { key: 'Feat_AccessModifiers', status: 'done' },
        { key: 'Feat_AbstractClasses', status: 'done' }, { key: 'Feat_GettersSetters', status: 'done' },
        { key: 'Feat_PrivateFields', status: 'done' }, { key: 'Feat_StaticBlocks', status: 'done' },
        { key: 'Feat_Decorators', status: 'done', note: 'Note_Decorators' }, { key: 'Feat_MethodOverloading', status: 'done' }
    ] },
    { key: 'Group_Functions', features: [
        { key: 'Feat_ArrowFunctions', status: 'done' }, { key: 'Feat_RestSpread', status: 'done' },
        { key: 'Feat_Closures', status: 'done' }, { key: 'Feat_AsyncAwait', status: 'done' },
        { key: 'Feat_PromiseCombinators', status: 'done' }, { key: 'Feat_Generators', status: 'done' },
        { key: 'Feat_AsyncGenerators', status: 'done' }, { key: 'Feat_ForAwaitOf', status: 'done' }
    ] },
    { key: 'Group_Modules', features: [
        { key: 'Feat_ImportExport', status: 'done' }, { key: 'Feat_DefaultExports', status: 'done' },
        { key: 'Feat_NamespaceImports', status: 'done' }, { key: 'Feat_DynamicImports', status: 'done' },
        { key: 'Feat_TypeScriptNamespaces', status: 'done' }, { key: 'Feat_ImportType', status: 'done' },
        { key: 'Feat_ModuleAugmentation', status: 'done' }
    ] },
    { key: 'Group_BuiltinApis', features: [
        { key: 'Feat_ConsoleLog', status: 'done', note: 'Note_ConsoleLog' }, { key: 'Feat_MathObject', status: 'done' },
        { key: 'Feat_StringMethods', status: 'done', note: 'Note_StringMethods' }, { key: 'Feat_ArrayMethods', status: 'done', note: 'Note_ArrayMethods' },
        { key: 'Feat_MapSet', status: 'done', note: 'Note_MapSet' }, { key: 'Feat_RegExp', status: 'done' },
        { key: 'Feat_Date', status: 'done' }, { key: 'Feat_Json', status: 'done' }, { key: 'Feat_Promise', status: 'done' },
        { key: 'Feat_Symbol', status: 'done' }, { key: 'Feat_Proxy', status: 'missing' }, { key: 'Feat_WeakRef', status: 'missing' }
    ] },
    { key: 'Group_Advanced', features: [
        { key: 'Feat_UsingAwaitUsing', status: 'done', note: 'Note_UsingAwaitUsing' }, { key: 'Feat_SatisfiesOperator', status: 'done' },
        { key: 'Feat_ConstTypeParameters', status: 'done' }, { key: 'Feat_BigintType', status: 'done' },
        { key: 'Feat_TypedArrays', status: 'done' }, { key: 'Feat_SharedArrayBufferAtomics', status: 'done' }
    ] }
];
