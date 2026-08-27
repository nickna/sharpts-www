SharpTS automatically reduces `--compile` output in two complementary ways: **dead-code elimination** skips user statements proven unreachable, while **runtime tree shaking** omits optional generated runtime groups that the program does not appear to need. These are compiler optimizations; interpreted execution uses the checked program directly.

:::figure tree-shaking

## Understand the scope

In JavaScript tooling, *tree shaking* often means removing unused imports, exports, functions, or classes. SharpTS does not currently promise that kind of declaration-level elimination within a runtime module selected for emission. It emits the entry module and its statically discoverable runtime graph because loading a module can run initialization and other side effects, even when a particular export is unused.

Here, runtime tree shaking refers specifically to generated JavaScript and Node-compatible support code. Type-only inputs do not add runtime bodies, and modules outside the discoverable runtime graph are not emitted; [Modules and Dependency Compilation](/docs/compiler-concepts/modules-and-dependency-compilation) explains those boundaries.

## Eliminate unreachable user statements

After type checking, SharpTS performs a deliberately narrow control-flow analysis before emitting IL. It recognizes literal boolean conditions and combinations using `!`, `&&`, and `||`; simple `typeof variable` comparisons whose result follows from the recorded type; statements after `return`, `throw`, `break`, `continue`, or another construct known to terminate; and an unreachable `default` in supported exhaustive switches over literal unions.

```typescript
function label(value: number): string {
    if (false) {
        console.log("This branch is not emitted");
    }

    if (value >= 0) {
        return "non-negative";
    }

    return "negative";
    console.log("This statement is unreachable");
}
```

The compiler omits the constant-false branch and the statement after the final `return`. It does not generally evaluate constant expressions, assume that arbitrary functions are pure, or execute user code at compile time.

## Emit only required runtime features

JavaScript and Node-compatible behavior requires runtime support for features such as files, networking, streams, cryptography, dates, regular expressions, typed arrays, workers, and dynamic imports. Emitting every helper type into every assembly would make even a small program carry unrelated machinery.

SharpTS walks the checked abstract syntax tree for every emitted runtime module and records plausible feature triggers. An import of `node:fs` retains file-system support, for example, while a reference to `Float32Array` retains that typed-array kind and its shared prerequisites. The compiler then emits the selected groups alongside the core runtime.

Feature dependencies are closed before emission. HTTP support also retains the networking, stream, buffer, JSON, and cancellation machinery it uses. This dependency step keeps the generated assembly valid without requiring each source-level trigger to name every helper below it.

## Prefer correctness over the smallest binary

Feature detection is conservative and intentionally independent of the dead-code results. For example:

```typescript
if (false) {
    new Float32Array(16);
}
```

Dead-code analysis omits the user statement, but the feature scan can still retain `Float32Array` support because it visits the complete syntax tree. Dead-code analysis currently runs first; feature detection runs later without filtering out statements already marked unreachable. A false positive makes an assembly somewhat larger, while a false negative could produce a missing type or method at run time.

The same rule applies when source code reaches dynamic boundaries. Imports, global objects, reflective behavior, and features that share runtime machinery may retain more than their visible syntax suggests. The core runtime is always emitted, and tree shaking does not promise a minimal or dependency-free binary.

This design keeps both optimizations transparent: they change emitted IL and support code, not the observable behavior of a valid TypeScript program. Ordinary compilation enables them automatically; no separate tree-shaking option is required.

## What these optimizations improve

Removing unreachable IL and unused runtime groups can reduce assembly size and the amount of metadata the runtime loads. The exact result depends on the features a program uses; an application that imports networking, streams, cryptography, and workers naturally retains more machinery than a small command-line calculation.

Dead-code elimination and runtime tree shaking are only part of generated-code quality. [Performance](/docs/compiler-concepts/performance) explains how SharpTS also specializes the code that remains.
