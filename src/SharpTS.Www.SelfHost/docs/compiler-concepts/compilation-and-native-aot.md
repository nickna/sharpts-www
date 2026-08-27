SharpTS owns the path from TypeScript source to execution. The same module resolver, parser, and type checker feed either an interpreter for immediate execution or a compiler that persists a managed .NET assembly.

:::figure compilation-pipeline

## One front end, two execution paths

SharpTS processes a program in stages:

1. The lexer turns source text into tokens.
2. The parser builds an abstract syntax tree.
3. The module resolver loads the reachable dependency graph and configured references.
4. The type checker validates the program and records the static type of expressions.
5. SharpTS either evaluates the checked tree or lowers it to .NET Intermediate Language (IL).

Interpret a file when you want the shortest edit-run cycle:

```bash
sharpts app.ts
```

Compile it when you want a reusable build artifact:

```bash
sharpts --compile app.ts
dotnet app.dll
```

Both commands reject type errors before executing or emitting the program. Compilation can also use the recorded type information to select specialized IL paths that are not available to a general tree-walking interpreter.

## What the compiler emits

The default compilation target is `app.dll`, a managed .NET 10 assembly containing IL for the TypeScript program and its generated JavaScript runtime helpers. SharpTS also writes `app.runtimeconfig.json`, which tells .NET how to run the assembly. A compatible .NET runtime loads the IL and normally just-in-time compiles it into machine code for the current processor.

Use `--debug` to emit a portable PDB for TypeScript-source debugging. Use `--ref-asm` when a C# project needs to reference the generated assembly, or `--hosted` when an advanced managed application needs the versioned SharpTS hosting contract.

Most generated runtime support lives inside the output assembly and is tree-shaken according to the program. Some features create a soft dependency on `SharpTS.dll`, while external .NET references create hard dependencies on their assemblies. SharpTS normally copies those files beside the output when they are required. `--standalone` suppresses the automatic copies; it does not remove the dependencies.

The `-t exe` target bundles the managed assembly and its runtime configuration behind a platform app host. This produces a framework-dependent single-file executable on supported Windows and Linux targets: the target machine still needs a compatible .NET runtime. Packaging IL as an executable does not turn it into Native AOT machine code.

> The compiler host and the generated program are separate layers. The managed or Native AOT SharpTS host can compile a TypeScript program, but ordinary `--compile` output is managed IL in either case.

## What Native AOT changes

.NET Native AOT converts the SharpTS command-line application into machine code when the SharpTS release is built. The resulting host starts without a just-in-time compilation step, does not need an installed .NET runtime, and does not extract a managed runtime before starting.

Native AOT also gives the host a closed .NET interop and reflection universe. .NET types, member metadata, and native code that were not known when the host was published cannot be discovered or generated later as they can under the managed runtime. This does not close the TypeScript program: the host can still interpret arbitrary supported source and compile supported programs to managed IL.

SharpTS accounts for the closed .NET boundary in two ways:

- The official Native AOT package includes a curated set of .NET Base Class Library interop types.
- A custom host can declare application or third-party interop types at build time through SharpTS.Hosting.

The official Native AOT distribution rejects operations that require open-ended managed capabilities rather than attempting unrestricted reflection. Use a managed distribution for:

- Loading arbitrary external DLL or NuGet references and discovering open-ended `dotnet:` or `@DotNetType` surfaces.
- IL verification with `--verify` and declaration discovery with `--gen-decl`.
- Compiled `child_process.fork`, `--hosted` output, and compiled features that require the complete managed SharpTS runtime.

Native AOT constrains how the SharpTS host implements these features, not the TypeScript language semantics shared by the interpreter and compiler.

## Choose a SharpTS distribution

Start with the [recommended setup script](/docs/getting-started/installation). It uses the .NET global tool when the .NET 10 SDK is installed and otherwise selects the Native AOT package for the current platform, so most users do not need to choose a package manually.

Choose a method explicitly only when the deployment requires a particular runtime model:

- The **.NET global tool** is the simplest choice when the .NET SDK is already installed.
- The **managed self-contained package** requires no installed .NET runtime and preserves the broadest dynamic .NET interop and tooling surface.
- The **Native AOT package** requires no installed .NET runtime and favors startup with an intentionally closed interop surface.

For installation commands and platform packages, see [Installation](/docs/getting-started/installation). To see how compilation avoids carrying every runtime feature into each output assembly, continue to [Tree shaking](/docs/compiler-concepts/tree-shaking).
