import * as path from 'path';
import type { CultureInfo, DocumentationRoute, PageKind } from './site-model';

export function routePath(culture: CultureInfo, page: PageKind): string {
    const prefix = culture.code === 'en' ? '' : '/' + culture.code;
    if (page === 'home') return prefix || '/';
    return prefix + '/conformance';
}

export function docsRoutePath(route: DocumentationRoute | string): string {
    const slug = typeof route === 'string' ? route : route.slug;
    return slug === 'index' ? '/docs' : '/docs/' + slug;
}

export function docsOutputPath(outputRoot: string, route: DocumentationRoute | string): string {
    const slug = typeof route === 'string' ? route : route.slug;
    const segments = ['docs'];
    if (slug !== 'index')
        segments.push(...slug.split('/'));
    segments.push('index.html');
    return path.join(outputRoot, ...segments);
}

export function apiOutputPath(outputRoot: string, route: string): string {
    if (!route.startsWith('/docs/api')) throw new Error('Invalid API reference route: ' + route);
    const segments = route.split('/').filter(segment => segment.length > 0);
    segments.push('index.html');
    return path.join(outputRoot, ...segments);
}

export function apiSearchOutputPath(outputRoot: string): string {
    return path.join(outputRoot, 'docs', 'api', 'search-index.json');
}

export function outputPath(outputRoot: string, culture: CultureInfo, page: PageKind): string {
    const segments: string[] = [];
    if (culture.code !== 'en')
        segments.push(culture.code);
    if (page === 'conformance')
        segments.push('conformance');
    segments.push('index.html');
    return path.join(outputRoot, ...segments);
}
