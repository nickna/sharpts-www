import { beforeEach, describe, expect, it } from 'vitest';
import {
    initializePerformanceExplorer,
    readPerformanceState
} from '../../src/SharpTS.Www.SelfHost/browser/performance';

function row(family: string, size: number, compiled: number, node: number, bun: number | null): string {
    const runtimes = JSON.stringify({
        compiled: { status: 'measured', mean: compiled },
        interpreter: { status: 'measured', mean: compiled * 20 },
        node: { status: 'measured', mean: node },
        bun: bun === null ? { status: 'missing' } : { status: 'measured', mean: bun }
    }).replaceAll('"', '&quot;');
    return `<details data-performance-case data-family="${family}" data-size="${size}" data-search="${family} n=${size}" data-direction="lowerIsBetter" data-runtimes="${runtimes}" class="performance-case">
      <summary><span data-performance-ratio><div class="performance-ratio"><span class="performance-ratio__track"></span><strong data-performance-ratio-label></strong><span data-performance-status-label></span></div></span></summary>
    </details>`;
}

function fixture(): void {
    document.body.innerHTML = `<header data-nav><nav data-nav-links></nav><button data-nav-toggle aria-expanded="false"></button></header>
      <main data-performance-explorer data-label-faster="Faster" data-label-near-parity="Near parity" data-label-behind="Behind" data-label-unavailable="Unavailable">
        <div data-performance-controls hidden>
          <input data-performance-search>
          <select data-performance-implementation><option value="compiled">Compiled</option><option value="interpreter">Interpreter</option></select>
          <select data-performance-reference><option value="node">Node</option><option value="bun">Bun</option></select>
          <select data-performance-family><option value="all">All</option><option value="arrays">Arrays</option><option value="json">JSON</option></select>
          <select data-performance-size><option value="all">All</option><option value="100">100</option><option value="1000">1000</option></select>
          <button data-performance-reset>Reset</button>
        </div>
        ${row('arrays', 100, 2, 3, null)}
        ${row('json', 1000, 4, 3, 2)}
        <p data-performance-empty hidden></p>
        <p data-performance-result-count data-template="Showing {count} cases."></p>
      </main>`;
}

describe('performance explorer', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/performance');
        fixture();
    });

    it('reveals controls, classifies Node ratios, filters, and writes stable URL state', () => {
        initializePerformanceExplorer(document, window);
        expect(document.querySelector<HTMLElement>('[data-performance-controls]')?.hidden).toBe(false);
        expect(document.querySelector('[data-family="arrays"]')?.classList).toContain('performance-case--faster');
        const search = document.querySelector<HTMLInputElement>('[data-performance-search]')!;
        search.value = 'json';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.querySelector<HTMLElement>('[data-family="arrays"]')?.hidden).toBe(true);
        expect(document.querySelector<HTMLElement>('[data-family="json"]')?.hidden).toBe(false);
        expect(window.location.search).toBe('?q=json');
        expect(document.querySelector('[data-performance-result-count]')?.textContent).toBe('Showing 1 cases.');
    });

    it('restores shareable filters and exposes missing runtime evidence', () => {
        window.history.replaceState(null, '', '/performance?reference=bun&family=arrays&n=100');
        initializePerformanceExplorer(document, window);
        const arrays = document.querySelector<HTMLElement>('[data-family="arrays"]')!;
        const json = document.querySelector<HTMLElement>('[data-family="json"]')!;
        expect(arrays.hidden).toBe(false);
        expect(json.hidden).toBe(true);
        expect(arrays.classList).toContain('performance-case--unavailable');
        expect(arrays.querySelector('[data-performance-unavailable]')?.textContent).toBe('Unavailable');
    });

    it('ignores invalid state and reset restores compiled-vs-Node defaults', () => {
        window.history.replaceState(null, '', '/performance?implementation=bad&reference=bad&family=%3Cbad%3E&n=nope');
        expect(readPerformanceState(window.location)).toEqual({
            query: '',
            implementation: 'compiled',
            reference: 'node',
            family: 'all',
            size: 'all'
        });
        initializePerformanceExplorer(document, window);
        document.querySelector<HTMLSelectElement>('[data-performance-reference]')!.value = 'bun';
        document
            .querySelector<HTMLSelectElement>('[data-performance-reference]')!
            .dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-performance-reset]')!.click();
        expect(window.location.search).toBe('');
        expect(document.querySelector<HTMLSelectElement>('[data-performance-reference]')?.value).toBe('node');
        expect(document.querySelectorAll<HTMLElement>('[data-performance-case][hidden]')).toHaveLength(0);
    });
});
