import * as fs from 'fs';
import * as path from 'path';
import { loadSitePaths } from './site-config';
import { copyTree, ensureDirectory, writeText } from './site-files';
import { normalizeNewlines } from './site-html';
import { loadLocale } from './i18n';
import {
    catalogNames,
    cultures,
    pageKinds,
    siteOrigin
} from './site-model';
import type { BrowserAssets, GeneratedRoute, Locale, PageKind } from './site-model';
import { docsOutputPath, docsRoutePath, outputPath, routePath } from './site-paths';
import { showcaseExamples } from './showcase-data';
import type { ConformanceData } from './conformance-data';
import { loadDocumentation } from './documentation';
import type { LoadedDocumentation, LoadedDocumentationArticle } from './documentation';
import {
    apiReferencePages,
    createApiSearchIndex,
    loadApiReferenceCatalog
} from './api-reference';
import { apiOutputPath, apiSearchOutputPath } from './site-paths';

function fail(message: string): never {
    throw new Error('Static site generation failed: ' + message);
}

function styleHash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index++)
        hash = (hash * 31 + value.charCodeAt(index)) % 4294967296;
    return ('00000000' + Math.floor(hash).toString(16)).slice(-8);
}

function buildStyles(stylesRoot: string, outputRoot: string): { sources: number; file: string } {
    const styleFiles = (fs.readdirSync(stylesRoot) as string[])
        .filter(file => file.endsWith('.css'))
        .sort();
    if (styleFiles.length === 0)
        fail('no CSS source files found');
    const sections = styleFiles.map(file => `/* Source: ${file} */\n${normalizeNewlines(String(fs.readFileSync(path.join(stylesRoot, file), 'utf8'))).trim()}\n`);
    const bundle = sections.join('\n');
    if (bundle.indexOf('::deep') >= 0)
        fail('CSS bundle still contains a Blazor ::deep selector');
    if (bundle.indexOf('SharpTS.Www.Web.styles.css') >= 0)
        fail('CSS bundle references Blazor CSS isolation output');
    const content = bundle + '\n';
    const file = `site-${styleHash(content)}.css`;
    writeText(path.join(outputRoot, 'css', file), content);
    return { sources: styleFiles.length, file };
}

function loadBrowserAssets(browserRoot: string, siteStyle: string): BrowserAssets {
    const manifestPath = path.join(browserRoot, 'browser-manifest.json');
    if (!fs.existsSync(manifestPath))
        fail('browser asset manifest is missing; run npm run build:browser first');
    const manifest = JSON.parse(String(fs.readFileSync(manifestPath, 'utf8'))) as {
        entry?: { script?: unknown; style?: unknown; conformanceScript?: unknown; docsScript?: unknown };
        files?: unknown;
    };
    const script = manifest.entry?.script;
    const style = manifest.entry?.style;
    const conformanceScript = manifest.entry?.conformanceScript;
    const docsScript = manifest.entry?.docsScript;
    const files = manifest.files;
    if (typeof script !== 'string' || typeof style !== 'string' ||
        typeof conformanceScript !== 'string' || typeof docsScript !== 'string' || !Array.isArray(files))
        fail('browser asset manifest is malformed');
    const entryScript = String(script);
    const entryStyle = String(style);
    const conformanceEntryScript = String(conformanceScript);
    const docsEntryScript = String(docsScript);
    const safeFiles = files as string[];
    if (!safeFiles.every(file => typeof file === 'string'))
        fail('browser asset manifest contains a non-string file path');
    for (const file of [entryScript, entryStyle, conformanceEntryScript, docsEntryScript, ...safeFiles]) {
        if (!file || file.indexOf('..') >= 0 || file.startsWith('/') || file.indexOf('\\') >= 0)
            fail('browser asset manifest contains an unsafe path');
        if (!fs.existsSync(path.join(browserRoot, file)))
            fail('browser asset manifest references missing file ' + file);
    }
    return {
        script: entryScript,
        style: entryStyle,
        conformanceScript: conformanceEntryScript,
        docsScript: docsEntryScript,
        siteStyle,
        files: safeFiles
    };
}

