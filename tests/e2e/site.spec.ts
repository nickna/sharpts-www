import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { presets } from '../../src/SharpTS.Www.SelfHost/presets';
import { showcaseExamples } from '../../src/SharpTS.Www.SelfHost/showcase-data';
import type { ExecutionMode, ExecutionResponse } from '../../src/SharpTS.Www.Shared/execution-contract';

const expectedOrigin = `http://127.0.0.1:${process.env.SHARPTS_WWW_E2E_PORT || '18181'}`;

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: (text: string) => {
                    (window as Window & { __copiedText?: string }).__copiedText = text;
                    return Promise.resolve();
                }
            }
        });
    });
});

test('malformed playground input is rejected without destabilizing the host', async ({ request }) => {
    const response = await request.post('/api/run', {
        headers: { 'Content-Type': 'application/json' },
        data: 'null'
    });
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        errors: [{ message: 'Source code cannot be empty.' }]
    });

    const health = await request.get('/health');
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'healthy' });
});

test('static interactions work without Blazor or external browser assets', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== expectedOrigin) externalRequests.push(request.url());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.token').first()).toBeVisible();

    const menu = page.locator('[data-nav-toggle]');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-nav-links]')).toHaveClass(/nav__links--open/);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    const copy = page.locator('.hero__install [data-copy-button]');
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toContain(
        'dotnet tool install'
    );

    await page.locator('[data-example-tab="2"]').click();
    await expect(page.locator('[data-example-panel="2"]')).toBeVisible();
    await expect(page.locator('[data-example-tab="2"]')).toHaveAttribute('aria-selected', 'true');

    await page.goto('/how-it-works');
    await page.locator('[data-architecture-stage="Lexer"]').click();
    await expect(page.locator('[data-architecture-stage="Lexer"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-architecture-detail="Lexer"]')).toBeVisible();
    expect(externalRequests).toEqual([]);
});

test('playground presets execute in both modes and localized assets stay local', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('#playground-editor .cm-editor')).toBeVisible();
    await page.locator('[data-playground-preset]').selectOption('Hello World');

    await page.locator('[data-playground-run]').click();
    await expect(page.locator('.playground__stdout')).toContainText('Hello from SharpTS');
    await expect(page.locator('[data-playground-run]')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-playground-timing-headline]')).toContainText('Exécuté');
    await page.locator('[data-playground-timing]').click();
    await expect(page.locator('[data-playground-timing-details]')).toBeVisible();
    await expect(page.locator('[data-playground-timing-phase="tokenize"]')).toBeVisible();
    await expect(page.locator('[data-playground-timing-phase="execute"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-playground-timing-phase="queue"]')).toHaveCount(0);
    await expect(page.locator('[data-playground-timing-phase="isolatedWorker"]')).toHaveCount(0);
    await expect(page.locator('[data-playground-timing-description]')).not.toBeEmpty();
    await expect(page.locator('[data-playground-timing-pipeline]')).toContainText('SharpTS');

    await page.locator('[data-playground-mode="compile"]').click();
    await expect(page.locator('[data-playground-mode="compile"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-playground-run]').click();
    await expect(page.locator('.playground__stdout')).toContainText('Hello from SharpTS');
    await expect(page.locator('[data-playground-timing-headline]')).toContainText('Exécuté');
    await page.locator('[data-playground-timing]').click();
    await expect(page.locator('[data-playground-timing-phase="compile"]')).toBeVisible();
    await expect(page.locator('[data-playground-timing-phase="prepareInterpreter"]')).toHaveCount(0);

    await page.locator('[data-playground-timing-phase="execute"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-playground-timing-phase="load"]')).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.locator('[data-playground-timing-details]').evaluate((element) => {
            const details = element as HTMLElement;
            const bounds = details.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= window.innerWidth && details.scrollWidth <= details.clientWidth;
        })
    ).toBe(true);

    const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.locator('[data-playground-clear]').click();
    await expect(page.locator('.playground__placeholder')).toBeVisible();
    expect(consoleErrors).toEqual([]);
});

test('execution timing contract reports mode-specific and partial phase sequences', async ({ request }) => {
    const run = async (source: string, mode: ExecutionMode): Promise<ExecutionResponse> => {
        const response = await request.post('/api/run', { data: { source, mode } });
        expect(response.status()).toBe(200);
        return (await response.json()) as ExecutionResponse;
    };

    const interpreted = await run('console.log(42);', 'interpret');
    expect(interpreted.timings?.phases.map((phase) => phase.name)).toEqual([
        'queue',
        'isolatedWorker',
        'tokenize',
        'parse',
        'typeCheck',
        'prepareInterpreter',
        'execute'
    ]);

    const compiled = await run('console.log(42);', 'compile');
    expect(compiled.timings?.phases.map((phase) => phase.name)).toEqual([
        'queue',
        'isolatedWorker',
        'tokenize',
        'parse',
        'typeCheck',
        'compile',
        'load',
        'execute'
    ]);

    const failed = await run("let value: number = 'wrong';", 'interpret');
    expect(failed.success).toBe(false);
    expect(failed.timings?.phases.map((phase) => phase.name)).toEqual([
        'queue',
        'isolatedWorker',
        'tokenize',
        'parse',
        'typeCheck'
    ]);
    expect(failed.timings?.phases.at(-1)?.status).toBe('failed');
});

