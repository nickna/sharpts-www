type ConformanceStatus = 'all' | 'passing' | 'partial' | 'zero' | 'no-eligible';
type Test262Mode = 'compare' | 'interpreted' | 'compiled';

interface ExplorerState {
    query: string;
    test262Mode: Test262Mode;
    test262Status: ConformanceStatus;
    typeScriptStatus: ConformanceStatus;
}

const statuses: ConformanceStatus[] = ['all', 'passing', 'partial', 'zero', 'no-eligible'];
const modes: Test262Mode[] = ['compare', 'interpreted', 'compiled'];

function choice<T extends string>(value: string | null, values: T[], fallback: T): T {
    return value !== null && values.includes(value as T) ? value as T : fallback;
}

export function readConformanceState(location: Location): ExplorerState {
    const parameters = new URLSearchParams(location.search);
    return {
        query: parameters.get('q')?.trim() || '',
        test262Mode: choice(parameters.get('test262-mode'), modes, 'compare'),
        test262Status: choice(parameters.get('test262-status'), statuses, 'all'),
        typeScriptStatus: choice(parameters.get('typescript-status'), statuses, 'all')
    };
}

function updateConformanceUrl(win: Window, state: ExplorerState): void {
    const url = new URL(win.location.href);
    for (const key of ['q', 'test262-mode', 'test262-status', 'typescript-status'])
        url.searchParams.delete(key);
    if (state.query)
        url.searchParams.set('q', state.query);
    if (state.test262Mode !== 'compare')
        url.searchParams.set('test262-mode', state.test262Mode);
    if (state.test262Status !== 'all')
        url.searchParams.set('test262-status', state.test262Status);
    if (state.typeScriptStatus !== 'all')
        url.searchParams.set('typescript-status', state.typeScriptStatus);
    win.history.replaceState(win.history.state, '', url);
}

function directChildren(node: HTMLElement): HTMLElement[] {
    const container = Array.from(node.children).find(child => child.classList.contains('conformance__children'));
    if (!container)
        return [];
    return Array.from(container.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-conformance-node')
    );
}

function nodeMatchesStatus(node: HTMLElement, status: ConformanceStatus,
    mode: Test262Mode | 'interpreted'): boolean {
    if (status === 'all')
        return true;
    if (mode === 'compare')
        return node.dataset.interpretedStatus === status || node.dataset.compiledStatus === status;
    return node.dataset[`${mode}Status`] === status;
}

function filterNode(node: HTMLElement, query: string, status: ConformanceStatus,
    mode: Test262Mode | 'interpreted', inheritedNameMatch: boolean): { visible: boolean; count: number } {
    const ownNameMatch = query.length === 0 || (node.dataset.conformanceName || '').includes(query);
    const nameMatch = inheritedNameMatch || ownNameMatch;
    const childNameMatch = inheritedNameMatch || (query.length > 0 && ownNameMatch);
    let childVisible = false;
    let count = 0;
    for (const child of directChildren(node)) {
        const result = filterNode(child, query, status, mode, childNameMatch);
        childVisible ||= result.visible;
        count += result.count;
    }
    const selfVisible = nameMatch && nodeMatchesStatus(node, status, mode);
    const visible = selfVisible || childVisible;
    node.hidden = !visible;
    if (visible)
        count++;
    if (node instanceof HTMLDetailsElement && childVisible && (query.length > 0 || status !== 'all'))
        node.open = true;
    return { visible, count };
}

function suiteRoots(suite: HTMLElement): HTMLElement[] {
    const tree = suite.querySelector<HTMLElement>('.conformance__tree');
    if (!tree)
        return [];
    return Array.from(tree.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-conformance-node')
    );
}

function setControlValues(root: HTMLElement, state: ExplorerState): void {
    const search = root.querySelector<HTMLInputElement>('[data-conformance-search]');
    const test262 = root.querySelector<HTMLElement>('[data-conformance-suite="test262"]');
    const typeScript = root.querySelector<HTMLElement>('[data-conformance-suite="typescript"]');
    if (search)
        search.value = state.query;
    const mode = test262?.querySelector<HTMLSelectElement>('[data-conformance-mode]');
    const testStatus = test262?.querySelector<HTMLSelectElement>('[data-conformance-status]');
    const typeScriptStatus = typeScript?.querySelector<HTMLSelectElement>('[data-conformance-status]');
    if (mode)
        mode.value = state.test262Mode;
    if (testStatus)
        testStatus.value = state.test262Status;
    if (typeScriptStatus)
        typeScriptStatus.value = state.typeScriptStatus;
}

