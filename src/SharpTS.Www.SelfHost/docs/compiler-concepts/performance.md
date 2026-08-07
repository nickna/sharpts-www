SharpTS uses TypeScript's static information to avoid dynamic work on common compiled hot paths. Every specialization has a conservative eligibility check and a behavior-preserving fallback when the value crosses into JavaScript's dynamic object model.

:::figure performance-paths

## Keep primitive values unboxed

JavaScript numbers are represented as .NET `double` values. Storing every number in a general `object` slot would allocate or box values and add conversions around arithmetic. When analysis proves a local stays numeric, SharpTS keeps it in a typed IL local and emits numeric operations directly.

The same principle applies to booleans, eligible function calls, and simple non-escaping object shapes. Static information is useful only while the compiler can prove the representation is not observable, so captured, aliased, or dynamically accessed values take the general path.

## Specialize arrays without changing identity

Array element access is often the dominant operation in numeric TypeScript:

```typescript
function sum(values: number[]): number {
    let total = 0;

    for (let i = 0; i < values.length; i++) {
        total += values[i];
    }

    return total;
}
```

A non-escaping local array can use a typed .NET collection when its permitted uses prove that JavaScript array identity, holes, and dynamic properties cannot be observed. General `number[]` values keep a single SharpTS array object but can store their dense elements in an unboxed numeric buffer. Indexed reads, writes, and `push` then use numeric methods without boxing each element.

If an operation requires general JavaScript array behavior, the array materializes its boxed representation and continues on the dynamic path. The object itself does not change, so aliases still observe the same array and mutations.

## Optimize iteration

For indexed loops, SharpTS can keep a numeric counter unboxed and hoist stable array checks outside the loop. Numeric typed arrays such as `Int32Array` and `Float64Array` have unboxed element accessors; when their receiver is loop-invariant, the compiler can also hoist its concrete-type cast instead of repeating it for every element.

`for...of` over a statically recognized array or typed array has a direct iteration path. Other iterables use the iterator protocol so custom iterators, generators, early exits, and iterator cleanup retain their JavaScript semantics.

These choices make the source type and escape behavior important. An array kept as `any`, reassigned inside a loop, or passed through an unknown call may require checks that a stable typed local does not.

## Improve other repeated work

The compiler applies the same guarded approach beyond arrays:

- Repeated string concatenation in an eligible non-escaping accumulator can use `StringBuilder` instead of copying the full prefix on every append.
- Simple non-escaping object literals can use generated typed value shapes for direct field access.
- Statically resolved calls can avoid general property lookup and dynamic invocation.
- Typed implementations of array helpers can keep numeric callback pipelines unboxed when their signatures are known.

Each optimization falls back when its proof does not hold. SharpTS does not trade away mutation, aliasing, closures, sparse arrays, custom iterators, or other observable behavior merely to select a faster representation.

## How performance is measured

Performance depends on the workload, runtime version, operating system, build mode, and whether a program stays on a specialized path. SharpTS therefore keeps two complementary benchmark suites:

- The [cross-runtime benchmarks](https://github.com/nickna/SharpTS/tree/main/benchmarks) run the same TypeScript workloads with SharpTS, Node.js, and Bun.
- The [compiler microbenchmarks](https://github.com/nickna/SharpTS/tree/main/SharpTS.Microbenchmarks) compare compiled TypeScript with idiomatic typed C# and equivalent dynamically shaped C# to expose where overhead remains.

Use benchmark results as measurements of their recorded environment, not as a universal speed guarantee. Next, see how the optimized and general paths preserve the same behavior in [JavaScript Semantics on .NET](/docs/compiler-concepts/javascript-semantics-on-dotnet).
