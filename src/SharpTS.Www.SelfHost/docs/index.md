SharpTS lets you run TypeScript directly or compile it to .NET IL. You can use familiar TypeScript for scripts, native command-line tools, server-side applications, and .NET libraries.

:::figure quick-start

## Choose your first workflow

**Interpret** for the shortest edit-run cycle. SharpTS type-checks your file and runs it immediately without a separate build artifact.

**Compile** when you want to distribute your program or integrate a .NET assembly or executable with another .NET application.

## Run SharpTS in five minutes

1. Install SharpTS with the setup script for your terminal.

Shell on Linux, WSL, or Apple Silicon macOS:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh
```

PowerShell on Windows:

```powershell
irm https://sharpts.dev/setup.ps1 | iex
```

The script uses the .NET global tool when the .NET 10 SDK is available. Otherwise, it installs the self-contained Native AOT build for the current operating system and architecture.

2. Create a file named `hello.ts` with this small array-and-iteration example.

```typescript example=quick-start
const names = ["Ada", "Grace", "Linus"];

for (const name of names) {
    console.log(`Hello, ${name}!`);
}
```

3. Run the file directly.

```bash
sharpts hello.ts
```

The exact output is:

```text output=quick-start
Hello, Ada!
Hello, Grace!
Hello, Linus!
```

4. On a machine with .NET installed, compile the same source to .NET IL, then run the resulting assembly.

```bash
sharpts --compile hello.ts
dotnet hello.dll
```

The compiled program prints the same output.

> SharpTS checks TypeScript before it interprets or compiles your entry point, so type errors stop the program before execution.

## Where to go next

- Review setup-script options and advanced manual choices in [Installation](/docs/getting-started/installation).
- Learn the four everyday execution modes in [CLI basics](/docs/getting-started/cli-basics).
- Follow the compiler from TypeScript source to .NET IL in [Compilation and Native AOT](/docs/compiler-concepts/compilation-and-native-aot).
- See how generated programs stay smaller in [Tree shaking](/docs/compiler-concepts/tree-shaking).
- Learn how type information accelerates hot paths in [Performance](/docs/compiler-concepts/performance).
- Understand how JavaScript behavior survives the move to .NET in [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet).
- Follow calls and suspended execution in [Functions, Closures, and State Machines](/docs/compiler-concepts/functions-closures-and-state-machines).
- See how an entry point becomes a compiled graph in [Modules and Dependency Compilation](/docs/compiler-concepts/modules-and-dependency-compilation).
