import * as fs from 'fs';
import * as path from 'path';
import { loadSitePaths } from './site-config';
import { copyTree, ensureDirectory, writeText } from './site-files';
import { normalizeNewlines } from './site-html';
import { loadLocale } from './site-localization';
import {
    bundleNames,
    cultures,
    pageKinds,
    siteOrigin
} from './site-model';
import type { BrowserAssets, GeneratedRoute, Locale, PageKind } from './site-model';
import { outputPath, routePath } from './site-paths';
import { showcaseExamples } from './showcase-data';
import type { ConformanceData } from './conformance-data';

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
        entry?: { script?: unknown; style?: unknown; conformanceScript?: unknown };
        files?: unknown;
    };
    const script = manifest.entry?.script;
    const style = manifest.entry?.style;
    const conformanceScript = manifest.entry?.conformanceScript;
    const files = manifest.files;
    if (typeof script !== 'string' || typeof style !== 'string' ||
        typeof conformanceScript !== 'string' || !Array.isArray(files))
        fail('browser asset manifest is malformed');
    const entryScript = String(script);
    const entryStyle = String(style);
    const conformanceEntryScript = String(conformanceScript);
    const safeFiles = files as string[];
    if (!safeFiles.every(file => typeof file === 'string'))
        fail('browser asset manifest contains a non-string file path');
    for (const file of [entryScript, entryStyle, conformanceEntryScript, ...safeFiles]) {
        if (!file || file.indexOf('..') >= 0 || file.startsWith('/') || file.indexOf('\\') >= 0)
            fail('browser asset manifest contains an unsafe path');
        if (!fs.existsSync(path.join(browserRoot, file)))
            fail('browser asset manifest references missing file ' + file);
    }
    return {
        script: entryScript,
        style: entryStyle,
        conformanceScript: conformanceEntryScript,
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

export function buildSite(renderDocument: (locale: Locale, page: PageKind,
    browserAssets: BrowserAssets) => string, conformance: ConformanceData): void {
    const paths = loadSitePaths();
    ensureDirectory(paths.outputRoot);
    copyTree(paths.staticRoot, paths.outputRoot);
    copyTree(paths.browserRoot, path.join(paths.outputRoot, 'assets', 'browser'));
    const stylesheet = buildStyles(paths.stylesRoot, paths.outputRoot);
    const browserAssets = loadBrowserAssets(paths.browserRoot, stylesheet.file);

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

    writeText(path.join(paths.outputRoot, 'site-manifest.json'), JSON.stringify({
        generatedBy: 'SharpTS',
        cultures: cultures.map(culture => culture.code),
        routes,
        stylesheetSources: stylesheet.sources,
        stylesheet: 'css/' + stylesheet.file,
        resourceFiles: cultures.length * bundleNames.length,
        browserBundle: browserAssets.files.map(file => 'assets/browser/' + file),
        browserEntry: {
            script: 'assets/browser/' + browserAssets.script,
            style: 'assets/browser/' + browserAssets.style,
            conformanceScript: 'assets/browser/' + browserAssets.conformanceScript
        }
    }, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'showcase-manifest.json'),
        JSON.stringify(showcaseExamples, null, 2) + '\n');
    writeText(path.join(paths.outputRoot, 'conformance.json'),
        JSON.stringify(conformance, null, 2) + '\n');

    console.log('Generated localized static site with ' + routes.length +
        ' pages and ' + stylesheet.sources + ' CSS sources at ' + paths.outputRoot);
}
