using Microsoft.AspNetCore.RateLimiting;

public static class PlaygroundEndpoints
{
    public static void MapPlaygroundEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api");

        group.MapPost("/run", async (RunRequest request, TypeScriptExecutionService service, CancellationToken ct) =>
        {
            var response = await service.ExecuteAsync(request.Source, request.TimeoutMs, ct);
            return Results.Ok(response);
        })
        .RequireRateLimiting("playground");

        group.MapGet("/presets", () => Results.Ok(Presets.All));

        group.MapGet("/presets/{name}", (string name) =>
        {
            var preset = Presets.All.FirstOrDefault(p =>
                string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
            return preset is not null ? Results.Ok(preset) : Results.NotFound();
        });
    }
}

public record RunRequest(string Source, int TimeoutMs = 5000);

public record RunResponse(
    bool Success,
    string Output,
    List<ErrorInfo> Errors,
    long ExecutionTimeMs);

public record ErrorInfo(string Message, int? Line, int? Column);

public record PresetExample(string Name, string Description, string Source);

public static class Presets
{
    public static readonly List<PresetExample> All =
    [
        new("Hello World", "Basic console output and variables",
            """
            const greeting: string = "Hello from SharpTS!";
            const version: number = 1.0;
            console.log(`${greeting} v${version}`);
            console.log("TypeScript running on .NET 🚀");
            """),

        new("Classes & Generics", "Generic data structures with type safety",
            """
            class Stack<T> {
                private items: T[] = [];

                push(item: T): void {
                    this.items.push(item);
                }

                pop(): T | undefined {
                    return this.items.pop();
                }

                peek(): T | undefined {
                    return this.items[this.items.length - 1];
                }

                get size(): number {
                    return this.items.length;
                }
            }

            const stack = new Stack<number>();
            stack.push(10);
            stack.push(20);
            stack.push(30);

            console.log(`Size: ${stack.size}`);
            console.log(`Top: ${stack.peek()}`);
            console.log(`Popped: ${stack.pop()}`);
            console.log(`Size after pop: ${stack.size}`);
            """),

        new("Async/Await", "Async functions with Promise combinators",
            """
            async function fetchData(id: number): Promise<string> {
                return `Record #${id}: data loaded`;
            }

            async function main() {
                // Sequential
                const first = await fetchData(1);
                console.log(first);

                // Parallel with Promise.all
                const results = await Promise.all([
                    fetchData(2),
                    fetchData(3),
                    fetchData(4)
                ]);

                for (const result of results) {
                    console.log(result);
                }

                // Promise.race
                const fastest = await Promise.race([
                    fetchData(5),
                    fetchData(6)
                ]);
                console.log(`Fastest: ${fastest}`);
            }

            main();
            """),

        new("Functional", "Higher-order functions and functional patterns",
            """
            // Pipeline of transformations
            const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            const result = numbers
                .filter(n => n % 2 === 0)
                .map(n => n * n)
                .reduce((sum, n) => sum + n, 0);

            console.log(`Sum of squares of evens: ${result}`);

            // Curry function
            function curry<A, B, C>(fn: (a: A, b: B) => C): (a: A) => (b: B) => C {
                return (a: A) => (b: B) => fn(a, b);
            }

            const add = curry((a: number, b: number) => a + b);
            const add5 = add(5);
            console.log(`5 + 3 = ${add5(3)}`);
            console.log(`5 + 10 = ${add5(10)}`);

            // Destructuring & spread
            const [head, ...tail] = numbers;
            console.log(`Head: ${head}, Tail: [${tail.join(", ")}]`);

            const obj = { a: 1, b: 2, c: 3 };
            const { a, ...rest } = obj;
            console.log(`a: ${a}, rest: ${JSON.stringify(rest)}`);
            """),

        new(".NET Interop", "Decorators and .NET type annotations",
            """
            // SharpTS decorators for .NET interop
            // Note: @DotNetType requires specific runtime setup

            // Using built-in .NET types through SharpTS
            const now = new Date();
            console.log(`Current time: ${now.toISOString()}`);

            // Math operations (backed by System.Math)
            console.log(`PI: ${Math.PI}`);
            console.log(`sqrt(144): ${Math.sqrt(144)}`);
            console.log(`floor(3.7): ${Math.floor(3.7)}`);
            console.log(`random: ${Math.random()}`);

            // JSON (backed by System.Text.Json)
            const data = { name: "SharpTS", version: 1, features: ["interpret", "compile"] };
            const json = JSON.stringify(data, null, 2);
            console.log(json);

            const parsed = JSON.parse(json);
            console.log(`Parsed name: ${parsed.name}`);
            """)
    ];
}
