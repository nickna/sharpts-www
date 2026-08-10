import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import { initializeCopyButtons, initializeNavigation } from './navigation-copy';

export interface ApiSearchSymbol {
    id: string;
    name: string;
    aliases: string[];
    category: string;
    summary: string;
    kind: string;
    route: string;
}

function matchScore(symbol: ApiSearchSymbol, query: string): number | null {
    const name = symbol.name.toLocaleLowerCase();
    if (name === query) return 0;
    if (name.startsWith(query)) return 10;
    if (name.includes(query)) return 20;
    for (const aliasValue of symbol.aliases) {
        const alias = aliasValue.toLocaleLowerCase();
        if (alias === query) return 30;
        if (alias.startsWith(query)) return 40;
        if (alias.includes(query)) return 50;
    }
    if (symbol.category.toLocaleLowerCase().includes(query)) return 60;
    if (symbol.summary.toLocaleLowerCase().includes(query)) return 70;
    return null;
}

export function rankApiSearchResults(symbols: ApiSearchSymbol[], value: string): ApiSearchSymbol[] {
    const query = value.trim().toLocaleLowerCase();
    if (!query) return [];
    const matches: { symbol: ApiSearchSymbol; score: number }[] = [];
    for (const symbol of symbols) {
        const score = matchScore(symbol, query);
        if (score !== null) matches.push({ symbol, score });
    }
    matches.sort((left, right) => left.score - right.score || left.symbol.name.localeCompare(right.symbol.name));
    return matches.slice(0, 10).map(match => match.symbol);
}

export function initializeApiSearch(doc: Document = document, win: Window = window): void {
    const root = doc.querySelector<HTMLElement>('[data-api-search]');
    const input = root?.querySelector<HTMLInputElement>('[data-api-search-input]');
    const list = root?.querySelector<HTMLUListElement>('[data-api-search-results]');
    const status = root?.querySelector<HTMLElement>('[data-api-search-status]');
    const source = root?.dataset.searchUrl;
    if (!root || !input || !list || !status || !source) return;

    let symbols: ApiSearchSymbol[] | null = null;
    let loading: Promise<ApiSearchSymbol[]> | null = null;
    let results: ApiSearchSymbol[] = [];
    let active = -1;

    const load = (): Promise<ApiSearchSymbol[]> => {
        if (symbols) return Promise.resolve(symbols);
        if (loading) return loading;
        status.textContent = 'Loading API index…';
        loading = win.fetch(source).then(response => {
            if (!response.ok) throw new Error('API search index request failed.');
            return response.json();
        }).then((payload: { symbols?: ApiSearchSymbol[] }) => {
            if (!Array.isArray(payload.symbols)) throw new Error('API search index is malformed.');
            symbols = payload.symbols;
            status.textContent = '';
            return symbols;
        }).catch(() => {
            status.textContent = 'API search is temporarily unavailable.';
            return [];
        });
        return loading;
    };

    const setActive = (index: number): void => {
        active = index;
        const options = list.querySelectorAll<HTMLElement>('[role="option"]');
        options.forEach((option, optionIndex) => {
            option.setAttribute('aria-selected', String(optionIndex === active));
        });
        if (active >= 0 && active < options.length) {
            input.setAttribute('aria-activedescendant', options[active].id);
            if (typeof options[active].scrollIntoView === 'function')
                options[active].scrollIntoView({ block: 'nearest' });
        } else input.removeAttribute('aria-activedescendant');
    };

    const close = (): void => {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        setActive(-1);
    };

    const render = (): void => {
        list.replaceChildren();
        results = rankApiSearchResults(symbols || [], input.value);
        active = -1;
        if (!input.value.trim()) {
            status.textContent = '';
            close();
            return;
        }
        if (!results.length) {
            const empty = doc.createElement('li');
            empty.className = 'api-search__empty';
            empty.setAttribute('role', 'option');
            empty.setAttribute('aria-disabled', 'true');
            empty.textContent = 'No API symbols match your search.';
            list.appendChild(empty);
            status.textContent = 'No API symbols found.';
        } else {
            results.forEach((symbol, index) => {
                const item = doc.createElement('li');
                item.id = `api-search-option-${index}`;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', 'false');
                const link = doc.createElement('a');
                link.href = symbol.route;
                const name = doc.createElement('code');
                name.textContent = symbol.name;
                const metadata = doc.createElement('span');
                metadata.textContent = `${symbol.kind} · ${symbol.category}`;
                link.append(name, metadata);
                item.appendChild(link);
                list.appendChild(item);
            });
            status.textContent = `${results.length} API result${results.length === 1 ? '' : 's'}.`;
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('focus', () => { void load(); });
    input.addEventListener('input', () => { void load().then(render); });
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (!results.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter')) return;
        if (event.key === 'Enter') {
            if (active >= 0) {
                event.preventDefault();
                win.location.assign(results[active].route);
            }
            return;
        }
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = active < 0 ? (delta > 0 ? 0 : results.length - 1) :
            (active + delta + results.length) % results.length;
        setActive(next);
    });
    doc.addEventListener('click', event => {
        if (!root.contains(event.target as Node)) close();
    });
}

export function initializeDocs(doc: Document = document, win: Window = window): void {
    initializeNavigation(doc, win);
    initializeCopyButtons(doc, win);
    initializeApiSearch(doc, win);
    Prism.highlightAllUnder(doc.body);
}
