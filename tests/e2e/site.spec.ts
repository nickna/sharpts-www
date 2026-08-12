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

    const heroPowerShellTab = page.locator('#hero-installer-powershell-tab');
    await heroPowerShellTab.click();
    await expect(heroPowerShellTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#hero-installer-shell-tab')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#getting-started-installer-powershell-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#getting-started-installer-powershell-panel')).toBeVisible();

    const copy = page.locator('#hero-installer-powershell-panel [data-copy-button]');
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toBe(
        'irm https://sharpts.dev/setup.ps1 | iex'
    );

    await page.locator('[data-example-tab="2"]').click();
    await expect(page.locator('[data-example-panel="2"]')).toBeVisible();
    await expect(page.locator('[data-example-tab="2"]')).toHaveAttribute('aria-selected', 'true');

    const support = page.locator('#support');
    await support.scrollIntoViewIfNeeded();
    await expect(support.locator('.support-card')).toHaveCount(4);
    await expect(support.locator('.support-overview__actions a').first()).toHaveAttribute('href', '/conformance');
    const supportFitsViewport = await support.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const cards = Array.from(element.querySelectorAll<HTMLElement>('.support-card'));
        return (
            bounds.left >= 0 &&
            bounds.right <= window.innerWidth &&
            cards.every((card) => card.getBoundingClientRect().right <= window.innerWidth) &&
            (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth
        );
    });
    expect(supportFitsViewport).toBe(true);

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
    await expect(page.locator('[data-playground-timing-phase="serializeAssembly"]')).toBeVisible();
    await expect(page.locator('[data-playground-timing-phase="compile"]')).toHaveCount(0);
    await expect(page.locator('[data-playground-timing-phase="prepareInterpreter"]')).toHaveCount(0);

    await page.locator('[data-playground-timing-phase="execute"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-playground-timing-phase="load"]')).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const timingLayout = await page.locator('[data-playground-timing-details]').evaluate((element) => {
        const details = element as HTMLElement;
        const bounds = details.getBoundingClientRect();
        const widest = Array.from(details.querySelectorAll<HTMLElement>('*'))
            .map((candidate) => ({
                name: candidate.className || candidate.dataset.playgroundTimingPhase || candidate.tagName,
                right: candidate.getBoundingClientRect().right
            }))
            .sort((left, right) => right.right - left.right)[0];
        return {
            inViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
            noOverflow: details.scrollWidth <= details.clientWidth,
            clientWidth: details.clientWidth,
            scrollWidth: details.scrollWidth,
            widest
        };
    });
    expect(timingLayout).toMatchObject({ inViewport: true, noOverflow: true });

    const architectureHeading = page.locator('#architecture .section-title');
    await architectureHeading.scrollIntoViewIfNeeded();
    await expect(architectureHeading).toHaveCSS('opacity', '1');
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
        'validateModules',
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
        'validateModules',
        'typeCheck',
        'analyzeDeadCode',
        'initializeCompiler',
        'prepareCompilation',
        'extractNamespaces',
        'emitRuntimeTypes',
        'analyzeClosures',
        'defineProgramStructure',
        'analyzeModuleBindings',
        'defineDeclarations',
        'collectFunctions',
        'emitFunctionBodies',
        'emitMethodBodies',
        'emitEntryPoint',
        'finalizeTypes',
        'serializeAssembly',
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
        'validateModules',
        'typeCheck'
    ]);
    expect(failed.timings?.phases.at(-1)?.status).toBe('failed');
});

