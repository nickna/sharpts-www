import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const submoduleRoot = path.join(repoRoot, 'lib', 'SharpTS');
const sourceFile = path.join(repoRoot, 'sharpts-source.env');
const allowDirtySharpTS = process.argv.includes('--allow-dirty-sharpts');
const values = Object.fromEntries(
    fs
        .readFileSync(sourceFile, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
            const separator = line.indexOf('=');
            if (separator <= 0) throw new Error(`Malformed SharpTS source setting: ${line}`);
            return [line.slice(0, separator), line.slice(separator + 1)];
        })
);

const revision = values.SHARPTS_SOURCE_REVISION;
if (!/^[0-9a-f]{40}$/.test(revision || ''))
    throw new Error('SHARPTS_SOURCE_REVISION must be a lowercase 40-character commit SHA.');

const submoduleGit = ['-c', `safe.directory=${submoduleRoot}`, '-C', submoduleRoot];
const checkout = execFileSync('git', [...submoduleGit, 'rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8'
}).trim();
if (checkout !== revision) throw new Error(`The checked-out SharpTS submodule is ${checkout}; expected ${revision}.`);

const status = execFileSync('git', [...submoduleGit, 'status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8'
}).trim();
if (status && !allowDirtySharpTS) throw new Error('The checked-out SharpTS submodule contains uncommitted changes.');
if (status) console.warn('Using a modified SharpTS checkout for this local development build.');

console.log(`Verified SharpTS at ${revision}.`);
