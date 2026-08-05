import { initializeInteractions } from './interactions';
import {
    initializePlayground,
    type PlaygroundDependencies
} from './playground';

export function initializeSite(
    doc: Document = document,
    win: Window = window,
    playgroundDependencies: PlaygroundDependencies = {}
): void {
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
        doc.documentElement.classList.remove('preload');
    }));

    // The playground is the page's primary interactive feature. Wire it before
    // optional visual enhancements so a canvas, Prism, or navigation failure
    // cannot leave its controls inert.
    const playground = doc.querySelector<HTMLElement>('[data-playground]');
    if (playground)
        void initializePlayground(playground, playgroundDependencies);

    initializeInteractions(doc, win);
}
