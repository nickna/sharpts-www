SharpTS compiles from an entry point, not from an isolated text buffer. Imports, re-exports, and statically discoverable runtime loads form a dependency graph that is resolved, checked, and emitted with the entry module.

:::figure module-graph

## Discover the program from its entry point

The CLI names the runtime entry file, while a project configuration can identify and check a wider set of roots. For execution or compilation, `ModuleResolver` loads the entry module, parses its imports and re-exports, resolves their specifiers, and recursively loads reachable dependencies into a cache. `ParsedModule` records each module's statements, dependencies, and exported type and value surfaces.

Type checking happens across that loaded graph. Imported names use the export information of their source module, re-exports carry bindings onward, and diagnostics remain attributed to the module that contains the source error. Only after this shared front end succeeds does the interpreter execute modules or `ILCompiler` emit the multi-module program.

Consider this small graph:

```text
src/app.ts
src/format.ts
src/model.ts
```

```typescript
// src/model.ts
export interface User { name: string; }
export const current: User = { name: "Ada" };

// src/format.ts
export { current } from "./model";
export function greet(name: string): string {
    return `Hello, ${name}!`;
}

// src/app.ts
import { current, greet } from "./format";
console.log(greet(current.name));
```

Running `sharpts src/app.ts` or compiling `sharpts --compile src/app.ts` starts with `app.ts`, follows `format.ts` to `model.ts`, checks the combined program, and preserves the re-export of `current`.

## Resolve files and packages

Relative specifiers resolve from the importing file, with supported extension and directory probing. Bare package specifiers walk `node_modules`. Depending on the selected module-resolution mode, `ModuleResolver` and `ExportsResolver` also apply package `exports`, package `imports` for `#` specifiers, conditional `import` or `require` targets, paths mappings, and declaration-file preferences.

`CommonJsDetector` selects ESM or CommonJS behavior from explicit extensions and, for JavaScript files, the nearest package `type` plus a limited source heuristic. ESM imports, CommonJS `require`, export assignments, named exports, and re-exports then use the matching loading and binding rules.

Node built-ins accept familiar names such as `node:path` and, where supported, their unprefixed forms. SharpTS supplies these through its embedded standard-library provider chain or generated runtime modules rather than by loading Node itself. `dotnet:` modules are a separate interop namespace synthesized from available .NET types.

> Resolution compatibility does not imply complete npm or Node compatibility. A package can resolve successfully and still depend on unsupported JavaScript syntax, native Node add-ons, a missing built-in API, browser globals, or behavior outside SharpTS's current runtime surface.

## Emit module initialization and exports

The compiler gives user modules generated module types with storage for exports and initialization methods. Imports refer to the generated exports of their dependencies, and guards ensure a module body is not repeatedly initialized. Cached module results preserve identity and side effects across repeated imports.

CommonJS needs an additional live `module.exports` value. The runtime creates and caches that exports object before executing the module body, so a circular `require` can observe the exports populated so far. Reassigning `module.exports` updates what later consumers receive. This is deliberately different from rejecting every cycle at resolution time: the CommonJS runtime cache supports partial initialization where the current loader can model it.

ESM bindings and re-exports are wired from the compiled module graph. Initialization order follows dependencies and guards against duplicate work. As in JavaScript generally, a cycle can still expose ordering hazards when code reads a value before its defining module has initialized it.

## Bound dynamic imports at compilation

A dynamic import with a string literal gives the compiler a discoverable target. SharpTS scans those literal paths, asks `ModuleResolver` to load the additional modules, emits them, and registers factories in the generated dynamic-import module registry. At run time, the promise can resolve from that registry without compiling new TypeScript.

An expression such as `import(name)` is different because its value may not be known during compilation. If the resulting specifier was not discovered and registered, the compiled runtime rejects the import promise with a module-not-found error. Missing literal targets are also allowed to reach this runtime rejection path so optional imports do not necessarily fail the entire compilation.

This completes the Compiler Concepts sequence. Return to [Compilation and Native AOT](/docs/compiler-concepts/compilation-and-native-aot) for the whole pipeline or [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet) for the value-level contract shared by interpreted and compiled programs.
