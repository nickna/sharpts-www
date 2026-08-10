import * as fs from 'fs';
import * as path from 'path';
import {
    documentationManifest,
    publishedDocumentation,
    validateDocumentationManifest
} from './docs-manifest';
import type { DocumentationArticle } from './docs-manifest';
import { renderDocumentationMarkdown } from './docs-markdown';
import type { DocumentationExample, RenderedMarkdown } from './docs-markdown';
import { escapeHtml } from './site-html';
import { docsRoutePath } from './site-paths';

export interface LoadedDocumentationArticle {
    metadata: DocumentationArticle;
    rendered: RenderedMarkdown;
}

export interface LoadedDocumentation {
    all: LoadedDocumentationArticle[];
    published: LoadedDocumentationArticle[];
    examples: DocumentationExample[];
    testedVersion: string;
}

function diagram(label: string, body: string, caption: string): string {
    return '<figure class="docs-figure" tabindex="0" aria-label="' + escapeHtml(label) + '"><svg viewBox="0 0 760 190" aria-hidden="true" focusable="false">' +
        body + '</svg><figcaption><strong>' + escapeHtml(label) + '.</strong> ' + escapeHtml(caption) + '</figcaption></figure>';
}

function box(x: number, width: number, title: string, detail: string, accent: string = ''): string {
    return '<g class="docs-figure__node' + accent + '"><rect x="' + x + '" y="45" width="' + width + '" height="82" rx="10"></rect><text x="' +
        (x + width / 2) + '" y="78" text-anchor="middle">' + escapeHtml(title) + '</text><text class="docs-figure__detail" x="' +
        (x + width / 2) + '" y="104" text-anchor="middle">' + escapeHtml(detail) + '</text></g>';
}

function arrow(x1: number, x2: number, label: string = ''): string {
    return '<g class="docs-figure__arrow"><path d="M ' + x1 + ' 86 H ' + x2 + '"></path><path d="m ' + (x2 - 9) + ' 78 9 8-9 8"></path>' +
        (label ? '<text x="' + ((x1 + x2) / 2) + '" y="70" text-anchor="middle">' + escapeHtml(label) + '</text>' : '') + '</g>';
}

