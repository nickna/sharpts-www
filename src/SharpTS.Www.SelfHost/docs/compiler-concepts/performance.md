SharpTS uses TypeScript's static information to avoid dynamic work on common compiled hot paths. These optimizations are internal implementation choices: they may change how a value is stored or how an operation is emitted, but they must not change observable JavaScript behavior.

The compiler protects that rule in two ways:

- **Proof-gated specialization** is selected only when whole-function analysis can show that a value will not escape into code that could observe its representation. If the proof does not hold, the compiler emits the general path from the start.
- **Guarded specialization** keeps the JavaScript object but uses faster internal storage or dispatch while its runtime shape permits it. When a dynamic operation needs the general representation, the same object deoptimizes without changing its identity.

:::figure performance-paths

## Keep primitive values unboxed

JavaScript numbers are represented as .NET `double` values. Storing every number in a general `object` slot would box values and add conversions around arithmetic. When analysis proves that a local stays numeric, SharpTS keeps it in a typed IL local and emits numeric operations directly.

The same principle applies to booleans and to primitive parameters and return values across statically resolved calls. Captures, reassignment, aliases, suspension, and dynamic access often require the general representation, although additional whole-function analysis can keep some stable captured or suspended numeric values unboxed.

## Specialize values that cannot escape

Some fresh local values can use a private representation when all of their permitted uses are known. For example, an eligible non-escaping `number[]` or `boolean[]` local can become a typed .NET collection, and a simple object or class instance can become a generated shape with typed fields.

These optimizations are selected only when JavaScript identity, holes, dynamic properties, prototypes, and unknown calls cannot observe the replacement. There is no runtime conversion from the private value to a general object: if the analysis finds such a boundary, it does not select the private representation.

## Preserve identity when storage changes

An array parameter cannot normally be replaced with a private collection because callers and aliases can observe its identity:

```typescript
function sum(values: number[]): number {
    let total = 0;

    for (let i = 0; i < values.length; i++) {
        total += values[i];
    }

    return total;
}
```

A general `number[]` therefore remains one SharpTS array object, but its dense elements can live in an unboxed numeric buffer. Statically numeric indexed reads, writes, and `push` operations use numeric methods without boxing each element.

If an operation requires the general JavaScript array representation, the array materializes boxed storage and continues on the dynamic path. The object itself does not change, so aliases, equality, and subsequent mutations still observe the same array.

## Optimize loops and iteration

For indexed loops, SharpTS can keep a proven numeric counter in native storage and hoist stable array checks outside the loop. Numeric typed arrays such as `Int32Array` and `Float64Array` have unboxed element accessors; a loop-invariant receiver can have its concrete-type cast hoisted, and a sufficiently constrained local typed array can also expose stable backing-storage facts to the loop.

`for...of` can use specialized loops for iterable shapes that analysis proves stable. Other cases use the JavaScript iterator protocol so custom behavior, generators, early exits, exceptions, and iterator cleanup retain their semantics.

## Improve other repeated work

The compiler applies the same guarded approach beyond primitive arithmetic and indexed loops. Representative examples include:

- Repeated string concatenation in an eligible non-escaping accumulator can use `StringBuilder` instead of copying the full prefix on every append.
- Simple non-escaping object literals, class instances, and closed record data can use generated typed shapes for direct field access.
- Statically resolved calls and built-ins can avoid general property lookup, dynamic invocation, and unnecessary boxing.
- Typed implementations of collection helpers can keep numeric pipelines unboxed when the receiver, callback, and uses of the result all satisfy the required proof.
- Stable iterator, generator, and asynchronous patterns can avoid some intermediate JavaScript objects while retaining their completion and cleanup behavior.

The list is illustrative rather than exhaustive. Optimization eligibility changes as the compiler develops, and source code should not depend on a particular internal lowering.

## Write optimization-friendly code

Precise types and stable local bindings give the compiler more useful information on hot paths. A value kept as `any`, reassigned through several shapes, accessed with dynamic property names, captured by an escaping closure, or passed through an unresolved call may require checks or the general representation.

Treat those rules as guidance, not as a reason to distort clear TypeScript. Measure the real workload in a release build, including startup or compilation costs when they matter to the application.

## How performance is measured

Two principal suites provide complementary compiler-performance evidence:

- The [cross-runtime benchmarks](https://github.com/nickna/SharpTS/tree/main/benchmarks/cross-runtime) run the same TypeScript workloads with the SharpTS interpreter, compiled SharpTS, Node.js, and Bun. Their headline measurements cover in-process workload execution and exclude process startup, source loading, SharpTS compilation, warmup, and batch calibration.
- The [compiler microbenchmarks](https://github.com/nickna/SharpTS/tree/main/benchmarks/micro/SharpTS.Microbenchmarks) use BenchmarkDotNet to compare compiled TypeScript with idiomatic typed C# and equivalent dynamically shaped C#, exposing both the performance ceiling and the remaining representation overhead.

The public [Performance explorer](/performance) presents pinned measurements, environment details, and additional evidence such as GUI performance. Use every result as a measurement of its recorded workload, toolchain, operating system, and hardware rather than as a universal speed guarantee.

Next, see how the optimized and general paths preserve the same behavior in [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet).
