import { escapeHtml, normalizeNewlines } from './site-html';

export interface DocumentationHeading {
    level: 2 | 3;
    id: string;
    text: string;
}

export interface DocumentationExample {
    key: string;
    articleSlug: string;
    source: string;
    expectedOutput: string;
    modes: ('interpret' | 'compile')[];
}

export interface RenderedMarkdown {
    html: string;
    headings: DocumentationHeading[];
    links: string[];
    examples: DocumentationExample[];
}

export interface MarkdownOptions {
    articleSlug: string;
    renderFigure(name: string): string;
}

function headingId(value: string): string {
    const id = value.toLowerCase()
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    if (!id) throw new Error('Heading does not produce a stable ID: ' + value);
    return id;
}

function renderInline(value: string, links: string[]): string {
    const output: string[] = [];
    let index = 0;
    while (index < value.length) {
        if (value[index] === '`') {
            const end = value.indexOf('`', index + 1);
            if (end < 0) throw new Error('Malformed inline code: ' + value);
            output.push('<code>' + escapeHtml(value.slice(index + 1, end)) + '</code>');
            index = end + 1;
            continue;
        }
        if (value[index] === '[') {
            const labelEnd = value.indexOf('](', index + 1);
            const hrefEnd = labelEnd < 0 ? -1 : value.indexOf(')', labelEnd + 2);
            if (labelEnd < 0 || hrefEnd < 0) throw new Error('Malformed documentation link: ' + value);
            const label = value.slice(index + 1, labelEnd);
            const href = value.slice(labelEnd + 2, hrefEnd);
            if (!label || !href || /\s/.test(href)) throw new Error('Malformed documentation link: ' + value);
            if (!href.startsWith('/') && !href.startsWith('#') && !href.startsWith('https://'))
                throw new Error('Unsafe or unsupported documentation link: ' + href);
            links.push(href);
            const external = href.startsWith('https://') ? ' target="_blank" rel="noopener"' : '';
            output.push('<a href="' + escapeHtml(href) + '"' + external + '>' + escapeHtml(label) + '</a>');
            index = hrefEnd + 1;
            continue;
        }
        if (value.slice(index, index + 2) === '**') {
            const end = value.indexOf('**', index + 2);
            if (end < 0) throw new Error('Malformed strong emphasis: ' + value);
            output.push('<strong>' + escapeHtml(value.slice(index + 2, end)) + '</strong>');
            index = end + 2;
            continue;
        }
        if (value[index] === '*') {
            const end = value.indexOf('*', index + 1);
            if (end < 0) throw new Error('Malformed emphasis: ' + value);
            output.push('<em>' + escapeHtml(value.slice(index + 1, end)) + '</em>');
            index = end + 1;
            continue;
        }
        output.push(escapeHtml(value[index]));
        index++;
    }
    return output.join('');
}

function parseFenceInfo(info: string): { language: string; example?: string; output?: string } {
    const parts = info.trim().split(/\s+/).filter(Boolean);
    const language = parts.shift() || 'text';
    const result: { language: string; example?: string; output?: string } = { language };
    for (const part of parts) {
        const match = /^(example|output)=([a-z0-9-]+)$/.exec(part);
        if (!match) throw new Error('Unsupported fenced-code option: ' + part);
        if (match[1] === 'example') result.example = match[2];
        else result.output = match[2];
    }
    if (result.example && result.output)
        throw new Error('A code fence cannot be both an example and expected output');
    return result;
}

function codeBlock(language: string, code: string, output: boolean): string {
    const safeLanguage = /^[a-z0-9-]+$/.test(language) ? language : 'text';
    const button = output ? '' : '<button type="button" class="copy-btn" data-copy-button data-copy-label="Copy" data-copied-label="Copied" aria-label="Copy code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span></button>';
    const label = output ? 'Expected output' : safeLanguage;
    return '<div class="code-block docs-code"><div class="code-block__header"><span>' +
        escapeHtml(label) + '</span>' + button + '</div><div class="code-block__content"><pre><code class="language-' +
        safeLanguage + '">' + escapeHtml(code) + '</code></pre></div></div>';
}