export function renderDocumentationFigure(name: string): string {
    if (name === 'quick-start')
        return diagram('SharpTS quick-start flow', box(25, 180, 'TypeScript', 'hello.ts') + arrow(205, 290) +
            box(290, 180, 'Interpret or compile', 'sharpts', ' docs-figure__node--accent') + arrow(470, 555) +
            box(555, 180, 'Output', 'console or .NET IL'),
        'A TypeScript source file can run immediately through the interpreter or compile to .NET IL.');
    if (name === 'installation')
        return diagram('Installation decision', box(35, 210, '.NET 10 SDK installed?', 'Choose your package') +
            arrow(245, 335, 'yes') + box(335, 180, '.NET global tool', 'dotnet tool install', ' docs-figure__node--accent') +
            '<path class="docs-figure__branch" d="M 140 127 V 158 H 580 V 127"></path><text x="350" y="178" text-anchor="middle">no — use a self-contained release</text>' +
            box(580, 150, 'Release asset', 'OS + architecture'),
        'Use the global tool when the SDK is present; otherwise choose a self-contained asset for the machine.');
    if (name === 'cli-modes')
        return diagram('CLI execution modes', box(12, 160, 'sharpts', 'REPL') + arrow(172, 202) +
            box(202, 160, 'sharpts app.ts', 'interpret') + arrow(362, 392) +
            box(392, 170, '--compile app.ts', 'app.dll', ' docs-figure__node--accent') + arrow(562, 592) +
            box(592, 156, '-t exe', 'executable'),
        'Move from an interactive session to interpreted files, .NET assemblies, or supported native executable targets.');
    if (name === 'web-boundary')
        return diagram('Web-project boundary', box(18, 205, 'Browser modules', 'Vite / webpack / esbuild') +
            arrow(223, 282) + box(282, 190, 'Shared TypeScript', 'portable domain code', ' docs-figure__node--accent') +
            arrow(472, 531) + box(531, 210, 'Native modules', 'SharpTS / dotnet: APIs'),
        'Browser and SharpTS-native entries can share compatible pure TypeScript while keeping platform APIs on their own side.');
    if (name === 'scripting')
        return diagram('Scripting execution path', box(25, 180, 'Executable script', '#!/usr/bin/env sharpts') + arrow(205, 290) +
            box(290, 180, 'env finds sharpts', 'using PATH', ' docs-figure__node--accent') + arrow(470, 555) +
            box(555, 180, 'SharpTS runs file', 'arguments in process.argv'),
        'The shell delegates to env, which finds SharpTS on PATH and passes the script path and arguments to it.');
    if (name === 'compilation-pipeline')
        return diagram('SharpTS compilation pipeline', box(10, 150, 'TypeScript', 'source modules') + arrow(160, 195) +
            box(195, 165, 'Front end', 'parse + type check', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Execution path', 'interpret or compile') + arrow(565, 600) +
            box(600, 150, 'Result', 'output or .NET IL'),
        'Both execution paths share the front end; compilation persists a managed .NET assembly instead of running the tree walker.');
    if (name === 'tree-shaking')
        return diagram('Tree-shaking flow', box(10, 150, 'Typed AST', 'program features') + arrow(160, 195) +
            box(195, 165, 'Detect features', 'conservative scan', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Close dependencies', 'required helpers') + arrow(565, 600) +
            box(600, 150, 'Emit runtime', 'omit unused groups'),
        'SharpTS retains every plausibly required feature and emits only the corresponding runtime groups plus the core runtime.');
    if (name === 'performance-paths')
        return diagram('Compiler specialization', box(10, 150, 'Type information', 'number[] or any') + arrow(160, 195) +
            box(195, 165, 'Choose lowering', 'safe specialization', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Generated IL', 'direct fast path') + arrow(565, 600) +
            box(600, 150, 'Fallback', 'dynamic semantics'),
        'The compiler selects specialized IL when types prove it safe and preserves a dynamic fallback where JavaScript behavior requires one.');
    if (name === 'semantic-lowering')
        return diagram('JavaScript semantic lowering', box(10, 150, 'TypeScript value', 'static + dynamic facts') + arrow(160, 195) +
            box(195, 165, 'Semantic operation', 'equality or property', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Chosen lowering', 'direct IL or helper') + arrow(565, 600) +
            box(600, 150, 'Observable result', 'JavaScript behavior'),
        'Static types can select a direct IL operation, while dynamic cases use generated helpers that preserve the same observable JavaScript result.');
    if (name === 'function-lowering')
        return diagram('Function and state-machine lowering', box(10, 150, 'Function syntax', 'call + lexical scope') + arrow(160, 195) +
            box(195, 165, 'Capture analysis', 'locals + this', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Generated shape', 'method or state machine') + arrow(565, 600) +
            box(600, 150, 'Invocation', 'run or resume'),
        'Ordinary calls become methods and callable wrappers; captured or suspended state moves into generated objects that survive after the original frame.');
    if (name === 'module-graph')
        return diagram('Module dependency compilation', box(10, 150, 'Entry module', 'app.ts') + arrow(160, 195) +
            box(195, 165, 'ModuleResolver', 'load dependency graph', ' docs-figure__node--accent') + arrow(360, 395) +
            box(395, 170, 'Type checking', 'imports + exports') + arrow(565, 600) +
            box(600, 150, 'One assembly', 'module types + cache'),
        'SharpTS starts from an entry point, resolves and checks its reachable modules, then emits their initialization and exports into one managed assembly.');
    throw new Error('Unknown documentation figure: ' + name);
}

function loadTestedVersion(repoRoot: string): string {
    const source = String(fs.readFileSync(path.join(repoRoot, 'sharpts-source.env'), 'utf8'));
    const match = /^SHARPTS_SOURCE_REVISION=([0-9a-f]{40})$/m.exec(source);
    if (!match) throw new Error('Pinned SharpTS source revision is missing or malformed');
    return '0.0.0-local+' + match[1].slice(0, 8);
}

export function validateDocumentationLinks(articles: LoadedDocumentationArticle[]): void {
    const publishedRoutes: { [route: string]: LoadedDocumentationArticle } = {};
    for (const article of articles) {
        if (article.metadata.published)
            publishedRoutes[docsRoutePath(article.metadata.slug)] = article;
    }
    for (const article of articles) {
        for (const link of article.rendered.links) {
            if (!link.startsWith('/docs')) continue;
            const parts = link.split('#');
            const target = publishedRoutes[parts[0]];
            if (!target)
                throw new Error('Broken or unpublished documentation link ' + link + ' in ' + article.metadata.slug);
            if (parts[1] && !target.rendered.headings.some(heading => heading.id === parts[1]))
                throw new Error('Unknown documentation heading ' + link + ' in ' + article.metadata.slug);
        }
    }
}

export function loadDocumentation(repoRoot: string, docsRoot: string): LoadedDocumentation {
    validateDocumentationManifest(documentationManifest);
    const all = documentationManifest.map(metadata => {
        const sourcePath = path.join(docsRoot, ...metadata.slug.split('/')) + (metadata.slug === 'index' ? '.md' : '.md');
        if (!fs.existsSync(sourcePath)) throw new Error('Documentation source is missing: ' + sourcePath);
        const rendered = renderDocumentationMarkdown(String(fs.readFileSync(sourcePath, 'utf8')), {
            articleSlug: metadata.slug,
            renderFigure: renderDocumentationFigure
        });
        return { metadata, rendered };
    });
    validateDocumentationLinks(all);
    const publishedMetadata = publishedDocumentation();
    const published = publishedMetadata.map(metadata => all.find(article => article.metadata.slug === metadata.slug)!);
    const examples: DocumentationExample[] = [];
    const exampleKeys: { [key: string]: boolean } = {};
    for (const article of published) {
        for (const example of article.rendered.examples) {
            if (exampleKeys[example.key]) throw new Error('Duplicate documentation example key: ' + example.key);
            exampleKeys[example.key] = true;
            examples.push(example);
        }
    }
    return { all, published, examples, testedVersion: loadTestedVersion(repoRoot) };
}
