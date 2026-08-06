const copiedClass = 'copied';

function closeNavigation(nav: HTMLElement, links: HTMLElement, toggle: HTMLButtonElement): void {
    nav.classList.remove('nav--menu-open');
    links.classList.remove('nav__links--open');
    toggle.classList.remove('nav__hamburger--open');
    toggle.setAttribute('aria-expanded', 'false');
}

function initializeNavigation(doc: Document, win: Window): void {
    const nav = doc.querySelector<HTMLElement>('[data-nav]');
    const links = doc.querySelector<HTMLElement>('[data-nav-links]');
    const toggle = doc.querySelector<HTMLButtonElement>('[data-nav-toggle]');
    if (!nav || !links || !toggle) return;

    const updateScrollState = (): void => {
        nav.classList.toggle('nav--scrolled', win.scrollY > 20);
    };
    win.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        nav.classList.toggle('nav--menu-open', open);
        links.classList.toggle('nav__links--open', open);
        toggle.classList.toggle('nav__hamburger--open', open);
        toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', event => {
        if ((event.target as Element | null)?.closest('a')) closeNavigation(nav, links, toggle);
    });
    doc.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeNavigation(nav, links, toggle);
    });
}

async function copyCode(button: HTMLButtonElement, win: Window): Promise<void> {
    const code = button.closest('.code-block')?.querySelector('code');
    if (!code) return;
    try {
        await win.navigator.clipboard.writeText(code.textContent || '');
    } catch {
        return;
    }
    const label = button.querySelector<HTMLElement>('span');
    const original = button.dataset.copyLabel || 'Copy';
    if (label) label.textContent = button.dataset.copiedLabel || 'Copied';
    button.classList.add(copiedClass);
    win.setTimeout(() => {
        button.classList.remove(copiedClass);
        if (label) label.textContent = original;
    }, 2000);
}

export function initializeDocs(doc: Document = document, win: Window = window): void {
    initializeNavigation(doc, win);
    doc.querySelectorAll<HTMLButtonElement>('[data-copy-button]').forEach(button => {
        button.addEventListener('click', () => { void copyCode(button, win); });
    });
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initializeDocs(), { once: true });
else
    initializeDocs();
