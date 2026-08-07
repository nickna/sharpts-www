import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDocs } from '../../src/SharpTS.Www.SelfHost/browser/docs';
import { initializeCopyButtons } from '../../src/SharpTS.Www.SelfHost/browser/navigation-copy';

function markup(): HTMLButtonElement {
    document.body.innerHTML = `<header data-nav><a class="nav__logo" href="/"></a><nav data-nav-links><a href="#x">X</a></nav><button data-nav-toggle aria-expanded="false"></button></header>
      <div class="code-block"><button data-copy-button data-copy-label="Copy" data-copied-label="Copied"><span>Copy</span></button><code>sample</code></div>`;
    return document.querySelector<HTMLButtonElement>('[data-copy-button]')!;
}

describe('shared documentation and site controls', () => {
    afterEach(() => vi.useRealTimers());

    it('uses the selection fallback when the Clipboard API is unavailable', async () => {
        const button = markup();
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        const copy = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
        initializeCopyButtons(document, window);
        button.click();
        await Promise.resolve();
        expect(copy).toHaveBeenCalledWith('copy');
        expect(button.textContent).toBe('Copied');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('restarts copy feedback after repeated clicks', async () => {
        vi.useFakeTimers();
        const button = markup();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) }
        });
        initializeCopyButtons(document, window);
        button.click();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(1500);
        button.click();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(600);
        expect(button.textContent).toBe('Copied');
        await vi.advanceTimersByTimeAsync(1400);
        expect(button.textContent).toBe('Copy');
    });

    it('gives documentation pages the shared navigation and copy initializer', () => {
        const button = markup();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) }
        });
        initializeDocs(document, window);
        document.querySelector<HTMLButtonElement>('[data-nav-toggle]')!.click();
        expect(document.querySelector('[data-nav-links]')!.classList).toContain('nav__links--open');
        button.click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sample');
    });

    it('does not initialize the DOM when reusable browser modules are imported', async () => {
        vi.resetModules();
        document.body.innerHTML = '<main data-conformance-explorer><div data-conformance-controls hidden></div></main>';
        await import('../../src/SharpTS.Www.SelfHost/browser/conformance');
        await import('../../src/SharpTS.Www.SelfHost/browser/docs');
        await import('../../src/SharpTS.Www.SelfHost/browser/site');
        expect(document.querySelector('main')!.classList).not.toContain('conformance-explorer--enhanced');
        expect(document.querySelector<HTMLElement>('[data-conformance-controls]')!.hidden).toBe(true);
    });
});
