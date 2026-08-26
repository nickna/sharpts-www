SharpTS does not emit browser JavaScript and does not replace Vite, webpack, esbuild, or another browser bundler. It complements that toolchain with native and server-side TypeScript.

:::figure web-boundary

## Where SharpTS fits

Use SharpTS as a native companion for:

- Server-side TypeScript applications.
- Build-time and static-generation tasks.
- Native command-line tools.
- Compatible domain code shared with browser projects.

Your browser entry remains in its JavaScript toolchain. A separate native entry can run with SharpTS and can later be compiled to .NET IL.

## Organize the project boundary

A small project can make each environment explicit:

```text
src/
  browser/
    main.ts
  native/
    report.ts
  shared/
    pricing.ts
```

Put portable logic in `shared/pricing.ts`:

```typescript
export function total(prices: number[]): number {
    return prices.reduce((sum, price) => sum + price, 0);
}
```

The browser entry stays with the existing browser build:

```typescript
import { total } from "../shared/pricing";

document.querySelector("#total")!.textContent = String(total([12, 8, 5]));
```

The native entry imports the same pure function:

```typescript
import { total } from "../shared/pricing";

console.log(`Native total: ${total([12, 8, 5])}`);
```

Run or compile only the native entry:

```bash
sharpts src/native/report.ts
sharpts --compile src/native/report.ts
```

## Keep platform APIs separated

- Browser-only APIs such as `document`, DOM elements, and browser storage stay in browser modules.
- `dotnet:` imports stay in SharpTS-native modules.
- Shared modules use APIs supported by both environments and should avoid environment-specific side effects.
- npm and package compatibility must be checked for the package and APIs you use; do not assume that every browser or Node package is portable.

For current language support, see [Conformance](/conformance). For the compiler pipeline and architecture, see [Compilation and Native AOT](/docs/compiler-concepts/compilation-and-native-aot).
