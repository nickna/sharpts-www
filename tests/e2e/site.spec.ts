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

    await page.locator('[data-playground-mode="compile"]').click();
    await expect(page.locator('[data-playground-mode="compile"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-playground-run]').click();
    await expect(page.locator('.playground__stdout')).toContainText('Hello from SharpTS');
    await expect(page.locator('[data-playground-timing]')).toContainText('compilé');

    await page.locator('[data-playground-clear]').click();
    await expect(page.locator('.playground__placeholder')).toBeVisible();
    expect(consoleErrors).toEqual([]);
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
    for (const route of ['/', '/how-it-works', '/fr', '/fr/how-it-works']) {
        await page.goto(route);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations, `${route}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
    }
});
