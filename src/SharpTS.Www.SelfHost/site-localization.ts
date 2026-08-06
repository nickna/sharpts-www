import * as fs from 'fs';
import * as path from 'path';
import { normalizeNewlines } from './site-html';
import { bundleNames, cultures } from './site-model';
import type { CultureInfo, Locale } from './site-model';

function fail(message: string): never {
    throw new Error('Static site generation failed: ' + message);
}

function decodeXml(value: string): string {
    return normalizeNewlines(value)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

export function parseResx(filePath: string): { [key: string]: string } {
    if (!fs.existsSync(filePath))
        fail('missing resource file ' + filePath);

    return parseResxContent(String(fs.readFileSync(filePath, 'utf8')), filePath);
}

export function parseResxContent(content: string, description: string): { [key: string]: string } {
    const xml = normalizeNewlines(content);
    const values: { [key: string]: string } = {};
    const pattern = /<data\s+name="([^"]+)"[^>]*>[\s\S]*?<value[^>]*>([\s\S]*?)<\/value>[\s\S]*?<\/data>/g;
    while (true) {
        const match = pattern.exec(xml);
        if (match === null)
            break;
        if (values[match[1]] !== undefined)
            fail('duplicate resource key ' + match[1] + ' in ' + description);
        values[match[1]] = decodeXml(match[2]);
    }
    if (Object.keys(values).length === 0)
        fail('no resources parsed from ' + description);
    return values;
}

function resourcePath(localeRoot: string, bundle: string, culture: CultureInfo): string {
    const suffix = culture.code === 'en' ? '' : '.' + culture.code;
    return path.join(localeRoot, bundle + suffix + '.resx');
}

function requireSameKeys(expected: { [key: string]: string },
    actual: { [key: string]: string }, description: string): void {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (expectedKeys.join('\n') !== actualKeys.join('\n'))
        fail('resource keys differ for ' + description);
}

export function loadLocale(localeRoot: string, culture: CultureInfo): Locale {
    const bundles: { [bundle: string]: { [key: string]: string } } = {};
    for (const bundle of bundleNames) {
        const neutral = parseResx(resourcePath(localeRoot, bundle, cultures[0]));
        const localized = parseResx(resourcePath(localeRoot, bundle, culture));
        requireSameKeys(neutral, localized, bundle + ' (' + culture.code + ')');
        bundles[bundle] = localized;
    }
    return { culture, bundles };
}

export function t(locale: Locale, bundle: string, key: string): string {
    const group = locale.bundles[bundle];
    if (!group || group[key] === undefined)
        fail('missing resource ' + bundle + ':' + key + ' for ' + locale.culture.code);
    return group[key];
}
