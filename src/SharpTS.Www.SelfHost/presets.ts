export const presets = [
    {
        name: 'Hello World',
        description: 'Basic console output and variables',
        source: [
            'const greeting: string = "Hello from SharpTS!";',
            'const version: number = 1.0;',
            'console.log(`${greeting} v${version}`);',
            'console.log("TypeScript running on .NET 🚀");'
        ].join('\n')
    },
    {
        name: 'Classes & Generics',
        description: 'Generic data structures with type safety',
        source: [
            'class Stack<T> {',
            '    private items: T[] = [];',
            '    push(item: T): void { this.items.push(item); }',
            '    pop(): T | undefined { return this.items.pop(); }',
            '    peek(): T | undefined { return this.items[this.items.length - 1]; }',
            '    get size(): number { return this.items.length; }',
            '}',
            '',
            'const stack = new Stack<number>();',
            'stack.push(10);',
            'stack.push(20);',
            'stack.push(30);',
            'console.log(`Size: ${stack.size}`);',
            'console.log(`Top: ${stack.peek()}`);',
            'console.log(`Popped: ${stack.pop()}`);',
            'console.log(`Size after pop: ${stack.size}`);'
        ].join('\n')
    },
    {
        name: 'Async/Await',
        description: 'Async functions with Promise combinators',
        source: [
            'async function fetchData(id: number): Promise<string> {',
            '    return `Record #${id}: data loaded`;',
            '}',
            '',
            'async function main() {',
            '    const first = await fetchData(1);',
            '    console.log(first);',
            '    const results = await Promise.all([fetchData(2), fetchData(3), fetchData(4)]);',
            '    for (const result of results) console.log(result);',
            '}',
            '',
            'main();'
        ].join('\n')
    },
    {
        name: 'Functional',
        description: 'Higher-order functions and functional patterns',
        source: [
            'const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];',
            'const result = numbers.filter(n => n % 2 === 0).map(n => n * n).reduce((sum, n) => sum + n, 0);',
            'console.log(`Sum of squares of evens: ${result}`);'
        ].join('\n')
    },
    {
        name: '.NET Interop',
        description: '.NET-backed standard library features',
        source: [
            'const now = new Date();',
            'console.log(`Current time: ${now.toISOString()}`);',
            'console.log(`PI: ${Math.PI}`);',
            'console.log(`sqrt(144): ${Math.sqrt(144)}`);',
            'const data = { name: "SharpTS", version: 1, features: ["interpret", "compile"] };',
            'console.log(JSON.stringify(data, null, 2));'
        ].join('\n')
    }
];
