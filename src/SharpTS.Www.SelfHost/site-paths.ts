import * as path from 'path';
import type { CultureInfo, DocumentationRoute, PageKind } from './site-model';

export function routePath(culture: CultureInfo, page: PageKind): string {
    const prefix = culture.code === 'en' ? '' : '/' + culture.code;
    if (page === 'home') return prefix || '/';
    return prefix + (page === 'guide' ? '/how-it-works' : '/conformance');
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

export function outputPath(outputRoot: string, culture: CultureInfo, page: PageKind): string {
    const segments: string[] = [];
    if (culture.code !== 'en')
        segments.push(culture.code);
    if (page === 'guide')
        segments.push('how-it-works');
    else if (page === 'conformance')
        segments.push('conformance');
    segments.push('index.html');
    return path.join(outputRoot, ...segments);
}
