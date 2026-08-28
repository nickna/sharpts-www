import * as fs from 'fs';
import * as path from 'path';

export interface SharpTsSourceIdentity {
    revision: string;
    releaseVersion: string | null;
    displayVersion: string;
    sourceUrl: string;
}

const revisionPattern = /^[0-9a-f]{40}$/;
const releaseVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseSharpTsSourceSettings(source: string): SharpTsSourceIdentity {
    const values: { [name: string]: string } = {};
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator <= 0) throw new Error('Malformed SharpTS source setting: ' + line);
        const name = line.slice(0, separator);
        if (values[name] !== undefined) throw new Error('Duplicate SharpTS source setting: ' + name);
        values[name] = line.slice(separator + 1);
    }
    const revision = values.SHARPTS_SOURCE_REVISION;
    if (!revisionPattern.test(revision || ''))
        throw new Error('SHARPTS_SOURCE_REVISION must be a lowercase 40-character commit SHA');
    if (values.SHARPTS_RELEASE_VERSION === undefined)
        throw new Error('SHARPTS_RELEASE_VERSION must be present (and empty for an unreleased revision)');
    const releaseVersion = values.SHARPTS_RELEASE_VERSION || null;
    if (releaseVersion !== null && !releaseVersionPattern.test(releaseVersion))
        throw new Error('SHARPTS_RELEASE_VERSION must be empty or a semantic version without a v prefix');
    const displayVersion = releaseVersion === null ? revision.slice(0, 12) : releaseVersion;
    return {
        revision,
        releaseVersion,
        displayVersion,
        sourceUrl: 'https://github.com/nickna/SharpTS/commit/' + revision
    };
}

export function loadSharpTsSource(repoRoot: string): SharpTsSourceIdentity {
    return parseSharpTsSourceSettings(String(fs.readFileSync(path.join(repoRoot, 'sharpts-source.env'), 'utf8')));
}

export function sharpTsSourceReference(source: { revision: string; releaseVersion: string | null }): string {
    return source.releaseVersion === null ? source.revision : source.releaseVersion;
}
