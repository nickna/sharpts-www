import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const repoRoot = path.resolve(import.meta.dirname, '..');
const browserRoot = path.resolve(
    process.env.SHARPTS_WWW_BROWSER_OUTPUT || path.join(repoRoot, 'artifacts', 'browser-assets')
);
const manifest = JSON.parse(fs.readFileSync(path.join(browserRoot, 'browser-manifest.json'), 'utf8'));
const javascript = manifest.files.filter((file) => file.endsWith('.js'));
const initialJavaScript = javascript.filter(
    (file) => file === manifest.entry.script || file.startsWith('chunks/chunk-')
);
const conformanceJavaScript = javascript.filter((file) => file === manifest.entry.conformanceScript);
const docsJavaScript = javascript.filter((file) => file === manifest.entry.docsScript);

function size(files) {
    const buffers = files.map((file) => fs.readFileSync(path.join(browserRoot, file)));
    return {
        raw: buffers.reduce((total, buffer) => total + buffer.length, 0),
        brotli: buffers.reduce((total, buffer) => total + brotliCompressSync(buffer).length, 0)
    };
}

const initial = size(initialJavaScript);
const conformance = size(conformanceJavaScript);
const docs = size(docsJavaScript);
const total = size(javascript);
const budgets = {
    initialRaw: 60 * 1024,
    initialBrotli: 25 * 1024,
    conformanceRaw: 18 * 1024,
    conformanceBrotli: 7 * 1024,
    docsRaw: 8 * 1024,
    docsBrotli: 3 * 1024,
    totalRaw: 600 * 1024,
    totalBrotli: 180 * 1024
};
const failures = [];
if (initial.raw > budgets.initialRaw) failures.push(`initial raw ${initial.raw} > ${budgets.initialRaw}`);
if (initial.brotli > budgets.initialBrotli)
    failures.push(`initial Brotli ${initial.brotli} > ${budgets.initialBrotli}`);
if (conformance.raw > budgets.conformanceRaw)
    failures.push(`conformance raw ${conformance.raw} > ${budgets.conformanceRaw}`);
if (conformance.brotli > budgets.conformanceBrotli)
    failures.push(`conformance Brotli ${conformance.brotli} > ${budgets.conformanceBrotli}`);
if (docs.raw > budgets.docsRaw) failures.push(`docs raw ${docs.raw} > ${budgets.docsRaw}`);
if (docs.brotli > budgets.docsBrotli) failures.push(`docs Brotli ${docs.brotli} > ${budgets.docsBrotli}`);
if (total.raw > budgets.totalRaw) failures.push(`total raw ${total.raw} > ${budgets.totalRaw}`);
if (total.brotli > budgets.totalBrotli) failures.push(`total Brotli ${total.brotli} > ${budgets.totalBrotli}`);
if (failures.length) throw new Error(`Browser bundle budget exceeded:\n${failures.join('\n')}`);

console.log(
    JSON.stringify(
        {
            initial: { files: initialJavaScript, ...initial },
            conformance: { files: conformanceJavaScript, ...conformance },
            docs: { files: docsJavaScript, ...docs },
            total: { files: javascript, ...total },
            budgets
        },
        null,
        2
    )
);
