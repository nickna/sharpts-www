import { escapeHtml } from './site-html';

export interface CopyButtonLabels {
    copy: string;
    copied: string;
    ariaLabel?: string;
}

const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

export function renderCopyButton(labels: CopyButtonLabels): string {
    const copy = escapeHtml(labels.copy);
    const copied = escapeHtml(labels.copied);
    const aria = labels.ariaLabel ? ` aria-label="${escapeHtml(labels.ariaLabel)}"` : '';
    return `<button type="button" class="copy-btn" data-copy-button data-copy-label="${copy}" data-copied-label="${copied}"${aria}>${copyIcon}<span>${copy}</span></button>`;
}
