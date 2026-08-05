import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.resolve(
    process.env.SHARPTS_WWW_BROWSER_OUTPUT || path.join(repoRoot, 'artifacts', 'browser-assets'));
const artifactRoot = path.join(repoRoot, 'artifacts') + path.sep;

if (fs.existsSync(outputRoot)) {
    if (!outputRoot.startsWith(artifactRoot))
        throw new Error(`Refusing to replace browser output outside ${artifactRoot}: ${outputRoot}`);
    fs.rmSync(outputRoot, { recursive: true, force: true });
}

await build({
    entryPoints: [path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'browser', 'site.ts')],
    outdir: outputRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    inject: [path.join(
        repoRoot,
        'src',
        'SharpTS.Www.SelfHost',
        'browser',
        'prism-inject.ts')],
    entryNames: 'site',
    assetNames: 'fonts/[name]-[hash]',
    loader: {
        '.woff': 'file',
        '.woff2': 'file'
    }
});

console.log(`Built deterministic browser assets at ${outputRoot}`);
