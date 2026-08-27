A TypeScript function is both executable code and a JavaScript value. SharpTS therefore has two related jobs: make known calls cheap, and preserve the bindings, receiver, arguments, and suspended work that remain observable after a normal call frame is gone.

:::figure function-lowering

## Lower calls without losing JavaScript invocation

**JavaScript rule.** Calling a function supplies a receiver and an argument list. Missing parameters receive `undefined`, extra arguments remain observable through features such as `arguments` and rest parameters, default initializers run from left to right, and a rest parameter collects the remaining values. Calling the same function through `.call`, `.apply`, or `.bind` changes how the receiver or argument list is supplied without changing the function body.

Receiver binding depends on call syntax. In `object.method()`, the base object becomes `this` for an ordinary function. Detaching the same function and calling it separately loses that receiver. An arrow function instead captures lexical `this`, so storing or calling an arrow through a property does not rebind it.

**SharpTS lowering.** When the compiler can resolve a callee statically, it can emit a direct generated method call while applying the same argument and receiver rules. When a function is used as a value, SharpTS needs a stable callable object instead. The interpreter uses runtime objects such as `SharpTSFunction` and `SharpTSArrowFunction`; compiled code creates emitted callable wrappers or delegates around generated methods.

The value path covers callbacks, functions stored in objects or arrays, bound functions, and callees whose target cannot be fixed during compilation. `RuntimeCallableDispatcher` handles callable shapes at shared runtime and hosting boundaries, while emitted call helpers handle dynamic calls inside compiled programs. Choosing a direct call or a callable wrapper may affect allocation and dispatch cost, but it must not change the result that JavaScript can observe.

## Capture bindings, not snapshots

**JavaScript rule.** A closure retains access to a lexical binding, not merely the value that the binding held when the closure was created. If two closures capture the same local, a write through either closure is visible to the other.

`let` and `const` bindings created by a loop need an additional distinction. Each iteration receives a fresh binding, whereas a function-scoped `var` declaration is shared by every iteration. Closures from different `let` iterations must therefore remain independent even though closures from the same iteration can still share mutation.

This example exercises all three cases. The documentation build runs it through both the interpreter and compiler.

```typescript example=closure-parity
function createCounter() {
    let value = 0;
    return {
        read: () => value,
        increment: () => ++value
    };
}

const counter = createCounter();
console.log(counter.read(), counter.increment(), counter.read());

const perIteration: (() => number)[] = [];
for (let index = 0; index < 3; index++) {
    perIteration.push(() => index);
}
console.log(perIteration.map(read => read()).join(","));

const shared: (() => number)[] = [];
for (var sharedIndex = 0; sharedIndex < 3; sharedIndex++) {
    shared.push(() => sharedIndex);
}
console.log(shared.map(read => read()).join(","));
```

```text output=closure-parity
0 1 1
0,1,2
3,3,3
```

**SharpTS lowering.** `ClosureAnalyzer` runs before IL emission and identifies names referenced across function boundaries. An ordinary captured local is stored in a generated display class, and closures that share the binding read and write the same field. For per-iteration bindings, the compiler can capture a distinct value when no later mutation must be observed or use a fresh reference cell when the loop and its closures must share live mutation.

The storage choice is an implementation detail. A captured value that also lives across `await` or `yield` may need to connect a display class or reference cell to a state-machine field. The semantic requirement remains the same: closures must observe the correct binding, including its lifetime and mutations.

## Turn suspension into state

An ordinary synchronous function runs from entry to return on one call stack. Other function kinds expose a suspension protocol:

- An `async` function starts running when called, returns a promise to its caller, and can leave the call stack at an incomplete `await` before resuming later.
- A generator starts lazily on its first `next` call, pauses at `yield`, and resumes when its iterator receives `next`, `return`, or `throw`.
- An async generator combines awaited work with asynchronous iterator requests, which are processed in order.

**Compiled lowering.** `AsyncStateMachineBuilder` and `AsyncArrowStateMachineBuilder` build state machines for async functions and async arrows. `GeneratorStateMachineBuilder` and `AsyncGeneratorStateMachineBuilder` build the iterator-based forms. Parameters and locals that remain live across a suspension point are hoisted into fields; short-lived values can remain ordinary IL locals.

Conceptually, a generated state machine contains a state number, fields for live values, and a resume method. An entry state runs to the first suspension. A later state restores the live fields and continues after the corresponding `await` or `yield`. Completion settles the promise or produces an iterator result. The actual generated fields and state numbers are compiler details, not a public ABI.

The local `current` in this generator must survive both yields. Calling `return` closes the already-started generator, injects an abrupt completion at the suspension point, and still runs `finally`.

```typescript example=generator-state-parity
function* sequence() {
    let current = 1;
    try {
        yield current++;
        yield current++;
    } finally {
        console.log("closed at " + current);
    }
}

const iterator = sequence();
console.log(iterator.next().value);
console.log(iterator.next().value);
iterator.return();
```

```text output=generator-state-parity
1
2
closed at 3
```

**Interpreted execution.** The interpreter preserves the same JavaScript protocol without emitting these CLR state-machine types. Async functions use promise, task, and lexical-environment state. Synchronous generators retain their active interpreter call stack with a suspended worker-thread coroutine. Async generators instead run through the event-loop-oriented async path and maintain an ordered request queue. These implementations have different shapes, but every resume must observe the same locals, pending completion, `this` binding, and final result.

## Close iterators on abrupt exits

Iteration has cleanup behavior as well as value production. Natural exhaustion does not close an iterator, and `continue` to the same loop keeps using it. When a `for...of` or delegated iteration exits early because of `break`, `return`, or an exception, the iterator-close path calls the iterator's `return` method when present. Closing an already-started generator must likewise run any active `finally` blocks, as the example above demonstrates.

Compiled state-machine exit routing preserves that cleanup while moving control across generated labels and resumption states. SharpTS can use direct array loops for eligible statically known representations, but this is an optimization boundary: custom iteration and cleanup behavior must remain observable whenever the program can supply them. General cases therefore use the iterator protocol, and any expansion of a direct path needs parity coverage for abrupt completion and custom `Symbol.iterator` behavior.

Next, [Modules and Dependency Compilation](/docs/compiler-concepts/modules-and-dependency-compilation) expands the unit of compilation from one function to a graph of files.
