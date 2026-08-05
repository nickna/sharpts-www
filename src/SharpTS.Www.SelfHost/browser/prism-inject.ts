import PrismDefault from 'prismjs';

// Prism language components are distributed as scripts that reference a free
// `Prism` identifier. esbuild injects this named binding into those modules so
// the browser bundle never depends on an ambient global variable.
export const Prism = PrismDefault;
