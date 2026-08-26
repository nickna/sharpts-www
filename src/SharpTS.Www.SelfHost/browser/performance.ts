import { initializeNavigation } from './navigation-copy';

type Implementation = 'compiled' | 'interpreter';
type Reference = 'node' | 'bun';
type ComparisonClass = 'faster' | 'nearParity' | 'behind';

export interface PerformanceExplorerState {
    query: string;
    implementation: Implementation;
    reference: Reference;
    family: string;
    size: string;
}

interface RuntimeValue {
    status: 'measured' | 'missing';
    mean?: number;
}

const implementations: Implementation[] = ['compiled', 'interpreter'];
const references: Reference[] = ['node', 'bun'];

function choice<T extends string>(value: string | null, choices: T[], fallback: T): T {
    return value !== null && choices.includes(value as T) ? value as T : fallback;
}

export function readPerformanceState(location: Location): PerformanceExplorerState {
    const parameters = new URLSearchParams(location.search);
    const family = parameters.get('family')?.trim() || 'all';
    const size = parameters.get('n')?.trim() || 'all';
    return {
        query: parameters.get('q')?.trim() || '',
        implementation: choice(parameters.get('implementation'), implementations, 'compiled'),
        reference: choice(parameters.get('reference'), references, 'node'),
        family: /^[a-z0-9-]+$/.test(family) ? family : 'all',
        size: size === 'all' || /^\d+(\.\d+)?$/.test(size) ? size : 'all'
    };
}

export function updatePerformanceUrl(win: Window, state: PerformanceExplorerState): void {
    const url = new URL(win.location.href);
    for (const key of ['q', 'implementation', 'reference', 'family', 'n'])
        url.searchParams.delete(key);
    if (state.query) url.searchParams.set('q', state.query);
    if (state.implementation !== 'compiled') url.searchParams.set('implementation', state.implementation);
    if (state.reference !== 'node') url.searchParams.set('reference', state.reference);
    if (state.family !== 'all') url.searchParams.set('family', state.family);
    if (state.size !== 'all') url.searchParams.set('n', state.size);
    win.history.replaceState(win.history.state, '', url);
}

function classify(ratio: number): ComparisonClass {
    if (ratio > 1.05) return 'faster';
    if (ratio < 0.95) return 'behind';
    return 'nearParity';
}

function ratioPosition(ratio: number): number {
    return Math.max(0, Math.min(100, 50 + Math.log2(ratio) * 12.5));
}

function formatRatio(ratio: number): string {
    const digits = ratio >= 10 ? 1 : 2;
    return ratio.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + '×';
}

function runtimeValues(row: HTMLElement): Record<string, RuntimeValue> {
    try {
        const result = JSON.parse(row.dataset.runtimes || '{}') as Record<string, RuntimeValue>;
        return result && typeof result === 'object' ? result : {};
    } catch {
        return {};
    }
}

function rowRatio(row: HTMLElement, state: PerformanceExplorerState): number | null {
    const values = runtimeValues(row);
    const implementation = values[state.implementation];
    const reference = values[state.reference];
    if (implementation?.status !== 'measured' || reference?.status !== 'measured' ||
        !implementation.mean || !reference.mean)
        return null;
    return row.dataset.direction === 'higherIsBetter'
        ? implementation.mean / reference.mean
        : reference.mean / implementation.mean;
}

