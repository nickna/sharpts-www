import * as path from 'path';
import type { CultureInfo, PageKind } from './site-model';

export function routePath(culture: CultureInfo, page: PageKind): string {
    const prefix = culture.code === 'en' ? '' : '/' + culture.code;
    return page === 'home' ? (prefix || '/') : prefix + '/how-it-works';
}

export function outputPath(outputRoot: string, culture: CultureInfo, page: PageKind): string {
    const segments: string[] = [];
    if (culture.code !== 'en')
        segments.push(culture.code);
    if (page === 'guide')
        segments.push('how-it-works');
    segments.push('index.html');
    return path.join(outputRoot, ...segments);
}
