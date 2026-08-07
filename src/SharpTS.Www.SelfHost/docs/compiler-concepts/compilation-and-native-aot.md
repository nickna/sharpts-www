SharpTS owns the path from TypeScript source to execution. The same parser and type checker feed either an interpreter for immediate execution or a compiler that persists a managed .NET assembly.

:::figure compilation-pipeline

## One front end, two execution paths

SharpTS processes a program in stages:

1. The lexer turns source text into tokens.
2. The parser builds an abstract syntax tree.
3. The type checker validates the program and records the static type of expressions.
4. SharpTS either evaluates the tree or lowers it to .NET Intermediate Language (IL).

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

The default compilation target is a managed .NET assembly. It contains IL for the TypeScript program and the generated runtime support that program needs. The .NET runtime loads that IL and turns it into machine code for the current processor.

This output can integrate with .NET applications, carry portable debugging information, and run anywhere its target framework and runtime dependencies are available. The executable target packages the compiled assembly behind a platform app host, but that packaging step does not change the program into Native AOT machine code.

> In SharpTS documentation, "compile ahead of execution" and ".NET Native AOT" describe different layers. A compiled TypeScript program is normally managed IL. A Native AOT SharpTS package is a native build of the compiler and command-line host itself.

## What Native AOT changes

.NET Native AOT converts the SharpTS command-line application into machine code when the SharpTS release is built. The resulting host starts without a just-in-time compilation step, does not need an installed .NET runtime, and does not extract a managed runtime before starting.

Native AOT also creates a closed type universe. Code and metadata that were not known when the host was published cannot be discovered or generated later in the same way as they can under the managed runtime. SharpTS accounts for that boundary in two ways:

- The official Native AOT package includes a curated set of .NET Base Class Library interop types.
- A custom host can declare application-specific interop types at build time through SharpTS.Hosting.

Operations that require an open managed runtime remain features of the managed distribution. These include loading arbitrary third-party assemblies at run time, IL verification, and declaration discovery. The Native AOT host can still compile supported TypeScript to managed IL; the host and the generated program are separate artifacts with separate execution models.

## Choose a SharpTS distribution

Use the distribution that matches the deployment rather than the source language:

- The **.NET global tool** is the simplest choice when the .NET SDK is already installed.
- The **managed self-contained package** includes the runtime and preserves the broadest dynamic .NET interop surface.
- The **Native AOT package** favors startup and deployment without a runtime, with an intentionally closed interop surface.

For installation commands and platform packages, see [Installation](/docs/getting-started/installation). To see how compilation avoids carrying every runtime feature into each output assembly, continue to [Tree shaking](/docs/compiler-concepts/tree-shaking).
