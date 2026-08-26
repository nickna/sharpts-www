import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.resolve(
    process.env.SHARPTS_WWW_BROWSER_OUTPUT || path.join(repoRoot, 'artifacts', 'browser-assets')
);
const artifactRoot = path.join(repoRoot, 'artifacts') + path.sep;

if (fs.existsSync(outputRoot)) {
    if (!outputRoot.startsWith(artifactRoot))
        throw new Error(`Refusing to replace browser output outside ${artifactRoot}: ${outputRoot}`);
    fs.rmSync(outputRoot, { recursive: true, force: true });
}

const result = await build({
    entryPoints: [
        path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'site-entry.ts'),
        path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'docs-entry.ts')
    ],
    outdir: outputRoot,
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    inject: [path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'prism-inject.ts')],
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'fonts/[name]-[hash]',
    metafile: true,
    loader: {
        '.woff': 'file',
        '.woff2': 'file'
    }
});

const conformanceResult = await build({
    entryPoints: [path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'conformance-entry.ts')],
    outdir: outputRoot,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    entryNames: '[name]-[hash]',
    metafile: true
});

const performanceResult = await build({
    entryPoints: [path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'performance-entry.ts')],
    outdir: outputRoot,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    entryNames: '[name]-[hash]',
    metafile: true
});

const outputs = [
    ...Object.entries(result.metafile.outputs),
    ...Object.entries(conformanceResult.metafile.outputs),
    ...Object.entries(performanceResult.metafile.outputs)
];
const entryOutput = outputs.find(
    ([outputPath, metadata]) => outputPath.endsWith('.js') && metadata.entryPoint?.endsWith('browser/site-entry.ts')
);
if (!entryOutput) throw new Error('Browser build did not emit the site JavaScript entry.');
const [entryScriptPath, entryMetadata] = entryOutput;
if (!entryMetadata.cssBundle) throw new Error('Browser build did not emit the site CSS entry.');
const conformanceOutput = outputs.find(
    ([outputPath, metadata]) =>
        outputPath.endsWith('.js') && metadata.entryPoint?.endsWith('browser/conformance-entry.ts')
);
if (!conformanceOutput) throw new Error('Browser build did not emit the conformance JavaScript entry.');
const [conformanceScriptPath] = conformanceOutput;
const performanceOutput = outputs.find(
    ([outputPath, metadata]) =>
        outputPath.endsWith('.js') && metadata.entryPoint?.endsWith('browser/performance-entry.ts')
);
if (!performanceOutput) throw new Error('Browser build did not emit the performance JavaScript entry.');
const [performanceScriptPath] = performanceOutput;
const docsOutput = outputs.find(
    ([outputPath, metadata]) => outputPath.endsWith('.js') && metadata.entryPoint?.endsWith('browser/docs-entry.ts')
);
if (!docsOutput) throw new Error('Browser build did not emit the documentation JavaScript entry.');
const [docsScriptPath] = docsOutput;

const relativeOutput = (outputPath) =>
    path.relative(outputRoot, path.resolve(repoRoot, outputPath)).replaceAll(path.sep, '/');
const manifest = {
    entry: {
        script: relativeOutput(entryScriptPath),
        style: relativeOutput(entryMetadata.cssBundle),
        conformanceScript: relativeOutput(conformanceScriptPath),
        performanceScript: relativeOutput(performanceScriptPath),
        docsScript: relativeOutput(docsScriptPath)
    },
    files: outputs.map(([outputPath]) => relativeOutput(outputPath)).sort()
};
for (const file of manifest.files.filter((file) => file.endsWith('.js') || file.endsWith('.css'))) {
    const filePath = path.join(outputRoot, file);
    const content = fs.readFileSync(filePath);
    fs.writeFileSync(
        `${filePath}.br`,
        brotliCompressSync(content, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
        })
    );
    fs.writeFileSync(`${filePath}.gz`, gzipSync(content, { level: 9 }));
}
fs.writeFileSync(path.join(outputRoot, 'browser-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Built deterministic browser assets at ${outputRoot}`);
