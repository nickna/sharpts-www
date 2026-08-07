SharpTS reduces compiled output in two complementary ways: it skips user statements proven unreachable, and it emits only the optional runtime feature groups that the program may need.

:::figure tree-shaking

## Remove unreachable user code

After type checking, SharpTS analyzes control flow before emitting IL. It can identify constant branches, type-based conditions whose result is already known, statements after terminating control flow, and unreachable cases in an exhaustive switch.

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

The compiler omits the constant-false branch and the statement after the final `return`. It does not assume that arbitrary functions are pure or execute user code at compile time, so this is deliberately narrower than whole-program optimization in a native compiler.

## Emit only required runtime features

JavaScript and Node-compatible behavior requires runtime support for features such as files, networking, streams, cryptography, dates, regular expressions, typed arrays, workers, and dynamic imports. Emitting every helper type into every assembly would make even a small program carry unrelated machinery.

SharpTS walks the parsed program and records plausible feature triggers. An import of `node:fs` retains file-system support, for example, while a reference to `Float32Array` retains that typed-array kind and its shared prerequisites. The compiler then emits the selected groups alongside the core runtime.

Feature dependencies are closed before emission. HTTP support also retains the networking, stream, buffer, JSON, and cancellation machinery it uses. This dependency step keeps the generated assembly valid without requiring each source-level trigger to name every helper below it.

## Prefer correctness over the smallest binary

Feature detection is conservative. A literal reference is enough to retain a feature even if a later control-flow pass can prove the surrounding statement unreachable. False positives make an assembly somewhat larger; a false negative could produce a missing type or method at run time.

The same rule applies when source code reaches dynamic boundaries. Imports, global objects, reflective behavior, and features that share runtime machinery may retain more than their visible syntax suggests. The core runtime is always emitted, and tree shaking does not promise a minimal or dependency-free binary.

This design keeps tree shaking transparent: it changes what support code is emitted, not the observable behavior of a valid TypeScript program.

## What tree shaking improves

Removing unreachable IL and unused runtime groups can reduce assembly size and the amount of metadata the runtime loads. The exact result depends on the features a program uses; an application that imports networking, streams, cryptography, and workers naturally retains more machinery than a small command-line calculation.

Tree shaking is only one part of generated-code quality. [Performance](/docs/compiler-concepts/performance) explains how SharpTS also specializes the code that remains.