function setRatio(row: HTMLElement, ratio: number | null, root: HTMLElement): void {
    const visual = row.querySelector<HTMLElement>('[data-performance-ratio]');
    if (!visual) return;
    row.classList.remove('performance-case--faster', 'performance-case--nearParity',
        'performance-case--behind', 'performance-case--unavailable');
    if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
        row.classList.add('performance-case--unavailable');
        const ratioElement = visual.querySelector<HTMLElement>('.performance-ratio');
        if (ratioElement) ratioElement.hidden = true;
        let unavailable = visual.querySelector<HTMLElement>('[data-performance-unavailable]');
        if (!unavailable) {
            unavailable = document.createElement('span');
            unavailable.dataset.performanceUnavailable = '';
            unavailable.className = 'performance-ratio__unavailable';
            visual.append(unavailable);
        }
        unavailable.textContent = root.dataset.labelUnavailable || 'Unavailable';
        unavailable.hidden = false;
        return;
    }
    visual.querySelector<HTMLElement>('[data-performance-unavailable]')?.setAttribute('hidden', '');
    const classification = classify(ratio);
    row.classList.add('performance-case--' + classification);
    const ratioElement = visual.querySelector<HTMLElement>('.performance-ratio');
    if (!ratioElement) return;
    ratioElement.hidden = false;
    ratioElement.className = 'performance-ratio performance-ratio--' + classification;
    const position = ratioPosition(ratio);
    ratioElement.style.setProperty('--ratio-position', position.toFixed(3) + '%');
    ratioElement.style.setProperty('--ratio-start', Math.min(50, position).toFixed(3) + '%');
    ratioElement.style.setProperty('--ratio-width', Math.abs(position - 50).toFixed(3) + '%');
    const label = ratioElement.querySelector<HTMLElement>('[data-performance-ratio-label]');
    const status = ratioElement.querySelector<HTMLElement>('[data-performance-status-label]');
    const statusKey = classification === 'nearParity' ? 'labelNearParity'
        : classification === 'faster' ? 'labelFaster' : 'labelBehind';
    const statusText = root.dataset[statusKey] || classification;
    if (label) label.textContent = formatRatio(ratio);
    if (status) status.textContent = statusText;
    ratioElement.setAttribute('aria-label', formatRatio(ratio) + ' — ' + statusText);
}

function selectValue(root: HTMLElement, selector: string, value: string, fallback: string): string {
    const select = root.querySelector<HTMLSelectElement>(selector);
    if (!select) return fallback;
    const available = Array.from(select.options).some(option => option.value === value);
    select.value = available ? value : fallback;
    return select.value;
}

export function initializePerformanceExplorer(doc: Document = document, win: Window = window): void {
    initializeNavigation(doc, win);
    const root = doc.querySelector<HTMLElement>('[data-performance-explorer]');
    if (!root) return;
    let state = readPerformanceState(win.location);
    const controls = root.querySelector<HTMLElement>('[data-performance-controls]');
    if (controls) controls.hidden = false;

    const apply = (): void => {
        const search = root.querySelector<HTMLInputElement>('[data-performance-search]');
        if (search) search.value = state.query;
        state.implementation = selectValue(root, '[data-performance-implementation]', state.implementation,
            'compiled') as Implementation;
        state.reference = selectValue(root, '[data-performance-reference]', state.reference, 'node') as Reference;
        state.family = selectValue(root, '[data-performance-family]', state.family, 'all');
        state.size = selectValue(root, '[data-performance-size]', state.size, 'all');
        let visible = 0;
        for (const row of root.querySelectorAll<HTMLElement>('[data-performance-case]')) {
            const matches = (!state.query || (row.dataset.search || '').includes(state.query.toLowerCase())) &&
                (state.family === 'all' || row.dataset.family === state.family) &&
                (state.size === 'all' || row.dataset.size === state.size);
            row.hidden = !matches;
            if (matches) visible++;
            setRatio(row, rowRatio(row, state), root);
        }
        const empty = root.querySelector<HTMLElement>('[data-performance-empty]');
        if (empty) empty.hidden = visible !== 0;
        const count = root.querySelector<HTMLElement>('[data-performance-result-count]');
        if (count) count.textContent = (count.dataset.template || '{count}').replace('{count}', String(visible));
    };
    const commit = (): void => {
        apply();
        updatePerformanceUrl(win, state);
    };
    root.querySelector<HTMLInputElement>('[data-performance-search]')?.addEventListener('input', event => {
        state.query = (event.currentTarget as HTMLInputElement).value.trim();
        commit();
    });
    const bindSelect = (selector: string, update: (value: string) => void): void => {
        root.querySelector<HTMLSelectElement>(selector)?.addEventListener('change', event => {
            update((event.currentTarget as HTMLSelectElement).value);
            commit();
        });
    };
    bindSelect('[data-performance-implementation]', value => { state.implementation = value as Implementation; });
    bindSelect('[data-performance-reference]', value => { state.reference = value as Reference; });
    bindSelect('[data-performance-family]', value => { state.family = value; });
    bindSelect('[data-performance-size]', value => { state.size = value; });
    root.querySelector<HTMLButtonElement>('[data-performance-reset]')?.addEventListener('click', () => {
        state = { query: '', implementation: 'compiled', reference: 'node', family: 'all', size: 'all' };
        commit();
    });
    win.addEventListener('popstate', () => {
        state = readPerformanceState(win.location);
        apply();
    });
    apply();
}
