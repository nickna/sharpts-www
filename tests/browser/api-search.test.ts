import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    initializeApiSearch,
    rankApiSearchResults,
    type ApiSearchSymbol
} from '../../src/SharpTS.Www.SelfHost/browser/docs';

const symbols: ApiSearchSymbol[] = [
    {
        id: 'index:Button',
        name: 'Button',
        aliases: ['button control'],
        category: 'Components',
        summary: 'Activates an action.',
        kind: 'Component',
        route: '/docs/api/gui/button'
    },
    {
        id: 'index:ButtonProps',
        name: 'ButtonProps',
        aliases: ['Button props'],
        category: 'Components',
        summary: 'Properties accepted by Button.',
        kind: 'Interface',
        route: '/docs/api/gui/button-props'
    },
    {
        id: 'index:createButtonModel',
        name: 'createButtonModel',
        aliases: [],
        category: 'Core and Composition',
        summary: 'Creates a model containing button state.',
        kind: 'Function',
        route: '/docs/api/gui/create-button-model'
    }
];

function markup(): void {
    document.body.innerHTML = `<section data-api-search data-search-url="/docs/api/search-index.json">
      <input data-api-search-input aria-expanded="false">
      <ul data-api-search-results hidden></ul>
      <p data-api-search-status></p>
    </section>`;
}

describe('API reference search', () => {
    beforeEach(markup);

    it('prioritizes exact and prefix names before aliases and summary matches', () => {
        expect(rankApiSearchResults(symbols, 'button').map((symbol) => symbol.name)).toEqual([
            'Button',
            'ButtonProps',
            'createButtonModel'
        ]);
        expect(rankApiSearchResults(symbols, 'BUTTON')[0].name).toBe('Button');
        expect(rankApiSearchResults(symbols, 'missing')).toEqual([]);
    });

    it('lazy-loads, renders an empty state, and exposes keyboard selection', async () => {
        const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ symbols }) }));
        Object.defineProperty(window, 'fetch', { configurable: true, value: fetch });
        initializeApiSearch(document, window);
        const input = document.querySelector<HTMLInputElement>('[data-api-search-input]')!;
        const list = document.querySelector<HTMLUListElement>('[data-api-search-results]')!;

        expect(fetch).not.toHaveBeenCalled();
        input.focus();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        input.value = 'button';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(list.querySelectorAll('[role="option"]')).toHaveLength(3));
        expect(input.getAttribute('aria-expanded')).toBe('true');

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(input.getAttribute('aria-activedescendant')).toBe('api-search-option-0');
        expect(list.querySelector('[aria-selected="true"] code')?.textContent).toBe('Button');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(list.hidden).toBe(true);

        input.value = 'zzzz';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await vi.waitFor(() =>
            expect(list.querySelector('.api-search__empty')?.textContent).toContain('No API symbols')
        );
    });
});