function detailsElements(root: HTMLElement): HTMLDetailsElement[] {
    return Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-conformance-node]'));
}

export function initializeConformanceExplorer(doc: Document = document, win: Window = window): void {
    const root = doc.querySelector<HTMLElement>('[data-conformance-explorer]');
    if (!root || root.classList.contains('conformance-explorer--enhanced'))
        return;

    root.classList.add('conformance-explorer--enhanced');
    root.querySelectorAll<HTMLElement>('[data-conformance-controls], [data-conformance-suite-controls]')
        .forEach(control => { control.hidden = false; });

    let state = readConformanceState(win.location);
    let filtering = false;
    let expansionSnapshot = new Map<HTMLDetailsElement, boolean>();

    const apply = (): void => {
        setControlValues(root, state);
        const query = state.query.toLocaleLowerCase(doc.documentElement.lang || undefined);
        const active = query.length > 0 || state.test262Status !== 'all' || state.typeScriptStatus !== 'all';
        if (active && !filtering) {
            expansionSnapshot = new Map(detailsElements(root).map(details => [details, details.open]));
        } else if (!active && filtering) {
            expansionSnapshot.forEach((open, details) => { details.open = open; });
            expansionSnapshot.clear();
        }
        filtering = active;

        root.querySelectorAll<HTMLElement>('[data-conformance-suite]').forEach(suite => {
            const suiteName = suite.dataset.conformanceSuite;
            const mode: Test262Mode | 'interpreted' = suiteName === 'test262'
                ? state.test262Mode
                : 'interpreted';
            const status = suiteName === 'test262' ? state.test262Status : state.typeScriptStatus;
            suite.dataset.viewMode = mode;
            let count = 0;
            let visible = false;
            for (const node of suiteRoots(suite)) {
                const result = filterNode(node, query, status, mode, false);
                count += result.count;
                visible ||= result.visible;
            }
            const empty = suite.querySelector<HTMLElement>('[data-conformance-empty]');
            const counter = suite.querySelector<HTMLElement>('[data-conformance-result-count]');
            if (empty)
                empty.hidden = visible;
            if (counter)
                counter.textContent = (counter.dataset.countTemplate || '{0}').replace('{0}', String(count));
        });
    };

    const commit = (): void => {
        apply();
        updateConformanceUrl(win, state);
    };

    const search = root.querySelector<HTMLInputElement>('[data-conformance-search]');
    search?.addEventListener('input', () => {
        state.query = search.value.trim();
        commit();
    });

    const test262 = root.querySelector<HTMLElement>('[data-conformance-suite="test262"]');
    const typeScript = root.querySelector<HTMLElement>('[data-conformance-suite="typescript"]');
    test262?.querySelector<HTMLSelectElement>('[data-conformance-mode]')?.addEventListener('change', event => {
        state.test262Mode = choice((event.currentTarget as HTMLSelectElement).value, modes, 'compare');
        commit();
    });
    test262?.querySelector<HTMLSelectElement>('[data-conformance-status]')?.addEventListener('change', event => {
        state.test262Status = choice((event.currentTarget as HTMLSelectElement).value, statuses, 'all');
        commit();
    });
    typeScript?.querySelector<HTMLSelectElement>('[data-conformance-status]')?.addEventListener('change', event => {
        state.typeScriptStatus = choice((event.currentTarget as HTMLSelectElement).value, statuses, 'all');
        commit();
    });

    root.querySelector<HTMLButtonElement>('[data-conformance-expand]')?.addEventListener('click', () => {
        detailsElements(root).filter(details => !details.hidden).forEach(details => { details.open = true; });
    });
    root.querySelector<HTMLButtonElement>('[data-conformance-collapse]')?.addEventListener('click', () => {
        detailsElements(root).filter(details => !details.hidden).forEach(details => { details.open = false; });
    });
    root.querySelector<HTMLButtonElement>('[data-conformance-reset]')?.addEventListener('click', () => {
        state = { query: '', test262Mode: 'compare', test262Status: 'all', typeScriptStatus: 'all' };
        commit();
    });
    win.addEventListener('popstate', () => {
        state = readConformanceState(win.location);
        apply();
    });

    apply();
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initializeConformanceExplorer(), { once: true });
else
    initializeConformanceExplorer();
