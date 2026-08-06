import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const artifactRoot = path.join(repoRoot, 'artifacts');
const outputRoot = path.join(artifactRoot, 'self-host');
const stagingRoot = path.join(artifactRoot, 'self-host-staging');

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function loadSourceSettings() {
    const source = fs.readFileSync(path.join(repoRoot, 'sharpts-source.env'), 'utf8');
    return Object.fromEntries(
        source
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => line.split('=', 2))
    );
}

function run(command, args, environment = {}, input = undefined) {
    const windowsNpm = process.platform === 'win32' && command === 'npm';
    if (windowsNpm && args.some((argument) => !/^[A-Za-z0-9:_-]+$/.test(argument)))
        throw new Error('Refusing to pass an unsafe npm argument through cmd.exe.');
    const executable = windowsNpm ? process.env.ComSpec || 'cmd.exe' : command;
    const commandArgs = windowsNpm ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
    const result = spawnSync(executable, commandArgs, {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, ...environment },
        input,
        maxBuffer: 64 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    return {
        status: result.status ?? 1,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        output: `${result.stdout || ''}\n${result.stderr || ''}`
    };
}

function requireSuccessful(result, description, markers = [], files = []) {
    if (
        result.status !== 0 ||
        markers.some((marker) => !result.output.includes(marker)) ||
        files.some((file) => !fs.existsSync(file))
    )
        throw new Error(`${description} failed.`);
}

function removeBuildDirectory(target) {
    const resolved = path.resolve(target);
    if (path.dirname(resolved) !== artifactRoot || !path.basename(resolved).startsWith('self-host'))
        throw new Error(`Refusing to remove unexpected build path: ${resolved}`);
    fs.rmSync(resolved, { recursive: true, force: true });
}

function normalizeOutput(value) {
    return String(value).replace(/\r\n/g, '\n').trimEnd();
}

function assertShowcaseOutput(example, mode, output) {
    const actual = normalizeOutput(output);
    const expected = normalizeOutput(example.expectedOutput);
    if (actual !== expected)
        throw new Error(
            `${example.key} produced unexpected ${mode} output.\nExpected:\n${expected}\nActual:\n${actual}`
        );
}

const configuration = option('--configuration', 'Release');
if (!/^[A-Za-z0-9._-]+$/.test(configuration)) throw new Error(`Invalid build configuration: ${configuration}`);

const project = path.resolve(repoRoot, option('--sharpts-project', 'lib/SharpTS/SharpTS.csproj'));
if (!project.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(project))
    throw new Error(`SharpTS project must be an existing file inside the repository: ${project}`);

requireSuccessful(run('node', ['scripts/verify-sharpts-source.mjs']), 'SharpTS source verification');
const settings = loadSourceSettings();
const buildProperties = [
    `-p:MinVerVersionOverride=0.0.0-local+${settings.SHARPTS_SOURCE_REVISION}`,
    `-p:SourceRevisionId=${settings.SHARPTS_SOURCE_REVISION}`,
    '-p:EnableSourceLink=false',
    '-p:EnableSourceControlManagerQueries=false',
    '-p:PublishRepositoryUrl=false'
];
const dotnetPrefix = [
    'run',
    '--project',
    project,
    '-c',
    configuration,
    '--no-launch-profile',
    ...buildProperties,
    '--'
];

fs.mkdirSync(artifactRoot, { recursive: true });
removeBuildDirectory(stagingRoot);
fs.mkdirSync(stagingRoot, { recursive: true });
let staged = true;

try {
    const serverOutput = path.join(stagingRoot, 'SharpTS.Www.SelfHost.dll');
    requireSuccessful(
        run('dotnet', [
            ...dotnetPrefix,
            '--compile',
            path.join(repoRoot, 'src/SharpTS.Www.SelfHost/server.ts'),
            '--verify',
            '-o',
            serverOutput
        ]),
        'SharpTS self-host compilation and IL verification',
        ['Compiled to', 'IL verification passed.'],
        [serverOutput]
    );

    const workerRoot = path.join(stagingRoot, 'worker');
    fs.mkdirSync(workerRoot, { recursive: true });
    const workerName = process.platform === 'win32' ? 'SharpTS.Www.Worker.exe' : 'SharpTS.Www.Worker';
    const workerOutput = path.join(workerRoot, workerName);
    requireSuccessful(
        run('dotnet', [
            ...dotnetPrefix,
            '--compile',
            path.join(repoRoot, 'src/SharpTS.Www.Worker/worker.ts'),
            '--target',
            'exe',
            '--verify',
            '-o',
            workerOutput
        ]),
        'SharpTS worker compilation and IL verification',
        ['Compiled to', 'IL verification passed.'],
        [workerOutput, path.join(workerRoot, 'SharpTS.dll')]
    );

    if (!fs.existsSync(path.join(repoRoot, 'package-lock.json')))
        throw new Error('Browser dependency lockfile is missing.');
    requireSuccessful(run('npm', ['ci']), 'Browser dependency restore');

    const browserRoot = path.join(stagingRoot, 'browser-assets');
    requireSuccessful(
        run('npm', ['run', 'build:browser'], {
            SHARPTS_WWW_BROWSER_OUTPUT: browserRoot
        }),
        'Browser asset build',
        [],
        [path.join(browserRoot, 'browser-manifest.json')]
    );
    const browserManifest = JSON.parse(fs.readFileSync(path.join(browserRoot, 'browser-manifest.json'), 'utf8'));
    for (const entry of [browserManifest.entry?.script, browserManifest.entry?.style]) {
        if (typeof entry !== 'string' || !fs.existsSync(path.join(browserRoot, entry)))
            throw new Error(`Browser entry asset is missing: ${entry}`);
    }

    const publicRoot = path.join(stagingRoot, 'public');
    requireSuccessful(
        run('dotnet', [...dotnetPrefix, path.join(repoRoot, 'src/SharpTS.Www.SelfHost/generate-site.ts')], {
            SHARPTS_WWW_SITE_REPO_ROOT: repoRoot,
            SHARPTS_WWW_SITE_OUTPUT: publicRoot,
            SHARPTS_WWW_BROWSER_OUTPUT: browserRoot
        }),
        'SharpTS static-site generation',
        ['Generated localized static site'],
        [path.join(publicRoot, 'site-manifest.json')]
    );

    const showcaseManifestPath = path.join(publicRoot, 'showcase-manifest.json');
    if (!fs.existsSync(showcaseManifestPath)) throw new Error('Generated showcase manifest is missing.');
    const showcaseRoot = path.join(stagingRoot, 'showcase-verification');
    fs.mkdirSync(showcaseRoot, { recursive: true });
    const examples = JSON.parse(fs.readFileSync(showcaseManifestPath, 'utf8'));
    for (const example of examples) {
        const sourcePath = path.join(showcaseRoot, `${example.key}.ts`);
        fs.writeFileSync(sourcePath, example.source, 'utf8');
        for (const mode of ['interpret', 'compile']) {
            if (example.executionSurface === 'worker') {
                const result = run(
                    workerOutput,
                    [],
                    {},
                    `${JSON.stringify({
                        Source: example.source,
                        TimeoutMs: 10_000,
                        Mode: mode
                    })}\n`
                );
                requireSuccessful(result, `${example.key} ${mode} worker execution`);
                const payload = JSON.parse(result.stdout.trim());
                if (payload.Success !== true)
                    throw new Error(`${example.key} failed in ${mode}: ${JSON.stringify(payload.Errors)}`);
                assertShowcaseOutput(example, mode, payload.Output);
            } else if (mode === 'interpret') {
                const result = run('dotnet', [
                    'run',
                    '--project',
                    project,
                    '-c',
                    configuration,
                    '--no-launch-profile',
                    '--no-build',
                    '--',
                    sourcePath
                ]);
                requireSuccessful(result, `${example.key} CLI interpretation`);
                assertShowcaseOutput(example, mode, result.stdout);
            } else {
                const compiledExample = path.join(showcaseRoot, `${example.key}.dll`);
                requireSuccessful(
                    run('dotnet', [...dotnetPrefix, '--compile', sourcePath, '--verify', '-o', compiledExample]),
                    `${example.key} CLI compilation`,
                    ['Compiled to', 'IL verification passed.'],
                    [compiledExample]
                );
                const result = run('dotnet', [compiledExample]);
                requireSuccessful(result, `${example.key} compiled execution`);
                assertShowcaseOutput(example, mode, result.stdout);
            }
        }
        console.log(`Verified ${example.key} in interpreter and compile modes via ${example.executionSurface}.`);
    }
    fs.rmSync(showcaseRoot, { recursive: true, force: true });

    fs.rmSync(browserRoot, { recursive: true, force: true });
    removeBuildDirectory(outputRoot);
    fs.renameSync(stagingRoot, outputRoot);
    staged = false;
    console.log(`Self-host bundle ready at ${outputRoot}`);
} finally {
    if (staged) removeBuildDirectory(stagingRoot);
}
