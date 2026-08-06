import path from 'node:path';
import process from 'node:process';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.SHARPTS_WWW_E2E_PORT || 18181);
const origin = `http://127.0.0.1:${port}`;
const repoRoot = import.meta.dirname;
const bundleRoot = path.join(repoRoot, 'artifacts', 'self-host');
const workerName = process.platform === 'win32' ? 'SharpTS.Www.Worker.exe' : 'SharpTS.Www.Worker';

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 45_000,
    fullyParallel: true,
    workers: 2,
    reporter: 'line',
    use: {
        baseURL: origin,
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'dotnet artifacts/self-host/SharpTS.Www.SelfHost.dll',
        cwd: repoRoot,
        url: `${origin}/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
            ...process.env,
            PORT: String(port),
            SHARPTS_WWW_HOST: '127.0.0.1',
            SHARPTS_WWW_PUBLIC_ORIGIN: origin,
            SHARPTS_WWW_CONTENT_ROOT: path.join(bundleRoot, 'public'),
            SHARPTS_WWW_WORKER_PATH: path.join(bundleRoot, 'worker', workerName),
            SHARPTS_WWW_EXECUTIONS_PER_MINUTE: '100',
            SHARPTS_WWW_REQUIRE_RSS_MONITORING: process.platform === 'linux' ? 'true' : 'false'
        }
    }
});
