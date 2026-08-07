A TypeScript function is both executable code and a JavaScript value. SharpTS lowers ordinary calls directly when it can, while preserving closures, receiver binding, dynamic calls, and suspended execution when a function outlives a normal stack frame.

:::figure function-lowering

## Lower calls without losing JavaScript invocation

A statically resolved call can become a direct generated method call. The compiler still applies JavaScript argument behavior: missing parameters receive `undefined`, extra arguments remain available where the program can observe them, defaults run in order, and rest parameters collect the remaining values.

Functions used as values need a callable wrapper. The interpreter uses callable runtime objects such as `SharpTSFunction` and `SharpTSArrowFunction`; generated code creates corresponding delegates or wrapper shapes that dynamic invocation can dispatch. This general path covers variables of function type, callbacks stored in objects and arrays, `.call` and `.apply`, and values whose callable target cannot be fixed during compilation.

Receiver binding depends on call syntax. In `object.method()`, the base object becomes `this` for an ordinary function. Detaching the same function and calling it separately loses that receiver. Arrow functions instead capture lexical `this`, so calling an arrow through a property does not rebind it. `RuntimeCallableDispatcher` and compiled call helpers preserve these distinctions when a call cannot use the direct path.

## Capture bindings, not snapshots

`ClosureAnalyzer` runs before IL emission to identify names referenced across function boundaries. A captured local that must survive its defining call is moved into a generated display class. The original function and every closure that shares the binding read and write the same field, which is why later mutations remain visible.

Loop-scoped `let` and `const` need a narrower rule: each iteration creates a fresh binding. SharpTS capture analysis identifies per-iteration bindings and gives closures distinct values or reference cells instead of routing every iteration through one shared display-class field.

This example checks both shared mutation within one closure and fresh bindings between loop iterations. The documentation build runs it through both execution modes.

```typescript example=closure-parity
const counters: (() => number)[] = [];

for (let index = 0; index < 3; index++) {
    let value = index;
    counters.push(() => ++value);
}

console.log(counters.map(counter => counter()).join(","));
console.log(counters.map(counter => counter()).join(","));
```

```text output=closure-parity
1,2,3
2,3,4
```

## Turn suspension into state

An ordinary synchronous function runs from entry to return on one call stack. Other function kinds add a suspension protocol:

- An `async` function can pause at `await` and returns a promise immediately.
- A generator pauses at `yield` and resumes when its iterator receives `next`, `return`, or `throw`.
- An async generator combines awaited work with asynchronous iteration.

For compiled code, `AsyncStateMachineBuilder`, `GeneratorStateMachineBuilder`, and `AsyncGeneratorStateMachineBuilder` generate state-machine types. Parameters and locals that remain live across a suspension point are hoisted into fields. A state number records where execution should resume, while promise or iterator wrappers expose the JavaScript-facing protocol. Captured locals can connect the state machine to a display class when both lifetime mechanisms are needed.

The interpreter keeps equivalent execution state in its function, generator, promise, and environment objects. The shapes differ from emitted state machines, but each resume must observe the same local values, pending exception, `this` binding, and completion state.

## Close iterators on abrupt exits

Iteration has cleanup behavior as well as value production. When a `for...of` or delegated iteration ends early because of `break`, `return`, or an exception, SharpTS follows the iterator-close path and calls the iterator's `return` method when present. A `finally` block inside a generator must likewise run when the consumer closes it.

Compiled state-machine exit routing preserves that cleanup while moving control across generated labels and resumption states. Direct array iteration can avoid a general iterator only when analysis proves that custom iteration and cleanup cannot be observed; otherwise SharpTS uses the iterator protocol.

Next, [Modules and Dependency Compilation](/docs/compiler-concepts/modules-and-dependency-compilation) expands the unit of compilation from one function to a graph of files.
