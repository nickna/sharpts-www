import { beforeEach, describe, expect, it } from 'vitest';
import {
    initializeConformanceExplorer,
    readConformanceState
} from '../../src/SharpTS.Www.SelfHost/browser/conformance';

function fixture(): void {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `<main data-conformance-explorer>
      <div data-conformance-controls hidden>
        <input data-conformance-search>
        <button data-conformance-expand>Expand</button>
        <button data-conformance-collapse>Collapse</button>
        <button data-conformance-reset>Reset</button>
      </div>
      <section data-conformance-suite="test262" data-view-mode="compare">
        <div data-conformance-suite-controls hidden>
          <select data-conformance-mode><option value="compare">Compare</option><option value="interpreted">Interpreted</option><option value="compiled">Compiled</option></select>
          <select data-conformance-status><option value="all">All</option><option value="passing">Passing</option><option value="partial">Partial</option><option value="zero">Zero</option><option value="no-eligible">None</option></select>
        </div>
        <div class="conformance__tree">
          <details data-conformance-node data-conformance-name="built-ins" data-interpreted-status="partial" data-compiled-status="partial" open>
            <summary>Built-ins</summary>
            <div class="conformance__children">
              <div data-conformance-node data-conformance-name="array" data-interpreted-status="passing" data-compiled-status="partial"></div>
              <div data-conformance-node data-conformance-name="map" data-interpreted-status="zero" data-compiled-status="zero"></div>
            </div>
          </details>
        </div>
        <p data-conformance-empty hidden>None</p>
        <p data-conformance-result-count data-count-template="{count} groups"></p>
      </section>
      <section data-conformance-suite="typescript" data-view-mode="interpreted">
        <div data-conformance-suite-controls hidden>
          <select data-conformance-status><option value="all">All</option><option value="passing">Passing</option><option value="partial">Partial</option><option value="zero">Zero</option><option value="no-eligible">None</option></select>
        </div>
        <div class="conformance__tree"><div data-conformance-node data-conformance-name="conditional" data-interpreted-status="partial"></div></div>
        <p data-conformance-empty hidden>None</p>
        <p data-conformance-result-count data-count-template="{count} groups"></p>
      </section>
    </main>`;
}

describe('conformance explorer', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/conformance');
        fixture();
    });

    it('reveals controls and filters localized names while keeping ancestors', () => {
        initializeConformanceExplorer(document, window);
        expect(document.querySelector<HTMLElement>('[data-conformance-controls]')?.hidden).toBe(false);
        expect(document.querySelector('[data-conformance-result-count]')?.textContent).toBe('3 groups');

        const search = document.querySelector<HTMLInputElement>('[data-conformance-search]')!;
        search.value = 'array';
        search.dispatchEvent(new Event('input', { bubbles: true }));

        const builtIns = document.querySelector<HTMLElement>('[data-conformance-name="built-ins"]')!;
        const array = document.querySelector<HTMLElement>('[data-conformance-name="array"]')!;
        const map = document.querySelector<HTMLElement>('[data-conformance-name="map"]')!;
        expect(builtIns.hidden).toBe(false);
        expect(array.hidden).toBe(false);
        expect(map.hidden).toBe(true);
        expect(window.location.search).toBe('?q=array');
    });

    it('applies suite-specific status and mode state from shareable parameters', () => {
        window.history.replaceState(null, '', '/conformance?test262-mode=compiled&test262-status=passing');
        initializeConformanceExplorer(document, window);

        const suite = document.querySelector<HTMLElement>('[data-conformance-suite="test262"]')!;
        expect(suite.dataset.viewMode).toBe('compiled');
        expect(document.querySelector<HTMLElement>('[data-conformance-name="array"]')?.hidden).toBe(true);
        expect(document.querySelector<HTMLElement>('[data-conformance-name="map"]')?.hidden).toBe(true);
        expect(suite.querySelector<HTMLElement>('[data-conformance-empty]')?.hidden).toBe(false);
    });

    it('ignores invalid parameters and reset restores defaults', () => {
        window.history.replaceState(null, '', '/conformance?test262-mode=invalid&typescript-status=partial');
        expect(readConformanceState(window.location)).toEqual({
            query: '',
            test262Mode: 'compare',
            test262Status: 'all',
            typeScriptStatus: 'partial'
        });

        initializeConformanceExplorer(document, window);
        document.querySelector<HTMLButtonElement>('[data-conformance-reset]')!.click();
        expect(window.location.search).toBe('');
        expect(document.querySelector<HTMLSelectElement>('[data-conformance-mode]')?.value).toBe('compare');
        expect(document.querySelectorAll<HTMLElement>('[data-conformance-node][hidden]')).toHaveLength(0);
    });
});
