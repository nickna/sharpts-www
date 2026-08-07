const copiedClass = 'copied';

function closeNavigation(nav: HTMLElement, links: HTMLElement, toggle: HTMLButtonElement): void {
    nav.classList.remove('nav--menu-open');
    links.classList.remove('nav__links--open');
    toggle.classList.remove('nav__hamburger--open');
    toggle.setAttribute('aria-expanded', 'false');
}

export function initializeNavigation(doc: Document, win: Window): void {
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
        if (event.key !== 'Escape') return;
        closeNavigation(nav, links, toggle);
        doc.querySelectorAll<HTMLDetailsElement>('details.lang-selector[open]')
            .forEach(selector => {
                selector.removeAttribute('open');
            });
    });
    const logo = nav.querySelector<HTMLAnchorElement>('.nav__logo');
    logo?.addEventListener('click', event => {
        const destination = new URL(logo.href, win.location.href);
        if (destination.pathname !== win.location.pathname || destination.hash) return;
        event.preventDefault();
        win.scrollTo({ top: 0, behavior: 'smooth' });
        closeNavigation(nav, links, toggle);
    });
}

function findCopyText(button: HTMLButtonElement): string | null {
    const code = button.closest('.code-block')?.querySelector('code');
    if (code) return code.textContent || '';
    return button.closest('.hero__install')?.querySelector('.hero__install-cmd')?.textContent || null;
}

async function writeClipboard(doc: Document, win: Window, value: string): Promise<void> {
    if (win.navigator.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(value);
        return;
    }
    const textarea = doc.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    doc.body.appendChild(textarea);
    textarea.select();
    try {
        if (!doc.execCommand('copy')) throw new Error('Clipboard copy was rejected.');
    } finally {
        textarea.remove();
    }
}

export function initializeCopyButtons(doc: Document, win: Window): void {
    doc.querySelectorAll<HTMLButtonElement>('[data-copy-button]').forEach(button => {
        let resetTimer: number | undefined;
        button.addEventListener('click', async () => {
            const value = findCopyText(button);
            if (value === null) return;
            try { await writeClipboard(doc, win, value); } catch { return; }
            const label = button.querySelector<HTMLElement>('span');
            const original = button.dataset.copyLabel || label?.textContent || '';
            if (label) label.textContent = button.dataset.copiedLabel || original;
            button.classList.add(copiedClass);
            if (resetTimer !== undefined) win.clearTimeout(resetTimer);
            resetTimer = win.setTimeout(() => {
                button.classList.remove(copiedClass);
                if (label) label.textContent = original;
            }, 2000);
        });
    });
}