test('execution journey labels are available in every locale and reduced motion is honored', async ({ page }) => {
    const locales = [
        ['/', 'Execute', 'SharpTS pipeline: {duration}'],
        ['/de', 'Ausführen', 'SharpTS-Pipeline: {duration}'],
        ['/es', 'Ejecución', 'Proceso de SharpTS: {duration}'],
        ['/fr', 'Exécution', 'Pipeline SharpTS : {duration}'],
        ['/zh-Hans', '执行', 'SharpTS 流程：{duration}']
    ];
    for (const [route, executeLabel, pipelineLabel] of locales) {
        await page.goto(route);
        await expect(page.locator('[data-playground]')).toHaveAttribute('data-phase-execute-name', executeLabel);
        await expect(page.locator('[data-playground]')).toHaveAttribute('data-timing-sharp-ts-pipeline', pipelineLabel);
        await expect(page.locator('[data-playground]')).toHaveAttribute(
            'data-phase-serialize-assembly-description',
            /.+/
        );
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
    for (const route of [
        '/',
        '/how-it-works',
        '/conformance',
        '/docs/getting-started/desktop-gui',
        '/docs/getting-started/scripting',
        '/docs/compiler-concepts/performance',
        '/docs/api/gui/button',
        '/fr',
        '/fr/how-it-works',
        '/fr/conformance'
    ]) {
        await page.goto(route);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations, `${route}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
    }
});

test('documentation navigation, outlines, copy controls, and pagination work on desktop', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
        if (new URL(request.url()).origin !== expectedOrigin) externalRequests.push(request.url());
    });

    await page.goto('/docs/getting-started/cli-basics');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://sharpts.dev/docs/getting-started/cli-basics'
    );
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
    await expect(page.locator('.nav__link[aria-current="page"]')).toHaveText('Documentation');
    await expect(page.locator('.docs-sidebar a[aria-current="page"]')).toHaveText('CLI basics');
    await expect(page.locator('.docs-sidebar .docs-sidebar__section')).toHaveText([
        'Getting Started',
        'Compiler Concepts',
        'API Reference'
    ]);
    await expect(page.locator('.docs-outline a').first()).toHaveAttribute('href', '#open-the-repl');
    await expect(page.locator('.docs-pagination__previous')).toContainText('Installation');
    await expect(page.locator('.docs-pagination__next')).toContainText('Build a desktop GUI application');

    const feedback = page.locator('[data-docs-feedback]');
    await expect(feedback).toBeVisible();
    await expect(feedback.locator('a')).toHaveText(['Edit this page', 'Report a docs issue']);
    for (const link of await feedback.locator('a').all()) {
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener');
    }
    const edit = feedback.getByRole('link', { name: 'Edit this page' });
    await edit.focus();
    await expect(edit).toBeFocused();
    await expect(edit).toHaveCSS('outline-style', 'solid');

    const copy = page.locator('.docs-code [data-copy-button]').first();
    await copy.focus();
    await expect(copy).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(copy).toHaveClass(/copied/);
    expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toBe('sharpts');

    await page.goto('/docs/getting-started/desktop-gui');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://sharpts.dev/docs/getting-started/desktop-gui'
    );
    await expect(page.locator('.docs-sidebar a[aria-current="page"]')).toHaveText('Build a desktop GUI application');
    await expect(page.locator('.docs-outline a').first()).toHaveAttribute('href', '#install-the-prerequisites');
    await expect(page.locator('.docs-code code.language-tsx')).toContainText('createDesktopApplication');
    await expect(page.locator('.docs-pagination__previous')).toContainText('CLI basics');
    await expect(page.locator('.docs-pagination__next')).toContainText('Scripting with SharpTS');

    const guiCopy = page.locator('.docs-code [data-copy-button]').first();
    await guiCopy.focus();
    await page.keyboard.press('Enter');
    await expect(guiCopy).toHaveClass(/copied/);
    expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toContain(
        'dotnet --version'
    );

    await page.goto('/docs/getting-started/scripting');
    await expect(page.locator('.docs-sidebar a[aria-current="page"]')).toHaveText('Scripting with SharpTS');
    await expect(page.locator('.docs-outline a').first()).toHaveAttribute(
        'href',
        '#create-an-executable-typescript-script'
    );
    await expect(page.locator('.docs-figure')).toHaveAttribute('aria-label', 'Scripting execution path');
    await expect(page.locator('.docs-code code.language-typescript')).toContainText('#!/usr/bin/env sharpts');
    await expect(page.locator('.docs-pagination__previous')).toContainText('Build a desktop GUI application');
    await expect(page.locator('.docs-pagination__next')).toContainText('Compilation and Native AOT');

    await page.goto('/docs/compiler-concepts/javascript-semantics-on-dotnet');
    await expect(page.locator('.docs-sidebar a[aria-current="page"]')).toHaveText('JavaScript Semantics on .NET');
    await expect(page.locator('.docs-code code.language-typescript .token.keyword').first()).toHaveText('const');
    await expect(page.locator('.docs-outline a').first()).toHaveAttribute(
        'href',
        '#preserve-the-javascript-value-model'
    );
    await expect(page.locator('.docs-pagination__previous')).toContainText('Performance');
    await expect(page.locator('.docs-pagination__next')).toContainText('Functions, Closures, and State Machines');
    expect(externalRequests).toEqual([]);
});

test('API reference renders structured symbols and keyboard-searches the generated index', async ({ page }) => {
    await page.goto('/docs/api/gui/button');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://sharpts.dev/docs/api/gui/button'
    );
    await expect(page.locator('.docs-sidebar a[aria-current="page"]')).toHaveText('Button');
    await expect(page.locator('.api-article h1')).toHaveText('Button');
    await expect(page.locator('#signature')).toBeVisible();
    await expect(page.locator('#control-metadata + .api-metadata')).toContainText('Avalonia.Controls.Button');
    await expect(page.locator('#props + .api-table-wrap')).toContainText('onClick');
    await expect(page.locator('.docs-tested')).toContainText('@sharpts/gui');
    await expect(page.locator('.docs-tested a')).toHaveAttribute(
        'href',
        /github\.com\/nickna\/SharpTS\/tree\/[0-9a-f]{40}/
    );
    const feedback = page.locator('[data-docs-feedback]');
    await expect(feedback.locator('a')).toHaveText(['View source', 'Report an API docs issue']);
    await expect(feedback.getByRole('link', { name: 'View source' })).toHaveAttribute(
        'href',
        /github\.com\/nickna\/SharpTS\/blob\/[0-9a-f]{40}\/.+#L\d+/
    );
    for (const link of await feedback.locator('a').all()) {
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener');
    }

    const copy = page.locator('.api-signature [data-copy-button]').first();
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    expect(await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText)).toContain(
        'Button(props: ButtonProps): GuiElement'
    );

    const search = page.locator('[data-api-search-input]');
    await search.fill('button');
    const options = page.locator('[data-api-search-results] [role="option"]');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
    expect(optionCount).toBeLessThanOrEqual(10);
    await expect(options.first().locator('code')).toHaveText('Button');
    await search.press('ArrowDown');
    await expect(search).toHaveAttribute('aria-activedescendant', 'api-search-option-0');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/docs\/api\/gui\/button$/);

    await search.fill('no-such-sharpts-symbol');
    await expect(page.locator('.api-search__empty')).toContainText('No API symbols');
    expect(await page.content()).toContain('Browse API categories');
});

test('documentation mobile menus are keyboard accessible and fit the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/docs/compiler-concepts/modules-and-dependency-compilation');

    const globalMenu = page.locator('[data-nav-toggle]');
    await globalMenu.click();
    await expect(globalMenu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(globalMenu).toHaveAttribute('aria-expanded', 'false');

    const documentationMenu = page.locator('.docs-mobile-menu');
    await documentationMenu.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(documentationMenu).toHaveAttribute('open', '');
    await expect(documentationMenu.locator('a[aria-current="page"]')).toHaveText('Modules and Dependency Compilation');

    const outline = page.locator('.docs-mobile-outline');
    await outline.locator('summary').click();
    await expect(outline).toHaveAttribute('open', '');
    await expect(outline.locator('a').first()).toHaveText('Discover the program from its entry point');
    const feedback = page.locator('[data-docs-feedback]');
    await expect(feedback.locator('a')).toHaveText(['Edit this page', 'Report a docs issue']);
    await expect(feedback.locator('.docs-feedback__actions')).toHaveCSS('flex-wrap', 'wrap');
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);

    const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    expect(accessibility.violations).toEqual([]);
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