test('execution journey labels are available in every locale and reduced motion is honored', async ({ page }) => {
    const locales = [
        ['/', 'Execute', 'SharpTS pipeline: {0}'],
        ['/de', 'Ausführen', 'SharpTS-Pipeline: {0}'],
        ['/es', 'Ejecución', 'Proceso de SharpTS: {0}'],
        ['/fr', 'Exécution', 'Pipeline SharpTS : {0}'],
        ['/zh-Hans', '执行', 'SharpTS 流程：{0}']
    ];
    for (const [route, executeLabel, pipelineLabel] of locales) {
        await page.goto(route);
        await expect(page.locator('[data-playground]')).toHaveAttribute('data-phase-execute-name', executeLabel);
        await expect(page.locator('[data-playground]')).toHaveAttribute('data-timing-sharp-ts-pipeline', pipelineLabel);
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-playground-run]').click();
    await expect(page.locator('[data-playground-run]')).toHaveAttribute('aria-busy', 'false');
    await page.locator('[data-playground-timing]').click();
    await expect(page.locator('[data-playground-timing-phase]').first()).toHaveCSS('animation-name', 'none');
});

test('every advertised example and playground preset executes in both modes', async ({ page, request }) => {
    test.setTimeout(300_000);
    await page.goto('/');

    const displayedSources = await page
        .locator('[data-example-panel] code.language-typescript')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent || ''));
    expect(displayedSources).toHaveLength(showcaseExamples.length);

    const execute = async (source: string, mode: ExecutionMode): Promise<ExecutionResponse> => {
        const response = await request.post('/api/run', { data: { source, mode, timeoutMs: 10_000 } });
        expect(response.status(), `${mode} request should be accepted`).toBe(200);
        return (await response.json()) as ExecutionResponse;
    };

    for (let index = 0; index < displayedSources.length; index++) {
        if (showcaseExamples[index].executionSurface !== 'worker') continue;
        for (const mode of ['interpret', 'compile'] as ExecutionMode[]) {
            const result = await execute(displayedSources[index], mode);
            expect(
                result.success,
                `${showcaseExamples[index].key} failed in ${mode}: ${JSON.stringify(result.errors)}`
            ).toBe(true);
            for (const expected of showcaseExamples[index].expectedOutputIncludes)
                expect(result.output).toContain(expected);
        }
    }

    for (const preset of presets) {
        for (const mode of ['interpret', 'compile'] as ExecutionMode[]) {
            const result = await execute(preset.source, mode);
            expect(result.success, `${preset.name} failed in ${mode}: ${JSON.stringify(result.errors)}`).toBe(true);
            expect(result.output.trim(), `${preset.name} produced no output in ${mode}`).not.toBe('');
        }
    }
});

test('representative localized pages meet automated WCAG checks', async ({ page }) => {
    for (const route of ['/', '/how-it-works', '/conformance', '/fr', '/fr/how-it-works', '/fr/conformance']) {
        await page.goto(route);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations, `${route}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
    }
});

test('conformance explorer is localized, filterable, and natively collapsible', async ({ page }) => {
    await page.goto('/de/conformance');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('[data-conformance-suite="test262"]')).toBeVisible();
    await expect(page.locator('[data-conformance-suite="typescript"]')).toBeVisible();
    await expect(page.locator('[data-conformance-controls]')).toBeVisible();
    const root = page.locator('.conformance__node--depth-0').first();
    await expect(root).toHaveAttribute('open', '');
    await root.locator(':scope > summary').click();
    await expect(root).not.toHaveAttribute('open', '');
    await expect(page.locator('.conformance__bar').first()).toHaveAttribute('role', 'img');
    const outcomeColors = await page.evaluate(() => {
        const color = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) throw new Error(`Missing conformance color element: ${selector}`);
            return getComputedStyle(element).backgroundColor;
        };
        return {
            passSegment: color('.conformance__bar .conformance__bar-segment--pass'),
            passLegend: color('.conformance__legend .conformance__bar-segment--pass'),
            failSegment: color('.conformance__bar .conformance__bar-segment--fail'),
            failLegend: color('.conformance__legend .conformance__bar-segment--fail')
        };
    });
    expect(outcomeColors.passSegment).toBe(outcomeColors.passLegend);
    expect(outcomeColors.failSegment).toBe(outcomeColors.failLegend);
    expect(outcomeColors.passSegment).not.toBe(outcomeColors.failSegment);

    await page.locator('[data-conformance-search]').fill('Array');
    await expect(page).toHaveURL(/q=Array/);
    await expect(page.locator('[data-conformance-name="array"]').first()).toBeVisible();
    await page.locator('[data-conformance-reset]').click();
    await expect(page).not.toHaveURL(/q=/);
});

test('conformance remains readable without JavaScript and fits a mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/conformance');

    await expect(page.locator('[data-conformance-controls]')).toBeHidden();
    await expect(page.locator('[data-conformance-suite="test262"]')).toBeVisible();
    await expect(page.locator('[data-conformance-suite="typescript"]')).toBeVisible();
    const root = page.locator('.conformance__node--depth-0').first();
    await root.locator(':scope > summary').click();
    await expect(root).not.toHaveAttribute('open', '');
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    await context.close();
});
