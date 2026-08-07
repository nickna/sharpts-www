import * as fs from 'fs';
import * as path from 'path';
import { formatMessage, messagePlaceholders } from '../SharpTS.Www.Shared/message-format';
import type { MessageValues } from '../SharpTS.Www.Shared/message-format';
import { catalogNames, cultures } from './site-model';
import type { CultureInfo, Locale, MessageCatalog } from './site-model';

function fail(message: string): never {
    throw new Error('Localization validation failed: ' + message);
}

function messagePath(localeRoot: string, culture: CultureInfo, catalog: string): string {
    return path.join(localeRoot, culture.code, catalog + '.json');
}

function validateCatalog(value: unknown, description: string, prefix: string = ''): MessageCatalog {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        fail('expected an object at ' + (prefix || '<root>') + ' in ' + description);
    const result = value as MessageCatalog;
    for (const key of Object.keys(result)) {
        const child = result[key];
        const childPath = prefix ? prefix + '.' + key : key;
        if (typeof child === 'string')
            continue;
        if (child === null || typeof child !== 'object' || Array.isArray(child))
            fail('non-string message at ' + childPath + ' in ' + description);
        validateCatalog(child, description, childPath);
    }
    return result;
}

export function loadCatalog(filePath: string): MessageCatalog {
    if (!fs.existsSync(filePath))
        fail('missing message file ' + filePath);
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
        fail('malformed JSON in ' + filePath + ': ' + String(error));
    }
    return validateCatalog(parsed, filePath);
}

function flatten(catalog: MessageCatalog, prefix: string = '', result: { [key: string]: string } = {}): { [key: string]: string } {
    for (const key of Object.keys(catalog)) {
        const fullKey = prefix ? prefix + '.' + key : key;
        const value = catalog[key];
        if (typeof value === 'string')
            result[fullKey] = value;
        else
            flatten(value, fullKey, result);
    }
    return result;
}

function requireParity(english: MessageCatalog, localized: MessageCatalog, description: string): void {
    const expected = flatten(english);
    const actual = flatten(localized);
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (expectedKeys.join('\n') !== actualKeys.join('\n'))
        fail('message keys differ for ' + description);
    for (const key of expectedKeys) {
        const englishPlaceholders = messagePlaceholders(expected[key]);
        const localizedPlaceholders = messagePlaceholders(actual[key]);
        if (englishPlaceholders.join('\n') !== localizedPlaceholders.join('\n'))
            fail('placeholder names differ for ' + description + ':' + key);
    }
}

export function loadLocale(localeRoot: string, culture: CultureInfo): Locale {
    const messages: { [catalog: string]: MessageCatalog } = {};
    for (const catalog of catalogNames) {
        const english = loadCatalog(messagePath(localeRoot, cultures[0], catalog));
        const localized = loadCatalog(messagePath(localeRoot, culture, catalog));
        requireParity(english, localized, catalog + ' (' + culture.code + ')');
        messages[catalog] = localized;
    }
    return { culture, messages };
}

export function t(locale: Locale, key: string): string {
    const parts = key.split('.');
    let value: string | MessageCatalog | undefined = locale.messages[parts[0]];
    for (let index = 1; index < parts.length; index++) {
        if (value === undefined)
            fail('missing message ' + key + ' for ' + locale.culture.code);
        if (typeof value === 'string')
            fail('message path is not a string leaf: ' + key);
        const catalog = value as MessageCatalog;
        value = catalog[parts[index]];
    }
    if (typeof value === 'string')
        return value;
    return fail('missing message ' + key + ' for ' + locale.culture.code);
}

export { formatMessage };

export function tf(locale: Locale, key: string, values: MessageValues): string {
    return formatMessage(t(locale, key), values);
}
