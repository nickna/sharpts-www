import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../../src/SharpTS.Www.SelfHost/config';
import {
    clientIdentity,
    normalizeRequestPath,
    originAllowed,
    staticFilePath
} from '../../src/SharpTS.Www.SelfHost/http-policy';

describe('HTTP policy', () => {
    it('normalizes safe paths and rejects encoded or backslash paths', () => {
        expect(normalizeRequestPath('guide?from=home')).toBe('/guide');
        expect(normalizeRequestPath('/')).toBe('/');
        expect(normalizeRequestPath('/%2e%2e/secret')).toBeNull();
        expect(normalizeRequestPath('/..\\secret')).toBeNull();
    });

    it('keeps static paths inside their content root', () => {
        const root = path.resolve('site', 'public');
        expect(staticFilePath(root, '/guide')).toBe(path.join(root, 'guide', 'index.html'));
        expect(staticFilePath(root, '/../secret')).toBeNull();
    });

    it('applies explicit and host-derived same-origin checks', () => {
        expect(originAllowed({ origin: 'https://sharpts.dev' }, 'https://sharpts.dev')).toBe(true);
        expect(originAllowed({ origin: 'https://attacker.invalid' }, 'https://sharpts.dev')).toBe(false);
        expect(originAllowed({ origin: 'http://localhost:8080', host: 'localhost:8080' }, '')).toBe(true);
        expect(originAllowed({ host: 'localhost:8080' }, '')).toBe(true);
    });

    it('ignores forwarded identities from untrusted peers', () => {
        const config = loadServerConfig({ SHARPTS_WWW_TRUST_RAILWAY_PROXY: 'true' }, '.');
        expect(clientIdentity('203.0.113.10', { 'x-real-ip': '198.51.100.5' }, config)).toBe('203.0.113.10');
        expect(clientIdentity('172.20.0.2', { 'x-real-ip': '198.51.100.5' }, config)).toBe('198.51.100.5');
        expect(clientIdentity('172.20.0.2', { 'x-real-ip': 'not an address' }, config)).toBe('172.20.0.2');
    });
});
