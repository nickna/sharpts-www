import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { composeCode, heroCodeBody, playgroundCodeBody } from '../../src/SharpTS.Www.SelfHost/code-samples';
import { formatMessage, loadCatalog, loadLocale, t } from '../../src/SharpTS.Www.SelfHost/i18n';
import { catalogNames, cultures } from '../../src/SharpTS.Www.SelfHost/site-model';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharpts-i18n-'));
    temporaryRoots.push(root);
    return root;
}

function writeCatalog(root: string, culture: string, catalog: string, value: unknown): void {
    const directory = path.join(root, culture);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${catalog}.json`), JSON.stringify(value));
}

function writeFixture(root: string): void {
    for (const culture of ['en', 'fr']) {
        for (const catalog of catalogNames)
            writeCatalog(root, culture, catalog, { nested: { message: 'Hello {name}' } });
    }
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('JSON localization', () => {
    it('loads all four catalogs for every supported locale with English parity', () => {
        const localeRoot = path.resolve('src', 'SharpTS.Www.SelfHost', 'locales');
        for (const culture of cultures) {
            const locale = loadLocale(localeRoot, culture);
            expect(Object.keys(locale.messages).sort()).toEqual([...catalogNames].sort());
            expect(t(locale, 'home.hero.tagline').length).toBeGreaterThan(0);
        }
    });

    it('rejects missing files, malformed JSON, and non-string leaves', () => {
        const root = temporaryRoot();
        expect(() => loadCatalog(path.join(root, 'missing.json'))).toThrow(/missing message file/);
        const malformed = path.join(root, 'malformed.json');
        fs.writeFileSync(malformed, '{ nope');
        expect(() => loadCatalog(malformed)).toThrow(/malformed JSON/);
        const nonString = path.join(root, 'non-string.json');
        fs.writeFileSync(nonString, JSON.stringify({ count: 1 }));
        expect(() => loadCatalog(nonString)).toThrow(/non-string message/);
    });

    it('rejects missing, extra, and mismatched-placeholder keys', () => {
        const missing = temporaryRoot();
        writeFixture(missing);
        writeCatalog(missing, 'fr', 'home', {});
        expect(() => loadLocale(missing, cultures[2])).toThrow(/message keys differ/);

        const extra = temporaryRoot();
        writeFixture(extra);
        writeCatalog(extra, 'fr', 'common', {
            nested: { message: 'Bonjour {name}' },
            unexpected: 'value'
        });
        expect(() => loadLocale(extra, cultures[2])).toThrow(/message keys differ/);

        const placeholders = temporaryRoot();
        writeFixture(placeholders);
        writeCatalog(placeholders, 'fr', 'conformance', { nested: { message: 'Bonjour {person}' } });
        expect(() => loadLocale(placeholders, cultures[2])).toThrow(/placeholder names differ/);
    });

    it('rejects unknown lookup keys', () => {
        const localeRoot = path.resolve('src', 'SharpTS.Www.SelfHost', 'locales');
        const locale = loadLocale(localeRoot, cultures[0]);
        expect(() => t(locale, 'home.hero.notPresent')).toThrow(/missing message/);
    });

    it('formats reordered and repeated named placeholders and validates values', () => {
        expect(formatMessage('{second}, {first}; {first} again', { first: 'one', second: 'two' })).toBe(
            'two, one; one again'
        );
        expect(() => formatMessage('Hello {name}', {})).toThrow(/Missing message value/);
        expect(() => formatMessage('Hello {name}', { name: 'SharpTS', extra: 1 })).toThrow(/Unexpected message value/);
        expect(() => formatMessage('Hello {0}', {})).toThrow(/Invalid message placeholder syntax/);
    });

    it('composes localized comments with typed code bodies', () => {
        const hero = composeCode('// localized hero', heroCodeBody);
        const playground = composeCode('// localized playground\n', playgroundCodeBody);
        expect(hero).toContain('// localized hero\ninterface Greeter');
        expect(hero).toContain('new WelcomeBot("Hello")');
        expect(playground).toContain('// localized playground\n\ninterface Person');
        expect(playground).toContain('console.log(greet(developer));');
    });
});
