SharpTS runs or compiles a program from a runtime entry file, not from an isolated text buffer. Resolving that program produces three related sets of inputs:

- **Checking inputs** include executable sources, declaration files, default libraries, configured type roots, and type-only dependencies.
- **Eager runtime modules** are reachable through static imports and re-exports and initialize with the entry graph.
- **On-demand runtime modules** are discoverable literal `require()` or `import()` targets that must be present in compiled output even though execution may reach them later.

The sets share resolution and, during compilation, type checking, but they do not have the same emission or initialization rules.

:::figure module-graph

## Discover the program from its entry point

Commands that run or compile a file name one runtime entry. A `tsconfig.json` supplies compiler options, declarations, and other checking inputs; `sharpts -p tsconfig.json` can check every root selected by `files` and `include`, but those roots do not become additional executable entries for `sharpts --compile src/app.ts`.

`ModuleResolver` loads the entry, parses its static imports and re-exports, resolves their specifiers, and recursively loads reachable dependencies into a cache. It also discovers TypeScript `import = require()` declarations and string-literal `require()` calls. A later dynamic-import pass adds string-literal `import()` targets and repeats until it has found nested dynamic imports as well.

`ParsedModule` records each source's statements, checking dependencies, executable counterparts, and exported type and value surfaces. Type checking operates across the complete checking graph, and diagnostics remain attributed to the source module that contains the error. Only after that shared front end succeeds does the interpreter execute the runtime graph or `ILCompiler` emit it.

Consider this graph:

```text
src/app.ts --imports--> src/format.ts --re-exports current--> src/model.ts
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

```text
Hello, Ada!
```

Running `sharpts src/app.ts` or compiling `sharpts --compile src/app.ts` follows the import from `app.ts` and resolves `current` through `format.ts` back to `model.ts`. The `User` interface participates in checking but has no runtime value and emits no module export.

## Separate checking dependencies from runtime modules

An import can have different checking and runtime targets. For example, a package may expose a `.d.ts` file through `types` or a `types` export condition while exposing a `.js` file through its `import` or `require` condition. SharpTS checks consumers against the declaration surface and records the executable package entry as the corresponding runtime dependency.

Type-only imports, interfaces, declaration roots, default `lib.*.d.ts` files, triple-slash type references, and discovered `@types` packages expand the checking graph without adding executable module bodies. This distinction prevents declaration files from being emitted or initialized while still making their types available throughout the program.

## Resolve files and packages

Relative specifiers resolve from the importing file, with supported extension substitution and directory `index` probing. Bare package specifiers walk parent `node_modules` directories. The default `node16` resolution mode and the `nodenext` and `bundler` modes apply package `exports`, package `imports` for `#` specifiers, and conditional `types`, `import`, or `require` targets. `classic` and `node10` retain their narrower behavior. Configured `baseUrl`, `paths`, and type roots also participate where applicable.

Source format is selected as follows:

- `.cts` and `.cjs` files use CommonJS behavior.
- `.ts`, `.tsx`, `.mts`, and `.mjs` files use ESM behavior.
- `.js` and `.jsx` files use the nearest package `type`; only when no package is reachable does SharpTS use a limited source heuristic.

Node built-ins accept familiar names such as `node:path` and, where supported, their unprefixed forms. SharpTS supplies its own compatible implementations through embedded TypeScript standard-library modules and generated runtime support; it does not load or launch Node. `dotnet:` modules are a separate interop namespace synthesized from the .NET types available to the current SharpTS host.

> Resolution compatibility does not imply complete npm or Node compatibility. A package can resolve successfully and still depend on unsupported JavaScript syntax, native Node add-ons, a missing built-in API, browser globals, unbundled data files, or behavior outside SharpTS's current runtime surface.

## Initialize modules once, at the right time

The compiler gives each non-script source module a generated module type with export storage and an initialization method. Script files instead use the shared program scope. Initialization guards ensure that a module body runs at most once, so a diamond-shaped graph does not repeat top-level side effects.

Static ESM dependencies initialize before the modules that import them. Generated export and import fields carry values across module boundaries, and re-exports forward the selected values through the graph. Cycles are allowed, but reading an export before its defining module has assigned it remains an ordering hazard; code should not rely on a cycle producing a fully initialized namespace.

CommonJS modules are included when a string-literal `require()` makes them discoverable, but non-entry CommonJS bodies initialize lazily when `require()` first reaches them. The runtime creates and caches a live `module.exports` value before executing the body, so a circular `require()` can observe the exports populated so far. Reassigning `module.exports` changes what later consumers receive.

Repeated imports therefore reuse initialized module state and exported object references without repeating module bodies. The generated namespace wrapper itself is an implementation detail and should not be used as an identity guarantee.

> Compiled `require()` is intentionally bounded: its specifier must be a string literal so the target can be emitted into the assembly. The interpreter can resolve a computed specifier from the filesystem at run time.

## Precompile dynamic imports

A dynamic import with a string literal gives the compiler a discoverable target. SharpTS loads that module and its dependencies, checks them, emits their module types without eagerly initializing them, and registers factories in the generated dynamic-import registry. At run time, `import("./feature")` returns a promise that initializes the registered module on demand and resolves to its namespace.

An expression such as `import(name)` is different because its value may not be known during compilation. It succeeds in compiled output only when the resulting specifier matches a module already registered from the static or literal-dynamic graph. Otherwise the promise rejects with a module-not-found error; the generated program never compiles new TypeScript at run time.

Missing literal targets are also allowed to reach this rejection path, so a guarded optional import does not necessarily fail the entire compilation. A literal target that loads successfully joins the checking graph, where type errors block emission; a target that cannot be resolved or loaded remains unregistered and rejects at run time.

This completes the Compiler Concepts sequence. Return to [Compilation and Native AOT](/docs/compiler-concepts/compilation-and-native-aot) for the whole pipeline, see [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet) for the value-level contract, or consult [Conformance](/conformance) for the current supported surface.
