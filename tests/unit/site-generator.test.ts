import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRichText } from '../../src/SharpTS.Www.SelfHost/site-html';
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
import { loadConformanceData } from '../../src/SharpTS.Www.SelfHost/conformance-data';
import { loadLocale } from '../../src/SharpTS.Www.SelfHost/i18n';
import { loadSitePaths } from '../../src/SharpTS.Www.SelfHost/site-config';
import {
    renderApiReferenceDocument,
    renderDocument,
    renderDocumentationDocument
} from '../../src/SharpTS.Www.SelfHost/site-renderers';
import {
    apiReferencePages,
    createApiSearchIndex,
    loadApiReferenceCatalog
} from '../../src/SharpTS.Www.SelfHost/api-reference';
import type { BrowserAssets } from '../../src/SharpTS.Www.SelfHost/site-model';
import path from 'node:path';

describe('static site primitives', () => {
    it('renders every page kind, an alternate locale, and documentation with stable metadata and assets', () => {
        const paths = loadSitePaths();
        const conformance = loadConformanceData(paths.repoRoot);
        const assets: BrowserAssets = {
            script: 'site.js',
            style: 'browser.css',
            conformanceScript: 'conformance.js',
            docsScript: 'docs.js',
            siteStyle: 'site.css',
            files: []
        };
        const english = loadLocale(paths.localeRoot, cultures[0]);
        const french = loadLocale(paths.localeRoot, cultures[2]);
        for (const page of ['home', 'guide', 'conformance'] as const) {
            const html = renderDocument(english, page, assets, conformance);
            expect(html).toContain(`<link rel="canonical" href="https://sharpts.dev${routePath(cultures[0], page)}">`);
            expect(html).toContain('hreflang="fr"');
            expect(html).toContain('/assets/browser/browser.css');
            expect(html).toContain(
                page === 'conformance' ? '/assets/browser/conformance.js' : '/assets/browser/site.js'
            );
        }
        const homeHtml = renderDocument(english, 'home', assets, conformance);
        expect(homeHtml).toContain('<div id="support">');
        expect(homeHtml.match(/<article class="card support-card">/g)).toHaveLength(4);
        expect(homeHtml).toContain('href="/conformance"');
        expect(homeHtml).toContain('href="https://github.com/nickna/SharpTS/blob/main/STATUS-NODE.md"');
        expect(homeHtml).not.toContain('comparison__table');
        expect(homeHtml).not.toContain('badge-green');
        expect(renderDocument(french, 'home', assets, conformance)).toContain('href="/fr/conformance"');
        expect(renderDocument(french, 'guide', assets, conformance)).toContain('<html lang="fr">');

        const documentation = loadDocumentation(paths.repoRoot, paths.docsRoot);
        const article = documentation.published[1];
        const docsHtml = renderDocumentationDocument(english, article, documentation, assets);
        expect(docsHtml).toContain(`href="${docsRoutePath(documentation.published[0].metadata.slug)}"`);
        expect(docsHtml).toContain('/assets/browser/docs.js');
        expect(docsHtml).not.toContain('rel="alternate" hreflang=');

        const apiCatalog = loadApiReferenceCatalog(paths.apiCatalog);
        const apiPages = apiReferencePages(apiCatalog);
        const buttonPage = apiPages.find((page) => page.kind === 'symbol' && page.symbol.name === 'Button')!;
        const apiHtml = renderApiReferenceDocument(english, buttonPage, apiCatalog, documentation, assets);
        expect(apiCatalog.symbols).toHaveLength(174);
        expect(apiPages).toHaveLength(184);
        expect(apiHtml).toContain('<link rel="canonical" href="https://sharpts.dev/docs/api/gui/button">');
        expect(apiHtml).toContain('data-api-search');
        expect(apiHtml).toContain('id="control-metadata"');
        expect(apiHtml).toContain('Default:');
        expect(apiHtml).toContain(apiCatalog.package.revision);
        expect(createApiSearchIndex(apiCatalog).symbols).toHaveLength(174);
    });

    it('renders synchronized setup-script selectors and installation guidance', () => {
        const paths = loadSitePaths();
        const assets: BrowserAssets = {
            script: 'site.js',
            style: 'browser.css',
            conformanceScript: 'conformance.js',
            docsScript: 'docs.js',
            siteStyle: 'site.css',
            files: []
        };
        const conformance = {
            formatVersion: 1,
            provenance: {
                sharpTsRevision: '0'.repeat(40),
                test262Revision: '0'.repeat(40),
                typeScriptRevision: '0'.repeat(40)
            },
            roots: []
        };
        const english = loadLocale(paths.localeRoot, cultures[0]);
        const homeHtml = renderDocument(english, 'home', assets, conformance);
        expect(homeHtml.match(/curl -fsSL https:\/\/sharpts\.dev\/setup\.sh \| sh/g)).toHaveLength(2);
        expect(homeHtml.match(/irm https:\/\/sharpts\.dev\/setup\.ps1 \| iex/g)).toHaveLength(2);
        expect(homeHtml).not.toContain('dotnet tool install -g SharpTS');
        const installerIds = Array.from(
            homeHtml.matchAll(/id="((?:hero|getting-started)-installer-(?:shell|powershell)-(?:tab|panel))"/g),
            (match) => match[1]
        );
        expect(installerIds).toHaveLength(8);
        expect(new Set(installerIds).size).toBe(installerIds.length);
        for (const selector of ['hero-installer', 'getting-started-installer']) {
            for (const kind of ['shell', 'powershell']) {
                expect(homeHtml).toContain(`id="${selector}-${kind}-tab" class="tab installer-selector__tab`);
                expect(homeHtml).toContain(`aria-controls="${selector}-${kind}-panel"`);
                expect(homeHtml).toContain(`aria-labelledby="${selector}-${kind}-tab"`);
            }
        }
        expect(homeHtml.match(/data-installer-tab="shell"[^>]*aria-selected="true"[^>]*tabindex="0"/g)).toHaveLength(2);
        expect(
            homeHtml.match(/data-installer-tab="powershell"[^>]*aria-selected="false"[^>]*tabindex="-1"/g)
        ).toHaveLength(2);
        expect(homeHtml.match(/data-installer-panel="powershell" hidden/g)).toHaveLength(2);

        const localizedDescriptions = [
            'Run the setup script to install the best SharpTS build for this machine',
            '运行安装脚本，为此计算机安装合适的 SharpTS 版本',
            "Exécutez le script d'installation pour installer la version de SharpTS adaptée à cette machine",
            'Ejecuta el script de instalación para instalar la versión de SharpTS adecuada para este equipo',
            'Führen Sie das Setup-Skript aus, um die passende SharpTS-Variante für diesen Rechner zu installieren'
        ];
        cultures.forEach((culture, index) => {
            const locale = loadLocale(paths.localeRoot, culture);
            const html = renderDocument(locale, 'home', assets, conformance);
            expect(html).toContain(escapeHtml(localizedDescriptions[index]));
            expect(html).toContain('curl -fsSL https://sharpts.dev/setup.sh | sh');
            expect(html).toContain('irm https://sharpts.dev/setup.ps1 | iex');
        });

        const documentation = loadDocumentation(paths.repoRoot, paths.docsRoot);
        const installation = documentation.published.find(
            (candidate) => candidate.metadata.slug === 'getting-started/installation'
        )!;
        const installationHtml = renderDocumentationDocument(english, installation, documentation, assets);
        expect(installationHtml).toContain('curl -fsSL https://sharpts.dev/setup.sh | sh');
        expect(installationHtml).toContain('irm https://sharpts.dev/setup.ps1 | iex');
        expect(installationHtml).toContain('dotnet tool install --global SharpTS');

        const desktopGui = documentation.published.find(
            (candidate) => candidate.metadata.slug === 'getting-started/desktop-gui'
        )!;
        expect(desktopGui.rendered.html).toContain('dotnet tool install --global SharpTS --version 1.0.9');
    });

    it('escapes text by default', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('allows only attribute-free code tags in localized rich text', () => {
        expect(renderRichText('Use <code>dotnet build</code>.')).toBe('Use <code>dotnet build</code>.');
        expect(renderRichText('<code class="bad">unsafe</code><script>alert(1)</script>')).toBe(
            '&lt;code class=&quot;bad&quot;&gt;unsafe</code>&lt;script&gt;alert(1)&lt;/script&gt;'
        );
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
        expect(publishedDocumentation()).toHaveLength(11);
        expect(publishedDocumentation().map((article) => article.title)).toEqual([
            'Start using SharpTS',
            'Installation',
            'CLI basics',
            'Build a desktop GUI application',
            'Scripting with SharpTS',
            'Compilation and Native AOT',
            'Tree shaking',
            'Performance',
            'JavaScript Semantics on .NET',
            'Functions, Closures, and State Machines',
            'Modules and Dependency Compilation'
        ]);
        expect(publishedDocumentation().some((article) => article.slug.endsWith('/scripting'))).toBe(true);
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
        expect(docs.all).toHaveLength(12);
        expect(docs.published).toHaveLength(11);
        expect(docs.examples).toEqual([
            expect.objectContaining({ key: 'quick-start', modes: ['interpret', 'compile'] }),
            expect.objectContaining({ key: 'shebang-script', modes: ['interpret', 'compile'] }),
            expect.objectContaining({ key: 'semantic-parity', modes: ['interpret', 'compile'] }),
            expect.objectContaining({ key: 'closure-parity', modes: ['interpret', 'compile'] })
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
