The SharpTS CLI grows with your task: start interactively, run a file, compile an assembly, or produce an executable where the target supports it.

:::figure cli-modes

## Open the REPL

Run SharpTS without a file to open its read-evaluate-print loop:

```bash
sharpts
```

Use the REPL for quick expressions and short experiments.

## Type-check and interpret a file

Pass an entry file for the fastest edit-run cycle:

```bash
sharpts app.ts
```

SharpTS type-checks `app.ts` and then interprets it.

## Compile a .NET assembly

Add `--compile` to produce `app.dll`:

```bash
sharpts --compile app.ts
dotnet app.dll
```

Compilation is useful for distribution and .NET integration.

## Compile an executable

Select the executable target where the operating system and SharpTS package support it:

```bash
sharpts --compile app.ts -t exe
```

## Pass arguments to a script

Use `--` to stop SharpTS option parsing. Everything after it belongs to the script:

```bash
sharpts report.ts -- --format json
```

This prevents a script option such as `--format` from being interpreted as a SharpTS option.

## Start with project checking

SharpTS automatically discovers a nearby `tsconfig.json`. These options cover the first project-level tasks:

- `-p path/to/tsconfig.json` selects an explicit project.
- `--strict` enables stricter checking.
- `--noEmit` checks without producing output.
- `--help` shows the complete, current option set.

> Project commands can check a TypeScript import graph. A runtime command still needs an entry point: `script.ts` identifies a file to interpret, while `--compile script.ts` identifies a file to compile.

## Choose this command when

- Use `sharpts` when you want an interactive prompt.
- Use `sharpts app.ts` when you want to check and run a file immediately.
- Use `sharpts --compile app.ts` when you want a .NET assembly.
- Use `sharpts --compile app.ts -t exe` when you want a supported executable target.
- Use `sharpts --noEmit -p tsconfig.json` when you only want to check a project graph.

Advanced compiler, reference, packaging, and diagnostic flags belong in the future CLI reference. Use `sharpts --help` for the complete option set available in your installed version.
