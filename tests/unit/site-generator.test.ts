import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRichText } from '../../src/SharpTS.Www.SelfHost/site-html';
import { parseResxContent } from '../../src/SharpTS.Www.SelfHost/site-localization';
import { cultures } from '../../src/SharpTS.Www.SelfHost/site-model';
import { routePath } from '../../src/SharpTS.Www.SelfHost/site-paths';
import { eligibleResults, parseBaselineText, passPercentage } from '../../src/SharpTS.Www.SelfHost/conformance-data';

describe('static site primitives', () => {
    it('escapes text by default', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('allows only attribute-free code tags in localized rich text', () => {
        expect(renderRichText('Use <code>dotnet build</code>.')).toBe('Use <code>dotnet build</code>.');
        expect(renderRichText('<code class="bad">unsafe</code><script>alert(1)</script>')).toBe(
            '&lt;code class=&quot;bad&quot;&gt;unsafe</code>&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('parses and decodes resx values while rejecting duplicate keys', () => {
        const resources = parseResxContent(
            '<root><data name="Greeting"><value>Hello &amp; &lt;code&gt;SharpTS&lt;/code&gt;</value></data></root>',
            'inline test'
        );
        expect(resources.Greeting).toBe('Hello & <code>SharpTS</code>');

        expect(() =>
            parseResxContent(
                '<root><data name="A"><value>one</value></data><data name="A"><value>two</value></data></root>',
                'duplicates'
            )
        ).toThrow(/duplicate resource key/);
    });

    it('emits stable localized routes', () => {
        expect(routePath(cultures[0], 'home')).toBe('/');
        expect(routePath(cultures[0], 'guide')).toBe('/how-it-works');
        expect(routePath(cultures[0], 'conformance')).toBe('/conformance');
        expect(routePath(cultures[2], 'home')).toBe('/fr');
        expect(routePath(cultures[2], 'guide')).toBe('/fr/how-it-works');
        expect(routePath(cultures[2], 'conformance')).toBe('/fr/conformance');
    });

    it('parses the versioned baseline contract and preserves skip semantics', () => {
        const parsed = parseBaselineText(
            '# SharpTS baseline-format=1 suite=Test262 corpus=0123456789abcdef0123456789abcdef01234567 — fixture\n' +
                'test/built-ins/Array/a.js Pass\n' +
                'test/built-ins/Array/b.js Fail\n' +
                'test/built-ins/Array/c.js Skipped:fixture\n',
            'Test262',
            'fixture'
        );
        expect(parsed.entries).toHaveLength(3);
        const counts = {
            Pass: 1,
            Fail: 1,
            RuntimeError: 0,
            ParseError: 0,
            TypeCheckError: 0,
            Timeout: 0,
            HarnessError: 0,
            Skipped: 1
        };
        expect(eligibleResults(counts)).toBe(2);
        expect(passPercentage(counts)).toBe(50);
    });

    it('rejects unknown baseline versions, buckets, and extra comments', () => {
        const header =
            '# SharpTS baseline-format=1 suite=Test262 corpus=0123456789abcdef0123456789abcdef01234567 — fixture\n';
        expect(() =>
            parseBaselineText(header.replace('format=1', 'format=2') + 'a.js Pass\n', 'Test262', 'fixture')
        ).toThrow(/unsupported baseline format/);
        expect(() => parseBaselineText(header + 'a.js Surprise\n', 'Test262', 'fixture')).toThrow(/unknown bucket/);
        expect(() => parseBaselineText(header + '# second comment\na.js Pass\n', 'Test262', 'fixture')).toThrow(
            /unexpected comment/
        );
    });
});
