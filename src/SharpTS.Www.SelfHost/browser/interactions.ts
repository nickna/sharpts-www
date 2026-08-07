import Prism from 'prismjs';
import { initializeCopyButtons, initializeNavigation } from './navigation-copy';

// Prism otherwise registers its own DOMContentLoaded pass while this bundle
// also performs an explicit pass, which can do expensive highlighting twice.
Prism.manual = true;

function initializeLanguageSelectors(doc: Document): void {
    doc.addEventListener('click', event => {
        const keep = (event.target as Element | null)?.closest('details.lang-selector');
        doc.querySelectorAll<HTMLDetailsElement>('details.lang-selector[open]').forEach(selector => {
            if (selector !== keep)
                selector.removeAttribute('open');
        });
    });
}

function initializeExamples(doc: Document): void {
    doc.querySelectorAll<HTMLElement>('[data-examples]').forEach(examples => {
        const tabs = Array.from(examples.querySelectorAll<HTMLButtonElement>('[data-example-tab]'));
        const panels = Array.from(examples.querySelectorAll<HTMLElement>('[data-example-panel]'));
        tabs.forEach((tab, index) => {
            tab.addEventListener('keydown', event => {
                let nextIndex = index;
                if (event.key === 'ArrowRight')
                    nextIndex = (index + 1) % tabs.length;
                else if (event.key === 'ArrowLeft')
                    nextIndex = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === 'Home')
                    nextIndex = 0;
                else if (event.key === 'End')
                    nextIndex = tabs.length - 1;
                else
                    return;
                event.preventDefault();
                tabs[nextIndex].focus();
                tabs[nextIndex].click();
            });
            tab.addEventListener('click', () => {
                const selected = tab.dataset.exampleTab;
                tabs.forEach(candidate => {
                    const active = candidate === tab;
                    candidate.classList.toggle('active', active);
                    candidate.setAttribute('aria-selected', String(active));
                    candidate.tabIndex = active ? 0 : -1;
                });
                panels.forEach(panel => {
                    const active = panel.dataset.examplePanel === selected;
                    panel.hidden = !active;
                    if (active)
                        Prism.highlightAllUnder(panel);
                });
            });
        });
    });
}

function initializeArchitecture(doc: Document): void {
    doc.querySelectorAll<HTMLElement>('[data-architecture]').forEach(diagram => {
        const buttons = Array.from(diagram.querySelectorAll<HTMLButtonElement>('[data-architecture-stage]'));
        const details = Array.from(diagram.querySelectorAll<HTMLElement>('[data-architecture-detail]'));
        const hint = diagram.querySelector<HTMLElement>('[data-architecture-hint]');
        let selected: string | null = null;

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const stage = button.dataset.architectureStage || null;
                selected = selected === stage ? null : stage;
                buttons.forEach(candidate => {
                    const active = candidate.dataset.architectureStage === selected;
                    candidate.classList.toggle('pipeline__box--selected', active);
                    candidate.setAttribute('aria-pressed', String(active));
                });
                details.forEach(detail => {
                    detail.hidden = detail.dataset.architectureDetail !== selected;
                });
                if (hint)
                    hint.hidden = selected !== null;
            });
        });
    });
}

function initializeHeroParticles(doc: Document, win: Window): void {
    const canvas = doc.querySelector<HTMLCanvasElement>('#hero-particles');
    if (!canvas)
        return;
    if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.hidden = true;
        return;
    }

    const context = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!context || !parent)
        return;

    interface Particle {
        x: number;
        y: number;
        size: number;
        speedX: number;
        speedY: number;
        opacity: number;
        hue: number;
    }

    let particles: Particle[] = [];
    let running = true;
    let animationId = 0;

    const resetParticle = (): Particle => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.1,
        hue: Math.random() > 0.5 ? 215 : 280
    });

    const resize = (): void => {
        const rect = parent.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width));
        canvas.height = Math.max(1, Math.floor(rect.height));
        const count = Math.min(60, Math.floor(canvas.width * canvas.height / 15000));
        particles = Array.from({ length: count }, resetParticle);
    };

    const draw = (): void => {
        if (!running)
            return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((particle, index) => {
            particle.x += particle.speedX;
            particle.y += particle.speedY;
            if (particle.x < 0 || particle.x > canvas.width ||
                particle.y < 0 || particle.y > canvas.height)
                particles[index] = particle = resetParticle();
            context.beginPath();
            context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            context.fillStyle = `hsla(${particle.hue}, 60%, 60%, ${particle.opacity})`;
            context.fill();
        });
        animationId = win.requestAnimationFrame(draw);
    };

    const start = (): void => {
        if (running && animationId !== 0)
            return;
        running = true;
        animationId = win.requestAnimationFrame(draw);
    };
    const stop = (): void => {
        running = false;
        if (animationId !== 0)
            win.cancelAnimationFrame(animationId);
        animationId = 0;
    };

    resize();
    draw();

    const Observer = (win as unknown as {
        IntersectionObserver?: typeof IntersectionObserver;
    }).IntersectionObserver;
    if (typeof Observer === 'function') {
        const observer = new Observer(entries => {
            if (entries.some(entry => entry.isIntersecting))
                start();
            else
                stop();
        });
        observer.observe(canvas);
    }

    doc.addEventListener('visibilitychange', () => doc.hidden ? stop() : start());
    let resizeTimer = 0;
    win.addEventListener('resize', () => {
        win.clearTimeout(resizeTimer);
        resizeTimer = win.setTimeout(resize, 200);
    });
}

export function initializeInteractions(doc: Document = document, win: Window = window): void {
    const initialize = (name: string, action: () => void): void => {
        try {
            action();
        } catch (error) {
            // Every enhancement is independent. A missing browser API or a
            // malformed optional element must not disable unrelated controls.
            console.warn(`SharpTS site enhancement '${name}' was skipped.`, error);
        }
    };

    initialize('navigation', () => initializeNavigation(doc, win));
    initialize('language selectors', () => initializeLanguageSelectors(doc));
    initialize('copy buttons', () => initializeCopyButtons(doc, win));
    initialize('examples', () => initializeExamples(doc));
    initialize('architecture', () => initializeArchitecture(doc));
    initialize('hero particles', () => initializeHeroParticles(doc, win));

    const highlight = (): void => initialize(
        'syntax highlighting',
        () => Prism.highlightAllUnder(doc.body));
    const idle = (win as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof idle === 'function')
        idle.call(win, highlight, { timeout: 500 });
    else
        win.setTimeout(highlight, 0);
}
