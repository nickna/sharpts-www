import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeInteractions } from '../../src/SharpTS.Www.SelfHost/browser/interactions';

describe('static site interactions', () => {
    beforeEach(() => {
        document.body.innerHTML = `
          <header class="nav" data-nav>
            <a class="nav__logo" href="/"></a>
            <nav class="nav__links" data-nav-links><a href="#features">Features</a></nav>
            <button data-nav-toggle aria-expanded="false"></button>
          </header>
          <div class="code-block"><button data-copy-button data-copy-label="Copy" data-copied-label="Copied"><span>Copy</span></button><code>const safe = true;</code></div>
          <div data-examples>
            <button class="tab active" data-example-tab="1" aria-selected="true" tabindex="0"></button>
            <button class="tab" data-example-tab="2" aria-selected="false" tabindex="-1"></button>
            <div data-example-panel="1"></div><div data-example-panel="2" hidden><code class="language-typescript">let x = 1;</code></div>
          </div>
          <div data-architecture>
            <button data-architecture-stage="Lexer" aria-pressed="false"></button>
            <p data-architecture-hint>Choose</p>
            <div data-architecture-detail="Lexer" hidden>Lexer detail</div>
          </div>`;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) }
        });
        initializeInteractions(document, window);
    });

    afterEach(() => vi.useRealTimers());

    it('toggles and closes mobile navigation with accessible state', () => {
        const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]')!;
        const links = document.querySelector<HTMLElement>('[data-nav-links]')!;
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(links.classList.contains('nav__links--open')).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(links.classList.contains('nav__links--open')).toBe(false);
    });

    it('copies the adjacent code and restores localized feedback', async () => {
        vi.useFakeTimers();
        const button = document.querySelector<HTMLButtonElement>('[data-copy-button]')!;
        button.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const safe = true;');
        expect(button.textContent).toBe('Copied');
        expect(button.classList.contains('copied')).toBe(true);

        await vi.advanceTimersByTimeAsync(2000);
        expect(button.textContent).toBe('Copy');
        expect(button.classList.contains('copied')).toBe(false);
    });

    it('switches examples and architecture details without replacing content', () => {
        const secondTab = document.querySelector<HTMLButtonElement>('[data-example-tab="2"]')!;
        secondTab.click();
        expect(secondTab.getAttribute('aria-selected')).toBe('true');
        expect(document.querySelector<HTMLElement>('[data-example-panel="1"]')!.hidden).toBe(true);
        expect(document.querySelector<HTMLElement>('[data-example-panel="2"]')!.hidden).toBe(false);
        secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(document.querySelector<HTMLButtonElement>('[data-example-tab="1"]')!.getAttribute('aria-selected')).toBe('true');

        const lexer = document.querySelector<HTMLButtonElement>('[data-architecture-stage="Lexer"]')!;
        lexer.click();
        expect(lexer.getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector<HTMLElement>('[data-architecture-detail="Lexer"]')!.hidden).toBe(false);
        expect(document.querySelector<HTMLElement>('[data-architecture-hint]')!.hidden).toBe(true);
        lexer.click();
        expect(lexer.getAttribute('aria-pressed')).toBe('false');
    });
});