export function renderDocumentationMarkdown(markdown: string, options: MarkdownOptions): RenderedMarkdown {
    const lines = normalizeNewlines(markdown).split('\n');
    const html: string[] = [];
    const headings: DocumentationHeading[] = [];
    const links: string[] = [];
    const headingIds: { [id: string]: boolean } = {};
    const exampleSources: { [key: string]: string } = {};
    const exampleOutputs: { [key: string]: string } = {};
    let paragraph: string[] = [];
    let list: 'ol' | 'ul' | null = null;

    const flushParagraph = (): void => {
        if (paragraph.length) html.push('<p>' + renderInline(paragraph.join(' '), links) + '</p>');
        paragraph = [];
    };
    const closeList = (): void => {
        if (list) html.push('</' + list + '>');
        list = null;
    };

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line.startsWith('```')) {
            flushParagraph();
            closeList();
            const info = parseFenceInfo(line.slice(3));
            const body: string[] = [];
            index++;
            while (index < lines.length && lines[index] !== '```') {
                body.push(lines[index]);
                index++;
            }
            if (index >= lines.length) throw new Error('Unclosed fenced code block in ' + options.articleSlug);
            const value = body.join('\n');
            if (info.example) {
                if (exampleSources[info.example]) throw new Error('Duplicate documentation example: ' + info.example);
                exampleSources[info.example] = value;
            }
            if (info.output) {
                if (exampleOutputs[info.output]) throw new Error('Duplicate example output: ' + info.output);
                exampleOutputs[info.output] = value;
            }
            html.push(codeBlock(info.language, value, Boolean(info.output)));
            continue;
        }
        const figure = /^:::figure ([a-z0-9-]+)$/.exec(line);
        if (figure) {
            flushParagraph();
            closeList();
            html.push(options.renderFigure(figure[1]));
            continue;
        }
        const heading = /^(##|###) (.+)$/.exec(line);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length as 2 | 3;
            const id = headingId(heading[2]);
            if (headingIds[id]) throw new Error('Duplicate heading ID "' + id + '" in ' + options.articleSlug);
            headingIds[id] = true;
            headings.push({ level, id, text: heading[2].replace(/`/g, '') });
            html.push('<h' + level + ' id="' + id + '">' + renderInline(heading[2], links) + '</h' + level + '>');
            continue;
        }
        const ordered = /^(\d+)\. (.+)$/.exec(line);
        const unordered = /^- (.+)$/.exec(line);
        if (ordered || unordered) {
            flushParagraph();
            const kind = ordered ? 'ol' : 'ul';
            if (list !== kind) {
                closeList();
                list = kind;
                html.push(kind === 'ol' && ordered && ordered[1] !== '1'
                    ? '<ol start="' + ordered[1] + '">' : '<' + kind + '>');
            }
            html.push('<li>' + renderInline(ordered ? ordered[2] : unordered![1], links) + '</li>');
            continue;
        }
        const quote = /^> (.+)$/.exec(line);
        if (quote) {
            flushParagraph();
            closeList();
            html.push('<blockquote><p>' + renderInline(quote[1], links) + '</p></blockquote>');
            continue;
        }
        if (!line.trim()) {
            flushParagraph();
            closeList();
            continue;
        }
        if (/^#{1,6}\s/.test(line)) throw new Error('Only level-two and level-three headings are supported');
        if (/^:::/u.test(line)) throw new Error('Malformed documentation directive: ' + line);
        if (/^(!\[|~~~|\[[^\]]+\]:|\|.*\||\s{4}\S|[-*_]{3,}\s*$)/.test(line) || /^- \[[ xX]\]/.test(line))
            throw new Error('Unsupported documentation Markdown in ' + options.articleSlug + ': ' + line);
        paragraph.push(line.trim());
    }
    flushParagraph();
    closeList();

    const examples: DocumentationExample[] = [];
    for (const key of Object.keys(exampleSources)) {
        if (exampleOutputs[key] === undefined)
            throw new Error('Documentation example has no expected output: ' + key);
        examples.push({
            key,
            articleSlug: options.articleSlug,
            source: exampleSources[key],
            expectedOutput: exampleOutputs[key],
            modes: ['interpret', 'compile']
        });
    }
    for (const key of Object.keys(exampleOutputs)) {
        if (exampleSources[key] === undefined)
            throw new Error('Expected output has no documentation example: ' + key);
    }
    return { html: html.join('\n'), headings, links, examples };
}
