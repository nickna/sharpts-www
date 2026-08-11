import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

if (!process.argv.includes('--accept'))
    throw new Error('Refusing to update snapshots without the explicit --accept flag.');

const repoRoot = path.resolve(import.meta.dirname, '..');
const publicRootIndex = process.argv.indexOf('--public-root');
const publicRoot = path.resolve(
    publicRootIndex >= 0
        ? process.argv[publicRootIndex + 1]
        : process.env.SHARPTS_WWW_PUBLIC_ROOT || path.join(repoRoot, 'artifacts', 'self-host', 'public')
);
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'site-manifest.json'), 'utf8'));
const paths = [
    ...manifest.routes.map((route) => route.file),
    manifest.stylesheet,
    manifest.installScript,
    'docs/api/search-index.json',
    ...manifest.browserBundle.filter((file) => file.endsWith('.js') || file.endsWith('.css'))
];
const uniquePaths = [...new Set(paths)];
const files = uniquePaths.map((file) => {
    const absolute = path.resolve(publicRoot, file);
    const allowedPrefix = publicRoot.endsWith(path.sep) ? publicRoot : publicRoot + path.sep;
    if (!absolute.startsWith(allowedPrefix) || !fs.statSync(absolute).isFile())
        throw new Error(`Snapshot path is missing or outside the public root: ${file}`);
    return {
        path: file.replaceAll(path.sep, '/'),
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
    };
});

const outputIndex = process.argv.indexOf('--output');
const snapshotPath = path.resolve(
    outputIndex >= 0
        ? process.argv[outputIndex + 1]
        : path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'site.snapshot.json')
);
fs.writeFileSync(snapshotPath, `${JSON.stringify({ version: 2, files }, null, 2)}\n`, 'utf8');
console.log(`Updated ${files.length} reviewed site snapshots at ${snapshotPath}`);
