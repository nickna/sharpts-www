import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
});
if (listed.status !== 0) throw new Error(listed.stderr || 'Unable to enumerate repository files.');

const patterns = [
    {
        name: 'private key',
        expression: new RegExp('-'.repeat(5) + 'BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-' + '-'.repeat(4))
    },
    { name: 'GitHub token', expression: /gh[pousr]_[A-Za-z0-9]{36,}/ },
    { name: 'GitHub fine-grained token', expression: /github_pat_[A-Za-z0-9_]{80,}/ },
    { name: 'AWS access key', expression: /AKIA[0-9A-Z]{16}/ },
    { name: 'npm token', expression: /npm_[A-Za-z0-9]{36,}/ },
    { name: 'Slack token', expression: /xox[baprs]-[A-Za-z0-9-]{20,}/ }
];

const findings = [];
let scanned = 0;
for (const relativePath of listed.stdout.split('\0').filter(Boolean)) {
    const filePath = path.join(repoRoot, relativePath);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    const content = fs.readFileSync(filePath);
    if (content.includes(0)) continue;
    scanned++;
    const text = content.toString('utf8');
    for (const pattern of patterns) {
        if (pattern.expression.test(text)) findings.push(`${relativePath}: possible ${pattern.name}`);
    }
}

if (findings.length > 0) throw new Error(`High-confidence credential patterns found:\n${findings.join('\n')}`);
console.log(`Scanned ${scanned} repository files for high-confidence credential patterns.`);
