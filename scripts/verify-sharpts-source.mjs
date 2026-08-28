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
if (!Object.hasOwn(values, 'SHARPTS_RELEASE_VERSION'))
    throw new Error('SHARPTS_RELEASE_VERSION must be present (and empty for an unreleased revision).');
const releaseVersion = values.SHARPTS_RELEASE_VERSION;
if (
    releaseVersion &&
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(releaseVersion)
)
    throw new Error('SHARPTS_RELEASE_VERSION must be empty or a semantic version without a v prefix.');

const submoduleGit = ['-c', `safe.directory=${submoduleRoot}`, '-C', submoduleRoot];
const checkout = execFileSync('git', [...submoduleGit, 'rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8'
}).trim();
if (checkout !== revision) throw new Error(`The checked-out SharpTS submodule is ${checkout}; expected ${revision}.`);

const releaseTags = execFileSync('git', [...submoduleGit, 'tag', '--points-at', 'HEAD', '--list', 'v*'], {
    cwd: repoRoot,
    encoding: 'utf8'
})
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter((tag) =>
        /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)
    );
if (releaseVersion && !releaseTags.includes(`v${releaseVersion}`))
    throw new Error(`SharpTS ${revision} is not tagged v${releaseVersion}.`);
if (!releaseVersion && releaseTags.length)
    throw new Error(
        `SharpTS ${revision} is released as ${releaseTags.join(', ')}; SHARPTS_RELEASE_VERSION must identify it.`
    );

const status = execFileSync('git', [...submoduleGit, 'status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8'
}).trim();
if (status && !allowDirtySharpTS) throw new Error('The checked-out SharpTS submodule contains uncommitted changes.');
if (status) console.warn('Using a modified SharpTS checkout for this local development build.');

console.log(`Verified SharpTS at ${releaseVersion || revision}.`);
