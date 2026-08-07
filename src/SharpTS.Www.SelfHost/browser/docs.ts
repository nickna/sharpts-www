import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { initializeCopyButtons, initializeNavigation } from './navigation-copy';

export function initializeDocs(doc: Document = document, win: Window = window): void {
    initializeNavigation(doc, win);
    initializeCopyButtons(doc, win);
    Prism.highlightAllUnder(doc.body);
}
