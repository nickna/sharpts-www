SharpTS lets you run TypeScript directly or compile it to .NET IL. You can use familiar TypeScript for scripts, native command-line tools, server-side applications, and .NET libraries.

:::figure quick-start

## Choose your first workflow

**Interpret** for the shortest edit-run cycle. SharpTS type-checks your file and runs it immediately without a separate build artifact.

**Compile** when you want to distribute your program or integrate a .NET assembly or executable with another .NET application.

## Run SharpTS in five minutes

1. Verify that the .NET 10 SDK or later is installed.

```bash
dotnet --version
```

2. Install SharpTS as a global tool.

```bash
dotnet tool install --global SharpTS
```

3. Create a file named `hello.ts` with this small array-and-iteration example.

```typescript example=quick-start
const names = ["Ada", "Grace", "Linus"];

for (const name of names) {
    console.log(`Hello, ${name}!`);
}
```

4. Run the file directly.

```bash
sharpts hello.ts
```

The exact output is:

```text output=quick-start
Hello, Ada!
Hello, Grace!
Hello, Linus!
```

5. Compile the same source to .NET IL, then run the resulting assembly.

```bash
sharpts --compile hello.ts
dotnet hello.dll
```

The compiled program prints the same output.

> SharpTS checks TypeScript before it interprets or compiles your entry point, so type errors stop the program before execution.

## Where to go next

- Review SDK and self-contained choices in [Installation](/docs/getting-started/installation).
- Learn the four everyday execution modes in [CLI basics](/docs/getting-started/cli-basics).
- Follow the compiler from TypeScript source to .NET IL in [Compilation and Native AOT](/docs/compiler-concepts/compilation-and-native-aot).
- See how generated programs stay smaller in [Tree shaking](/docs/compiler-concepts/tree-shaking).
- Learn how type information accelerates hot paths in [Performance](/docs/compiler-concepts/performance).
- Understand how JavaScript behavior survives the move to .NET in [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet).
- Follow calls and suspended execution in [Functions, Closures, and State Machines](/docs/compiler-concepts/functions-closures-and-state-machines).
- See how an entry point becomes a compiled graph in [Modules and Dependency Compilation](/docs/compiler-concepts/modules-and-dependency-compilation).
