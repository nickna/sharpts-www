import { expect, test } from '@playwright/test';

const expectedOrigin = `http://127.0.0.1:${process.env.SHARPTS_WWW_E2E_PORT || '18181'}`;

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: (text: string) => { (window as any).__copiedText = text; return Promise.resolve(); } }
        });
    });
});

test('static interactions work without Blazor or external browser assets', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin !== expectedOrigin)
            externalRequests.push(request.url());
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
    expect(await page.evaluate(() => (window as any).__copiedText)).toContain('dotnet tool install');

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
    page.on('console', message => {
        if (message.type() === 'error')
            consoleErrors.push(message.text());
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
