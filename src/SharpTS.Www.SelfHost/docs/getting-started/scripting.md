SharpTS supports Unix Shebang lines, so a TypeScript file can select SharpTS as its interpreter and run directly from a shell. Use this for command-line utilities, repository automation, and scripts that benefit from TypeScript without a separate build step.

:::figure scripting

## Create an executable TypeScript script

Place the Shebang at the absolute beginning of the file. It must be the first two characters, with no leading whitespace or byte-order mark:

```typescript example=shebang-script
#!/usr/bin/env sharpts

const name = process.argv[2] ?? "world";
console.log(`Hello, ${name}!`);
```

```text output=shebang-script
Hello, world!
```

Save the file as `greet.ts`. On Linux or macOS, give it executable permission and run it like any other command:

```bash
chmod +x greet.ts
./greet.ts Ada
```

```text
Hello, Ada!
```

## Run the script portably

Direct Shebang execution is a Unix feature. On any platform supported by SharpTS, including Windows, invoke the same file through the CLI:

```bash
sharpts greet.ts -- Ada
```

The `--` separator ensures every following value belongs to the script, even when an argument starts with `-`.

## Understand the execution path

`/usr/bin/env` searches the current `PATH` for the `sharpts` command. The operating system passes the script path and remaining command-line arguments to SharpTS, which type-checks and interprets the file.

SharpTS follows the Node.js shape for `process.argv`:

- `process.argv[0]` is the SharpTS runtime path.
- `process.argv[1]` is the script path.
- `process.argv[2]` and later entries are the arguments supplied by the user.

The example therefore reads `Ada` from index 2. The global tool or another `sharpts` executable must be installed and available on `PATH` for `/usr/bin/env sharpts` to find it.

## Compile when you need an artifact

The same source, including its Shebang, can compile to a .NET assembly:

```bash
sharpts --compile greet.ts
dotnet greet.dll Ada
```

Use `sharpts --compile greet.ts -t exe` when your SharpTS package and operating-system target support executable output. Compile when you need a distributable artifact, faster startup, or a fixed build input. Keep the interpreted Shebang form for local automation and the shortest edit-run cycle.
