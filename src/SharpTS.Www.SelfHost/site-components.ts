import { escapeHtml } from './site-html';

export interface CopyButtonLabels {
    copy: string;
    copied: string;
    ariaLabel?: string;
}

export interface DocumentationFeedbackOptions {
    kind: 'editorial' | 'api';
    title: string;
    pageUrl: string;
    sourceUrl: string;
    version: string;
    editUrl?: string;
}

const websiteRepository = 'https://github.com/nickna/sharpts-www';

export function editorialDocumentationSourceUrl(slug: string): string {
    return `${websiteRepository}/blob/main/src/SharpTS.Www.SelfHost/docs/${slug}.md`;
}

export function editorialDocumentationEditUrl(slug: string): string {
    return `${websiteRepository}/edit/main/src/SharpTS.Www.SelfHost/docs/${slug}.md`;
}

export function documentationIssueUrl(title: string, pageUrl: string, sourceUrl: string, version: string): string {
    const fields = [
        ['template', 'documentation.yml'],
        ['title', `[Docs]: ${title}`],
        ['page', pageUrl],
        ['source', sourceUrl],
        ['version', version]
    ];
    return `${websiteRepository}/issues/new?${fields.map(field =>
        `${encodeURIComponent(field[0])}=${encodeURIComponent(field[1])}`).join('&')}`;
}

export function renderDocumentationFeedback(options: DocumentationFeedbackOptions): string {
    const primaryLabel = options.kind === 'editorial' ? 'Edit this page' : 'View source';
    const issueLabel = options.kind === 'editorial' ? 'Report a docs issue' : 'Report an API docs issue';
    const primaryUrl = options.kind === 'editorial' ? options.editUrl! : options.sourceUrl;
    const issueUrl = documentationIssueUrl(options.title, options.pageUrl, options.sourceUrl, options.version);
    return `<aside class="docs-feedback" data-docs-feedback aria-label="Documentation feedback"><p>Help improve this documentation.</p><div class="docs-feedback__actions"><a class="docs-feedback__action docs-feedback__action--primary" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener">${primaryLabel}</a><a class="docs-feedback__action" href="${escapeHtml(issueUrl)}" target="_blank" rel="noopener">${issueLabel}</a></div></aside>`;
}

const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

export function renderCopyButton(labels: CopyButtonLabels): string {
    const copy = escapeHtml(labels.copy);
    const copied = escapeHtml(labels.copied);
    const aria = labels.ariaLabel ? ` aria-label="${escapeHtml(labels.ariaLabel)}"` : '';
    return `<button type="button" class="copy-btn" data-copy-button data-copy-label="${copy}" data-copied-label="${copied}"${aria}>${copyIcon}<span>${copy}</span></button>`;
}