export function validateDocument(html: string, locale: Locale, page: PageKind,
    browserAssets: BrowserAssets): void {
    const required = [
        `<html lang="${locale.culture.code}">`,
        `<link rel="canonical" href="${siteOrigin}${routePath(locale.culture, page)}">`,
        `href="/css/${browserAssets.siteStyle}"`,
        'src="/img/sharpts-logo.png"',
        `href="/assets/browser/${browserAssets.style}"`
    ];
    if (page !== 'conformance')
        required.push(`src="/assets/browser/${browserAssets.script}"`);
    else
        required.push(`src="/assets/browser/${browserAssets.conformanceScript}"`);
    for (const marker of required) {
        if (html.indexOf(marker) < 0)
            fail('missing ' + marker + ' from ' + locale.culture.code + ' ' + page);
    }
    for (const culture of cultures) {
        if (html.indexOf(`hreflang="${culture.code}"`) < 0)
            fail('missing hreflang ' + culture.code + ' from ' + locale.culture.code + ' ' + page);
    }
    const forbidden = ['_framework/', 'blazor.web.js', 'SharpTS.Www.Web.styles.css', 'href="css/', 'src="img/'];
    for (const marker of forbidden) {
        if (html.indexOf(marker) >= 0)
            fail('forbidden legacy marker ' + marker + ' in ' + locale.culture.code + ' ' + page);
    }
}

export function validateDocumentationDocument(html: string, article: LoadedDocumentationArticle,
    browserAssets: BrowserAssets): void {
    const route = docsRoutePath(article.metadata.slug);
    const required = [
        '<html lang="en">',
        `<link rel="canonical" href="${siteOrigin}${route}">`,
        `href="/css/${browserAssets.siteStyle}"`,
        `href="/assets/browser/${browserAssets.style}"`,
        `src="/assets/browser/${browserAssets.docsScript}"`,
        'src="/img/sharpts-logo.png"',
        'data-docs-sidebar',
        'data-docs-outline'
    ];
    for (const marker of required) {
        if (html.indexOf(marker) < 0)
            fail('missing ' + marker + ' from documentation route ' + route);
    }
    if (html.indexOf('rel="alternate" hreflang=') >= 0)
        fail('English-only documentation must not emit translated alternates for ' + route);
    if (html.indexOf('<arrow fn>') >= 0 || html.indexOf('&lt;arrow fn&gt;') >= 0)
        fail('documentation contains an internal SharpTS function representation at ' + route);
}

export function validateApiReferenceDocument(html: string, page: any,
    browserAssets: BrowserAssets): void {
    const required = [
        '<html lang="en">',
        `<link rel="canonical" href="${siteOrigin}${page.route}">`,
        `href="/css/${browserAssets.siteStyle}"`,
        `href="/assets/browser/${browserAssets.style}"`,
        `src="/assets/browser/${browserAssets.docsScript}"`,
        'src="/img/sharpts-logo.png"',
        'data-docs-sidebar',
        'data-docs-outline',
        'data-api-search',
        '@sharpts/gui'
    ];
    for (const marker of required)
        if (html.indexOf(marker) < 0) fail('missing ' + marker + ' from API reference route ' + page.route);
    if (html.indexOf('rel="alternate" hreflang=') >= 0)
        fail('English-only API reference must not emit translated alternates for ' + page.route);
    if (html.indexOf('&lt;arrow fn&gt;') >= 0 || html.indexOf('<arrow fn>') >= 0)
        fail('API reference contains an internal SharpTS function representation at ' + page.route);
}

