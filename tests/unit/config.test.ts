import { describe, expect, it } from 'vitest';
import {
    canTrustProxyHeaders,
    isPrivateNetworkAddress,
    loadServerConfig,
    loadSupervisorConfig
} from '../../src/SharpTS.Www.SelfHost/config';

describe('application configuration', () => {
    it('loads safe defaults and normalizes the public origin', () => {
        const config = loadServerConfig(
            {
                PORT: '9000',
                SHARPTS_WWW_PUBLIC_ORIGIN: 'HTTPS://Example.COM/'
            },
            '.'
        );

        expect(config.port).toBe(9000);
        expect(config.publicOrigin).toBe('https://example.com');
        expect(config.executionRequestsPerMinute).toBe(10);
    });

    it('fails fast for malformed values', () => {
        expect(() => loadServerConfig({ PORT: 'not-a-port' }, '.')).toThrow(/PORT/);
        expect(() => loadServerConfig({ SHARPTS_WWW_TRUST_RAILWAY_PROXY: 'yes' }, '.')).toThrow(/true.*false/);
        expect(() => loadServerConfig({ SHARPTS_WWW_PUBLIC_ORIGIN: 'https://example.com/path' }, '.')).toThrow(
            /origin/
        );
        expect(() => loadSupervisorConfig({ SHARPTS_WWW_MAX_QUEUED_EXECUTIONS: '-1' }, '.')).toThrow(/MAX_QUEUED/);
    });

    it('treats a null runtime environment value as unset', () => {
        expect(loadSupervisorConfig({ SHARPTS_WWW_MAX_SOURCE_BYTES: null }, '.').maximumSourceBytes).toBe(10 * 1024);
    });

    it('trusts explicit peers and private platform proxies only', () => {
        const explicit = loadServerConfig(
            {
                SHARPTS_WWW_TRUSTED_PROXY_ADDRESSES: '203.0.113.10'
            },
            '.'
        );
        expect(canTrustProxyHeaders('203.0.113.10', explicit)).toBe(true);
        expect(canTrustProxyHeaders('203.0.113.11', explicit)).toBe(false);

        const platform = loadServerConfig({ SHARPTS_WWW_TRUST_RAILWAY_PROXY: 'true' }, '.');
        expect(isPrivateNetworkAddress('::ffff:172.20.0.2')).toBe(true);
        expect(canTrustProxyHeaders('172.20.0.2', platform)).toBe(true);
        expect(canTrustProxyHeaders('203.0.113.11', platform)).toBe(false);
    });
});
