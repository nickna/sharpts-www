import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRichText } from '../../src/SharpTS.Www.SelfHost/site-html';
import { parseResxContent } from '../../src/SharpTS.Www.SelfHost/site-localization';
import { cultures } from '../../src/SharpTS.Www.SelfHost/site-model';
import { routePath } from '../../src/SharpTS.Www.SelfHost/site-paths';
import { docsOutputPath, docsRoutePath } from '../../src/SharpTS.Www.SelfHost/site-paths';
import { eligibleResults, parseBaselineText, passPercentage } from '../../src/SharpTS.Www.SelfHost/conformance-data';
import {
    documentationManifest,
    publishedDocumentation,
    validateDocumentationManifest
} from '../../src/SharpTS.Www.SelfHost/docs-manifest';
import { renderDocumentationMarkdown } from '../../src/SharpTS.Www.SelfHost/docs-markdown';
import { loadDocumentation } from '../../src/SharpTS.Www.SelfHost/documentation';
import path from 'node:path';

describe('static site primitives', () => {
    it('escapes text by default', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('allows only attribute-free code tags in localized rich text', () => {
        expect(renderRichText('Use <code>dotnet build</code>.')).toBe('Use <code>dotnet build</code>.');
        expect(renderRichText('<code class="bad">unsafe</code><script>alert(1)</script>')).toBe(
            '&lt;code class=&quot;bad&quot;&gt;unsafe</code>&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('parses and decodes resx values while rejecting duplicate keys', () => {
        const resources = parseResxContent(
            '<root><data name="Greeting"><value>Hello &amp; &lt;code&gt;SharpTS&lt;/code&gt;</value></data></root>',
            'inline test'
        );
        expect(resources.Greeting).toBe('Hello & <code>SharpTS</code>');

        expect(() =>
            parseResxContent(
                '<root><data name="A"><value>one</value></data><data name="A"><value>two</value></data></root>',
                'duplicates'
            )
        ).toThrow(/duplicate resource key/);
    });

    it('emits stable localized routes', () => {
        expect(routePath(cultures[0], 'home')).toBe('/');
        expect(routePath(cultures[0], 'guide')).toBe('/how-it-works');
        expect(routePath(cultures[0], 'conformance')).toBe('/conformance');
        expect(routePath(cultures[2], 'home')).toBe('/fr');
        expect(routePath(cultures[2], 'guide')).toBe('/fr/how-it-works');
        expect(routePath(cultures[2], 'conformance')).toBe('/fr/conformance');
        expect(docsRoutePath('index')).toBe('/docs');
        expect(docsRoutePath('getting-started/installation')).toBe('/docs/getting-started/installation');
        expect(docsOutputPath('out', 'getting-started/installation')).toBe(
            path.join('out', 'docs', 'getting-started', 'installation', 'index.html')
        );
    });

    it('renders and escapes the supported documentation Markdown subset', () => {
        const rendered = renderDocumentationMarkdown(
            '## Hello, `SharpTS`!\n\nUse **safe** *Markdown* with [docs](/docs).\n\n<script>alert(1)</script>',
            { articleSlug: 'fixture', renderFigure: (name) => `<figure>${name}</figure>` }
        );
        expect(rendered.headings).toEqual([{ level: 2, id: 'hello-sharpts', text: 'Hello, SharpTS!' }]);
        expect(rendered.links).toEqual(['/docs']);
        expect(rendered.html).toContain('<strong>safe</strong> <em>Markdown</em>');
        expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('rejects malformed Markdown and duplicate heading IDs', () => {
        const render = (source: string) =>
            renderDocumentationMarkdown(source, {
                articleSlug: 'fixture',
                renderFigure: () => ''
            });
        expect(() => render('## Same\n\n### Same')).toThrow(/Duplicate heading ID/);
        expect(() => render('```typescript\nconst open = true;')).toThrow(/Unclosed fenced code block/);
        expect(() => render(':::figure')).toThrow(/Malformed documentation directive/);
        expect(() => render('[unsafe](javascript:alert(1))')).toThrow(/Unsafe or unsupported/);
        expect(() => render('| unsupported | table |')).toThrow(/Unsupported documentation Markdown/);
        expect(() => render('[broken](two words)')).toThrow(/Malformed documentation link/);
    });

    it('validates metadata ordering and excludes unpublished documentation', () => {
        expect(publishedDocumentation()).toHaveLength(3);
        expect(publishedDocumentation().map((article) => article.order)).toEqual([0, 1, 2]);
        expect(publishedDocumentation().some((article) => article.slug.endsWith('/scripting'))).toBe(false);
        expect(() =>
            validateDocumentationManifest([documentationManifest[0], { ...documentationManifest[1], slug: 'index' }])
        ).toThrow(/Duplicate documentation slug/);
        expect(() =>
            validateDocumentationManifest([documentationManifest[0], { ...documentationManifest[1], order: 0 }])
        ).toThrow(/Duplicate documentation order/);
    });

    it('loads every source for validation but emits examples only from published articles', () => {
        const repoRoot = path.resolve('.');
        const docs = loadDocumentation(repoRoot, path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost', 'docs'));
        expect(docs.all).toHaveLength(5);
        expect(docs.published).toHaveLength(3);
        expect(docs.examples).toEqual([
            expect.objectContaining({ key: 'quick-start', modes: ['interpret', 'compile'] })
        ]);
        expect(docs.all.find((article) => article.metadata.slug.endsWith('/scripting'))?.rendered.html).toContain(
            '#!/usr/bin/env sharpts'
        );
    });

    it('parses the versioned baseline contract and preserves skip semantics', () => {
        const parsed = parseBaselineText(
            '# SharpTS baseline-format=1 suite=Test262 corpus=0123456789abcdef0123456789abcdef01234567 — fixture\n' +
                'test/built-ins/Array/a.js Pass\n' +
                'test/built-ins/Array/b.js Fail\n' +
                'test/built-ins/Array/c.js Skipped:fixture\n',
            'Test262',
            'fixture'
        );
        expect(parsed.entries).toHaveLength(3);
        const counts = {
            Pass: 1,
            Fail: 1,
            RuntimeError: 0,
            ParseError: 0,
            TypeCheckError: 0,
            Timeout: 0,
            HarnessError: 0,
            Skipped: 1
        };
        expect(eligibleResults(counts)).toBe(2);
        expect(passPercentage(counts)).toBe(50);
    });

    it('rejects unknown baseline versions, buckets, and extra comments', () => {
        const header =
            '# SharpTS baseline-format=1 suite=Test262 corpus=0123456789abcdef0123456789abcdef01234567 — fixture\n';
        expect(() =>
            parseBaselineText(header.replace('format=1', 'format=2') + 'a.js Pass\n', 'Test262', 'fixture')
        ).toThrow(/unsupported baseline format/);
        expect(() => parseBaselineText(header + 'a.js Surprise\n', 'Test262', 'fixture')).toThrow(/unknown bucket/);
        expect(() => parseBaselineText(header + '# second comment\na.js Pass\n', 'Test262', 'fixture')).toThrow(
            /unexpected comment/
        );
    });
});
