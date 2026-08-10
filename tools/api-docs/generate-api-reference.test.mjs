import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCatalog, validateCatalog } from './generate-api-reference.mjs';

const summary = (text) => ({ summary: [{ kind: 'text', text }] });
const signatureComment = (text, parameters, returns) => ({
    summary: [{ kind: 'text', text }],
    blockTags: [
        ...Object.entries(parameters).map(([name, value]) => ({
            tag: '@param',
            name,
            content: [{ kind: 'text', text: value }]
        })),
        { tag: '@returns', content: [{ kind: 'text', text: returns }] }
    ]
});

function fixture() {
    const mapSignature = (id, parameterType, returnType) => ({
        id,
        name: 'mapValue',
        kind: 4096,
        comment: signatureComment('Maps one value.', { value: 'Value to map.' }, 'The mapped value.'),
        typeParameter: [{ name: 'T', type: { type: 'intrinsic', name: 'unknown' } }],
        parameters: [{ name: 'value', flags: {}, type: parameterType }],
        type: returnType,
        sources: [{ fileName: 'runtime.ts', line: 10 }]
    });
    return {
        typedoc: {
            children: [
                {
                    name: 'index',
                    children: [
                        {
                            id: 1,
                            name: 'Button',
                            kind: 32,
                            flags: { isConst: true },
                            sources: [{ fileName: 'control-surface.generated.ts', line: 20 }],
                            type: { type: 'reference', name: 'DesktopTag' }
                        },
                        {
                            id: 2,
                            name: 'ButtonProps',
                            kind: 256,
                            flags: {},
                            sources: [{ fileName: 'control-surface.generated.ts', line: 12 }],
                            children: [{
                                id: 3,
                                name: 'title',
                                kind: 1024,
                                flags: {},
                                type: { type: 'intrinsic', name: 'string' },
                                sources: [{ fileName: 'control-surface.generated.ts', line: 14 }]
                            }]
                        },
                        {
                            id: 4,
                            name: 'mapValue',
                            kind: 64,
                            flags: {},
                            sources: [{ fileName: 'runtime.ts', line: 10 }],
                            signatures: [
                                mapSignature(5, { type: 'intrinsic', name: 'string' }, { type: 'intrinsic', name: 'string' }),
                                mapSignature(6, { type: 'intrinsic', name: 'number' }, { type: 'intrinsic', name: 'number' })
                            ]
                        },
                        {
                            id: 7,
                            name: 'Mode',
                            kind: 2097152,
                            flags: {},
                            comment: summary('Supported operating modes.'),
                            sources: [{ fileName: 'runtime-types.ts', line: 5 }],
                            type: { type: 'union', types: [
                                { type: 'literal', value: 'fast' },
                                { type: 'literal', value: 'safe' }
                            ] }
                        }
                    ]
                },
                { name: 'testing', children: [{ id: 8, name: 'Helper', kind: 256, flags: {}, comment: summary('Testing helper.'), children: [] }] },
                { name: 'devtools', children: [{ id: 9, name: 'Helper', kind: 256, flags: {}, comment: summary('Devtools helper.'), children: [] }] }
            ]
        },
        manifest: {
            schemaVersion: 1,
            propertyGroups: {},
            controls: [{
                kind: 'Button',
                adapter: 'button',
                nativeType: 'Avalonia.Controls.Button',
                propsType: 'ButtonProps',
                handle: 'ButtonHandle',
                groups: [],
                children: { model: 'text', minimum: 0, maximum: 0 },
                documentation: 'Activates an action.',
                props: [{ name: 'title', type: 'string', required: true, default: 'Run', documentation: 'Button title.' }],
                events: []
            }]
        },
        controlDocs: { schemaVersion: 1, schemaHash: 'a'.repeat(64), controls: [] },
        packageJson: {
            name: '@sharpts/gui',
            version: '1.2.3',
            exports: {
                '.': './index.ts',
                './devtools': './devtools.ts',
                './jsx-dev-runtime': './jsx-dev-runtime.ts',
                './jsx-runtime': './jsx-runtime.ts',
                './testing': './testing.ts'
            }
        },
        revision: 'b'.repeat(40)
    };
}

test('normalizes controls, generics, overloads, unions, source links, and duplicate names', () => {
    const { catalog, errors } = normalizeCatalog(fixture());
    assert.deepEqual(errors, []);
    assert.equal(catalog.symbols.length, 6);
    const button = catalog.symbols.find(symbol => symbol.name === 'Button');
    assert.equal(button.kind, 'Component');
    assert.equal(button.control.props[0].default, 'Run');
    assert.equal(button.source.url, `https://github.com/nickna/SharpTS/blob/${'b'.repeat(40)}/SharpTS.Gui.Sdk/GuiPackage/control-surface.generated.ts#L20`);
    const props = catalog.symbols.find(symbol => symbol.name === 'ButtonProps');
    assert.equal(props.members[0].default, 'Run');
    assert.equal(props.members[0].required, true);
    const generic = catalog.symbols.find(symbol => symbol.name === 'mapValue');
    assert.equal(generic.signatures.length, 2);
    assert.equal(generic.signatures[0].typeParameters[0].name, 'T');
    const mode = catalog.symbols.find(symbol => symbol.name === 'Mode');
    assert.deepEqual(mode.enumValues, ['fast', 'safe']);
    assert.deepEqual(catalog.symbols.filter(symbol => symbol.name === 'Helper').map(symbol => symbol.slug).sort(),
        ['devtools-helper', 'testing-helper']);
});

test('rejects missing documentation, invalid links, and category route collisions', () => {
    const packageSurface = fixture();
    packageSurface.packageJson.exports['./private'] = './private.ts';
    assert.throws(() => normalizeCatalog(packageSurface), /Unexpected @sharpts\/gui package surface/);

    const missing = fixture();
    missing.typedoc.children[0].children[3].comment = undefined;
    assert.throws(() => normalizeCatalog(missing), /undocumented public symbol index\.Mode/);

    const { catalog } = normalizeCatalog(fixture());
    catalog.symbols[0].related.push('index:Missing');
    assert.throws(() => validateCatalog(catalog), /invalid symbol link/);

    const collision = fixture();
    collision.typedoc.children[0].children.push({
        id: 10,
        name: 'Components',
        kind: 32,
        flags: { isConst: true },
        comment: summary('Component registry.'),
        type: { type: 'intrinsic', name: 'string' }
    });
    assert.throws(() => normalizeCatalog(collision), /duplicate category or symbol route/);
});
