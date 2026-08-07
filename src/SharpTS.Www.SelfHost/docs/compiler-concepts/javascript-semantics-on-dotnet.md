TypeScript erases to JavaScript behavior, even when SharpTS runs it on .NET. Static types can guide code generation, but they do not redefine values, operators, objects, or property access.

:::figure semantic-lowering

## Preserve the JavaScript value model

`undefined` and `null` are distinct values. Both are nullish and falsy, but `typeof undefined` is `"undefined"`, `typeof null` is `"object"`, and strict equality does not equate them. Loose equality does, after applying JavaScript's coercion rules.

Truthiness and coercion apply at every dynamic boundary. `false`, both signed forms of zero, `NaN`, the empty string, `null`, and `undefined` are falsy; objects and arrays are truthy. Numeric, string, relational, loose-equality, and template operations use JavaScript conversions rather than .NET conversion defaults. Strict equality compares primitive values without coercion and objects by identity.

Property access has its own conversion step. JavaScript keys are strings or symbols, so a computed key such as `object[true]` addresses `"true"`, `object[-0]` addresses `"0"`, and `object[undefined]` addresses `"undefined"`. The interpreter centralizes that rule in `PropertyKeyConverter`; emitted code uses the corresponding generated runtime conversion so both execution paths agree.

This example deliberately combines nullish values, both equality forms, and an array hole. It is executed during the site build in interpreter and compile modes.

```typescript example=semantic-parity
const missing: number | undefined = undefined;
const values: any[] = [1, , 3];

console.log(missing == null, missing === null, typeof missing);
console.log(values.length, 1 in values, values[1] === undefined);
```

```text output=semantic-parity
true false undefined
3 false true
```

The missing array element illustrates an important distinction: reading a hole produces `undefined`, but the `in` operator reports that no own indexed property exists. Filling that position with an explicit `undefined` value would make `1 in values` true.

## Keep objects observable

JavaScript objects are more than dictionaries. A property lookup can walk a prototype chain. An own property descriptor can control writability, enumerability, configurability, or replace a stored value with getter and setter functions. SharpTS routes general object operations through object and descriptor machinery so these choices remain observable.

Arrays participate in the same object model. Their indexed properties affect `length`, deletion can create holes, and non-index properties can coexist with elements. Dense storage is therefore an optimization, not a different kind of value. When code needs sparse indices, descriptors, symbols, or other dynamic behavior, the runtime takes or materializes a general representation.

Identity is equally important. If two variables reference the same array or object, a mutation through either alias must be visible through the other. SharpTS can specialize an eligible non-escaping shape or dense array, but it must fall back before representation details would change identity, aliasing, property order, or mutation.

## Use two runtimes with one contract

The interpreter represents language values with `RuntimeValue`, which distinguishes `Undefined`, `Null`, booleans, numbers, strings, objects, symbols, and big integers. `Interpreter` evaluates operators and property operations against that value model and the runtime object types.

Compiled programs do not ship the tree-walking interpreter. `ILCompiler` emits direct IL for cases proved safe by the type checker and emits only the generated runtime helpers required for dynamic cases. Those helpers implement operations such as truthiness, coercion, equality, property lookup, descriptors, prototypes, and array behavior inside the output assembly.

Direct IL and helper calls are different lowerings of the same source operation. A numeric addition can stay a .NET `double` operation when its operands are proven numeric; an addition involving dynamically shaped values must use JavaScript coercion. The optimization boundary may change the generated representation, but it must not change the program's observable answer.

> .NET types are an implementation substrate, not a replacement language contract. A JavaScript `number` follows IEEE 754 behavior, and a JavaScript object retains its prototype, identity, and descriptor semantics even when managed types store them.

Continue to [Functions, Closures, and State Machines](/docs/compiler-concepts/functions-closures-and-state-machines) to see how the same parity rule applies when execution escapes a stack frame or pauses at a suspension point.
