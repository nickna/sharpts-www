SharpTS can use a Unix hashbang so an executable TypeScript file can select SharpTS as its interpreter. This article remains a draft until the pinned source and automated execution test confirm the behavior.

:::figure scripting

## Add a SharpTS hashbang

Place the hashbang on the first line:

```typescript
#!/usr/bin/env sharpts

const name = process.argv[2] ?? "world";
console.log(`Hello, ${name}!`);
```

On Linux or macOS, make the file executable and run it:

```bash
chmod +x greet.ts
./greet.ts Ada
```

The portable form works without executable-file metadata:

```bash
sharpts greet.ts Ada
```

## How the execution path works

`/usr/bin/env` searches the current `PATH` for `sharpts`. The shell passes the script path to SharpTS, followed by `Ada`. SharpTS exposes command-line values through `process.argv`, so the example reads the name from index 2.

## When to compile instead

Compile to an executable when you need a distributable artifact, faster startup, a fixed build input, or a machine that should not depend on a global `sharpts` command. Keep the interpreted hashbang form for local automation and the shortest edit-run cycle.