export function buildSite(renderDocument: (locale: Locale, page: PageKind,
    browserAssets: BrowserAssets) => string,
    renderDocumentationDocument: (locale: Locale, article: LoadedDocumentationArticle, documentation: LoadedDocumentation,
        browserAssets: BrowserAssets) => string,
    renderApiReferenceDocument: any,
    conformance: ConformanceData): void {
    const paths = loadSitePaths();
    ensureDirectory(paths.outputRoot);
    copyTree(paths.staticRoot, paths.outputRoot);
    const installScript = 'setup.sh';
    const installScriptSource = path.join(paths.repoRoot, installScript);
    if (!fs.existsSync(installScriptSource))
        fail('root setup.sh is missing');
    fs.copyFileSync(installScriptSource, path.join(paths.outputRoot, installScript));
    copyTree(paths.browserRoot, path.join(paths.outputRoot, 'assets', 'browser'));
    const stylesheet = buildStyles(paths.stylesRoot, paths.outputRoot);
    const browserAssets = loadBrowserAssets(paths.browserRoot, stylesheet.file);
    const apiCatalog = loadApiReferenceCatalog(paths.apiCatalog);
    const apiPages = apiReferencePages(apiCatalog);
    const documentation = loadDocumentation(paths.repoRoot, paths.docsRoot,
        apiPages.map(page => page.route));

    const routes: GeneratedRoute[] = [];
    for (const culture of cultures) {
        const locale = loadLocale(paths.localeRoot, culture);
        for (const page of pageKinds) {
            const html = renderDocument(locale, page, browserAssets);
            validateDocument(html, locale, page, browserAssets);
            const destination = outputPath(paths.outputRoot, culture, page);
            writeText(destination, html);
            routes.push({
                culture: culture.code,
                page,
                route: routePath(culture, page),
                file: path.relative(paths.outputRoot, destination).replace(/\\/g, '/')
            });
        }
    }

    const documentationLocale = loadLocale(paths.localeRoot, cultures[0]);
    for (const article of documentation.published) {
        const html = renderDocumentationDocument(documentationLocale, article, documentation, browserAssets);
        validateDocumentationDocument(html, article, browserAssets);
        const destination = docsOutputPath(paths.outputRoot, article.metadata.slug);
        writeText(destination, html);
        routes.push({
            culture: 'en',
            page: 'docs',
            slug: article.metadata.slug,
            route: docsRoutePath(article.metadata.slug),
            file: path.relative(paths.outputRoot, destination).replace(/\\/g, '/')
        });
    }

    for (const page of apiPages) {
        const html = renderApiReferenceDocument(documentationLocale, page, apiCatalog, documentation, browserAssets);
        validateApiReferenceDocument(html, page, browserAssets);
        const destination = apiOutputPath(paths.outputRoot, page.route);
        writeText(destination, html);
        routes.push({
            culture: 'en',
            page: 'api',
            slug: page.route.slice('/docs/api/'.length),
            route: page.route,
            file: path.relative(paths.outputRoot, destination).replace(/\\/g, '/')
        });
    }
    writeText(apiSearchOutputPath(paths.outputRoot),
        JSON.stringify(createApiSearchIndex(apiCatalog), null, 2) + '\n');

    writeText(path.join(paths.outputRoot, 'site-manifest.json'), JSON.stringify({
        generatedBy: 'SharpTS',
        cultures: cultures.map(culture => culture.code),
        routes,
        stylesheetSources: stylesheet.sources,
        stylesheet: 'css/' + stylesheet.file,
        installScript,
        messageFiles: cultures.length * catalogNames.length,
        browserBundle: browserAssets.files.map(file => 'assets/browser/' + file),
        browserEntry: {
            script: 'assets/browser/' + browserAssets.script,
            style: 'assets/browser/' + browserAssets.style,
            conformanceScript: 'assets/browser/' + browserAssets.conformanceScript,
            docsScript: 'assets/browser/' + browserAssets.docsScript
        }
    }, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'showcase-manifest.json'),
        JSON.stringify(showcaseExamples, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'conformance.json'),
        JSON.stringify(conformance, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'docs-manifest.json'), JSON.stringify({
        language: 'en',
        testedVersion: documentation.testedVersion,
        articles: documentation.published.map(article => ({
            ...article.metadata,
            route: docsRoutePath(article.metadata.slug),
            headings: article.rendered.headings
        }))
    }, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'docs-examples-manifest.json'),
        JSON.stringify(documentation.examples, null, 2) + '\n');

    console.log('Generated localized static site with ' + routes.length +
        ' pages (including ' + documentation.published.length + ' editorial documentation pages and ' +
        apiPages.length + ' API reference pages) and ' +
        stylesheet.sources + ' CSS sources at ' + paths.outputRoot);
}
