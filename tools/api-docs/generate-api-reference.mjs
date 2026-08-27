import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CATEGORY_DEFINITIONS = [
    ['components', 'Components', 'Native desktop controls and the props accepted by each control.'],
    ['core-composition', 'Core and Composition', 'Elements, composition primitives, refs, events, and shared GUI types.'],
    ['hooks-state', 'Hooks and State', 'Reactive state, lifecycle hooks, memoization, callbacks, and refs.'],
    ['application-lifecycle', 'Application Lifecycle', 'Application and window creation, lifetime, and shutdown.'],
    ['desktop-services', 'Desktop Services', 'Dialogs, notifications, clipboard, display, platform, and shell integration.'],
    ['data-templates', 'Data and Templates', 'Virtualized collections, trees, data grids, item keys, and templates.'],
    ['jsx-runtime', 'JSX Runtime', 'Automatic production and development JSX transform entry points.'],
    ['testing', 'Testing', 'Headless desktop test-driver APIs.'],
    ['devtools', 'Devtools', 'Inspector and headless snapshot APIs.']
];

const KIND = {
    Variable: 32,
    Function: 64,
    Interface: 256,
    Property: 1024,
    Method: 2048,
    CallSignature: 4096,
    TypeAlias: 2097152
};

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(toolRoot, '..', '..');

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function slugify(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function commentPartsText(parts = []) {
    return parts.map((part) => {
        if (typeof part.text === 'string' && part.text.trim()) return part.text;
        if (typeof part.name === 'string') return part.name;
        return '';
    }).join('').replace(/\s+/g, ' ').trim();
}

function commentSummary(reflection) {
    const direct = commentPartsText(reflection?.comment?.summary);
    if (direct) return direct;
    return commentPartsText(reflection?.signatures?.[0]?.comment?.summary);
}

function commentTag(reflection, tagName, parameterName) {
    let tags = reflection?.comment?.blockTags || [];
    if (!tags.length) tags = reflection?.signatures?.[0]?.comment?.blockTags || [];
    const tag = tags.find((candidate) => candidate.tag === tagName &&
        (parameterName === undefined || candidate.name === parameterName));
    return commentPartsText(tag?.content);
}

function commentCategory(reflection) {
    return commentTag(reflection, '@category');
}

function findSignatures(type) {
    if (!type) return [];
    if (type.type === 'reflection') return type.declaration?.signatures || [];
    return [];
}

function literalText(value) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value === null) return 'null';
    return String(value);
}

function appendPart(parts, text, symbolId) {
    if (!text) return;
    const previous = parts[parts.length - 1];
    if (!symbolId && previous && !previous.symbolId) previous.text += text;
    else parts.push(symbolId ? { text, symbolId } : { text });
}

function typeParts(type, context, depth = 0) {
    const parts = [];
    if (!type || depth > 12) return [{ text: 'unknown' }];
    const nested = (value) => typeParts(value, context, depth + 1);
    const join = (values, separator) => {
        values.forEach((value, index) => {
            if (index) appendPart(parts, separator);
            for (const part of nested(value)) appendPart(parts, part.text, part.symbolId);
        });
    };
    switch (type.type) {
        case 'intrinsic':
        case 'unknown':
            appendPart(parts, type.name || 'unknown');
            break;
        case 'literal':
            appendPart(parts, literalText(type.value));
            break;
        case 'reference': {
            const targetId = typeof type.target === 'number' ? context.reflectionToSymbol.get(type.target) : undefined;
            const symbolId = targetId || context.nameToSymbol.get(type.name);
            appendPart(parts, type.name || 'unknown', symbolId);
            if (type.typeArguments?.length) {
                appendPart(parts, '<');
                join(type.typeArguments, ', ');
                appendPart(parts, '>');
            }
            break;
        }
        case 'array':
            for (const part of nested(type.elementType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, '[]');
            break;
        case 'union':
            join(type.types || [], ' | ');
            break;
        case 'intersection':
            join(type.types || [], ' & ');
            break;
        case 'tuple':
            appendPart(parts, '[');
            join(type.elements || [], ', ');
            appendPart(parts, ']');
            break;
        case 'namedTupleMember':
            appendPart(parts, `${type.name}${type.isOptional ? '?' : ''}: `);
            for (const part of nested(type.element)) appendPart(parts, part.text, part.symbolId);
            break;
        case 'typeOperator':
            appendPart(parts, `${type.operator} `);
            for (const part of nested(type.target)) appendPart(parts, part.text, part.symbolId);
            break;
        case 'optional':
            for (const part of nested(type.elementType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, '?');
            break;
        case 'rest':
            appendPart(parts, '...');
            for (const part of nested(type.elementType)) appendPart(parts, part.text, part.symbolId);
            break;
        case 'reflection': {
            const declaration = type.declaration || {};
            const signatures = declaration.signatures || [];
            if (signatures.length) {
                if (signatures.length > 1) appendPart(parts, '(');
                signatures.forEach((signature, index) => {
                    if (index) appendPart(parts, ' | ');
                    appendPart(parts, '(');
                    (signature.parameters || []).forEach((parameter, parameterIndex) => {
                        if (parameterIndex) appendPart(parts, ', ');
                        appendPart(parts, `${parameter.flags?.isRest ? '...' : ''}${parameter.name}${parameter.flags?.isOptional ? '?' : ''}: `);
                        for (const part of nested(parameter.type)) appendPart(parts, part.text, part.symbolId);
                    });
                    appendPart(parts, ') => ');
                    for (const part of nested(signature.type)) appendPart(parts, part.text, part.symbolId);
                });
                if (signatures.length > 1) appendPart(parts, ')');
            } else {
                appendPart(parts, '{ ');
                (declaration.children || []).forEach((member, index) => {
                    if (index) appendPart(parts, '; ');
                    appendPart(parts, `${member.name}${member.flags?.isOptional ? '?' : ''}: `);
                    for (const part of nested(member.type)) appendPart(parts, part.text, part.symbolId);
                });
                appendPart(parts, ' }');
            }
            break;
        }
        case 'query':
            appendPart(parts, 'typeof ');
            for (const part of nested(type.queryType)) appendPart(parts, part.text, part.symbolId);
            break;
        case 'indexedAccess':
            for (const part of nested(type.objectType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, '[');
            for (const part of nested(type.indexType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, ']');
            break;
        case 'conditional':
            for (const part of nested(type.checkType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, ' extends ');
            for (const part of nested(type.extendsType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, ' ? ');
            for (const part of nested(type.trueType)) appendPart(parts, part.text, part.symbolId);
            appendPart(parts, ' : ');
            for (const part of nested(type.falseType)) appendPart(parts, part.text, part.symbolId);
            break;
        case 'predicate':
            appendPart(parts, type.asserts ? 'asserts ' : '');
            appendPart(parts, type.name || 'this');
            if (type.targetType) {
                appendPart(parts, ' is ');
                for (const part of nested(type.targetType)) appendPart(parts, part.text, part.symbolId);
            }
            break;
        case 'templateLiteral':
            appendPart(parts, '`' + (type.head || ''));
            for (const tail of type.tail || []) {
                appendPart(parts, '${');
                for (const part of nested(tail[0])) appendPart(parts, part.text, part.symbolId);
                appendPart(parts, '}' + tail[1]);
            }
            appendPart(parts, '`');
            break;
        default:
            appendPart(parts, type.name || 'unknown');
            break;
    }
    return parts;
}

function partsText(parts) {
    return parts.map((part) => part.text).join('');
}

function sourceFor(reflection, revision) {
    const source = reflection.sources?.[0];
    if (!source) return undefined;
    const file = source.fileName.replace(/\\/g, '/').replace(/^.*GuiPackage\//, '');
    const pathName = `src/SharpTS.Gui.Sdk/GuiPackage/${file}`;
    return {
        file: pathName,
        line: source.line,
        url: `https://github.com/nickna/SharpTS/blob/${revision}/${pathName}#L${source.line}`
    };
}

function signatureModel(signature, context, ownerSummary = '', reuseOwnerDescription = false) {
    const typeParameters = (signature.typeParameter || []).map((parameter) => ({
        name: parameter.name,
        constraint: parameter.type ? typeParts(parameter.type, context) : undefined,
        default: parameter.default ? typeParts(parameter.default, context) : undefined
    }));
    const parameters = (signature.parameters || []).map((parameter) => ({
        name: parameter.name,
        optional: Boolean(parameter.flags?.isOptional),
        rest: Boolean(parameter.flags?.isRest),
        type: typeParts(parameter.type, context),
        default: parameter.defaultValue,
        description: commentSummary(parameter) || commentTag(signature, '@param', parameter.name) ||
            (reuseOwnerDescription ? ownerSummary : '')
    }));
    return {
        typeParameters,
        parameters,
        returns: {
            type: typeParts(signature.type, context),
            description: commentTag(signature, '@returns') || (reuseOwnerDescription ? ownerSummary : '')
        },
        summary: commentSummary(signature) || ownerSummary
    };
}

function memberModel(member, context, controlProp) {
    const signatures = member.signatures || findSignatures(member.type);
    const description = controlProp?.documentation || commentSummary(member);
    return {
        name: member.name,
        kind: member.kind === KIND.Method || signatures.length ? 'method' : 'property',
        optional: Boolean(member.flags?.isOptional),
        isReadonly: Boolean(member.flags?.isReadonly),
        inherited: Boolean(member.flags?.isInherited),
        description,
        type: signatures.length ? undefined : typeParts(member.type, context),
        signatures: signatures.map((signature) => signatureModel(signature, context, description, true)),
        default: controlProp?.default,
        required: controlProp ? Boolean(controlProp.required) : !member.flags?.isOptional,
        enumValues: controlProp?.enumValues || literalUnionValues(member.type),
        source: sourceFor(member, context.revision)
    };
}

function literalUnionValues(type) {
    if (type?.type !== 'union' || !(type.types || []).every((item) => item.type === 'literal')) return undefined;
    return type.types.map((item) => item.value);
}

function kindFor(reflection, controlKinds) {
    if (controlKinds.has(reflection.name)) return 'Component';
    if (reflection.kind === KIND.Function) return 'Function';
    if (reflection.kind === KIND.Interface) return 'Interface';
    if (reflection.kind === KIND.TypeAlias) return 'Type alias';
    if (reflection.kind === KIND.Variable && (reflection.signatures?.length || findSignatures(reflection.type).length)) return 'Function';
    return 'Constant';
}

function categoryFor(entryPoint, name, controlKinds, propsKinds, annotated) {
    if (entryPoint === 'testing') return 'testing';
    if (entryPoint === 'devtools') return 'devtools';
    if (entryPoint === 'jsx-runtime' || entryPoint === 'jsx-dev-runtime') return 'jsx-runtime';
    const annotation = CATEGORY_DEFINITIONS.find((definition) => definition[1] === annotated || definition[0] === annotated);
    if (annotation) return annotation[0];
    if (controlKinds.has(name) || propsKinds.has(name)) return 'components';
    if (/^(createSignal|SignalSetter|StateSetter|Dispatch|use[A-Z]|createControlRef|ControlRef|MutableRef)/.test(name))
        return 'hooks-state';
    if (/^(createDesktopApplication|DesktopApplication|DesktopWindow|DesktopShutdownMode)/.test(name))
        return 'application-lifecycle';
    if (/^(show|readClipboard|writeClipboard|getLaunch|getDesktop|openExternal|printFile|FileFilter|MessageDialog|OpenFileDialog|SaveFileDialog|FolderDialog|Tray|DesktopTray|DesktopPlatform|DesktopDisplay|DesktopNotification)/.test(name))
        return 'desktop-services';
    if (/^(createVirtual|createTree|Virtual|TreeProps|DataGrid|ItemKey|ItemTemplate)/.test(name))
        return 'data-templates';
    return 'core-composition';
}

function flattenControlProps(manifest, control) {
    const result = [];
    for (const group of control.groups || []) result.push(...(manifest.propertyGroups[group] || []));
    result.push(...(control.props || []), ...(control.events || []));
    return result;
}

function validateDescriptorIdentity(repoRoot, manifest, docs) {
    if (manifest.schemaVersion !== docs.schemaVersion)
        throw new Error('GUI descriptor schema version does not match generated control documentation.');
    if (!/^[0-9a-f]{64}$/.test(docs.schemaHash || ''))
        throw new Error('Generated control documentation has an invalid descriptor schema hash.');
    const generated = fs.readFileSync(path.join(repoRoot,
        'lib/SharpTS/src/SharpTS.Gui.Sdk/GuiPackage/control-surface.generated.ts'), 'utf8');
    const match = /descriptorSchemaHash\s*=\s*"([0-9a-f]{64})"/.exec(generated);
    if (!match || match[1] !== docs.schemaHash)
        throw new Error('GUI descriptor schema hash does not match the generated TypeScript surface.');
    const manifestKinds = (manifest.controls || []).map((control) => control.kind);
    const docKinds = (docs.controls || []).map((control) => control.kind);
    if (JSON.stringify(manifestKinds) !== JSON.stringify(docKinds))
        throw new Error('Generated control documentation does not match controls.v1.json.');
}

function publicReflections(typedoc) {
    const result = [];
    const reflectionById = new Map();
    const collect = (reflection) => {
        if (!reflection || typeof reflection !== 'object') return;
        if (typeof reflection.id === 'number') reflectionById.set(reflection.id, reflection);
        for (const child of reflection.children || []) collect(child);
    };
    collect(typedoc);
    for (const entryPoint of typedoc.children || []) {
        if (!['index', 'testing', 'devtools', 'jsx-runtime', 'jsx-dev-runtime'].includes(entryPoint.name)) continue;
        for (const reflection of entryPoint.children || []) {
            if (reflection.flags?.isPrivate || reflection.flags?.isProtected) continue;
            const target = reflection.variant === 'reference' && typeof reflection.target === 'number'
                ? reflectionById.get(reflection.target)
                : undefined;
            const resolved = target ? {
                ...target,
                id: reflection.id,
                name: reflection.name,
                sources: reflection.sources || target.sources
            } : reflection;
            result.push({ entryPoint: entryPoint.name, reflection: resolved });
        }
    }
    return result;
}

function symbolSummary(reflection, control, isProps) {
    if (control) {
        if (isProps) return `Properties accepted by the ${control.kind} component.`;
        return control.documentation || '';
    }
    return commentSummary(reflection);
}

function collectRelated(symbol) {
    const ids = new Set();
    const collectParts = (parts) => {
        for (const part of parts || []) if (part.symbolId && part.symbolId !== symbol.id) ids.add(part.symbolId);
    };
    collectParts(symbol.type);
    for (const signature of symbol.signatures) {
        for (const parameter of signature.parameters) collectParts(parameter.type);
        collectParts(signature.returns.type);
        for (const parameter of signature.typeParameters) {
            collectParts(parameter.constraint);
            collectParts(parameter.default);
        }
    }
    for (const member of symbol.members) {
        collectParts(member.type);
        for (const signature of member.signatures) {
            for (const parameter of signature.parameters) collectParts(parameter.type);
            collectParts(signature.returns.type);
        }
    }
    return [...ids].sort();
}

export function validateCatalog(catalog, strictDocumentation = true) {
    const ids = new Set();
    const routes = new Set();
    const errors = [];
    for (const symbol of catalog.symbols) {
        if (ids.has(symbol.id)) errors.push(`duplicate symbol id ${symbol.id}`);
        if (routes.has(symbol.route)) errors.push(`duplicate symbol route ${symbol.route}`);
        ids.add(symbol.id);
        routes.add(symbol.route);
        if (!symbol.summary.trim()) errors.push(`undocumented public symbol ${symbol.entryPoint}.${symbol.name}`);
        for (const signature of symbol.signatures) {
            for (const parameter of signature.parameters)
                if (!parameter.description.trim()) errors.push(`undocumented parameter ${symbol.name}.${parameter.name}`);
            if (partsText(signature.returns.type) !== 'void' && !signature.returns.description.trim())
                errors.push(`undocumented return value ${symbol.name}`);
        }
        for (const member of symbol.members) {
            if (!member.description.trim()) errors.push(`undocumented public member ${symbol.name}.${member.name}`);
            for (const signature of member.signatures) {
                for (const parameter of signature.parameters)
                    if (!parameter.description.trim()) errors.push(`undocumented parameter ${symbol.name}.${member.name}.${parameter.name}`);
                if (partsText(signature.returns.type) !== 'void' && !signature.returns.description.trim())
                    errors.push(`undocumented return value ${symbol.name}.${member.name}`);
            }
        }
        for (const related of symbol.related) if (!ids.has(related) && !catalog.symbols.some((candidate) => candidate.id === related))
            errors.push(`invalid symbol link ${related} from ${symbol.name}`);
    }
    for (const category of catalog.categories) {
        if (routes.has(category.route)) errors.push(`duplicate category or symbol route ${category.route}`);
        routes.add(category.route);
        for (const id of category.symbolIds) if (!catalog.symbols.some((symbol) => symbol.id === id))
            errors.push(`category ${category.id} references missing symbol ${id}`);
    }
    if (catalog.symbols.length !== catalog.metadata.publicExportCount)
        errors.push('not every public export maps to exactly one symbol page');
    if (errors.length && strictDocumentation) throw new Error(`API reference validation failed:\n- ${errors.join('\n- ')}`);
    return errors;
}

export function normalizeCatalog({ typedoc, manifest, controlDocs, packageJson, revision, strictDocumentation = true }) {
    const expectedPackageExports = ['.', './devtools', './jsx-dev-runtime', './jsx-runtime', './testing'];
    const packageExports = Object.keys(packageJson.exports || {}).sort();
    if (JSON.stringify(packageExports) !== JSON.stringify(expectedPackageExports))
        throw new Error(`Unexpected @sharpts/gui package surface: ${packageExports.join(', ')}`);
    const entries = publicReflections(typedoc);
    const controlByKind = new Map((manifest.controls || []).map((control) => [control.kind, control]));
    const controlByProps = new Map();
    for (const control of manifest.controls || [])
        if (!controlByProps.has(control.propsType)) controlByProps.set(control.propsType, control);
    const controlKinds = new Set(controlByKind.keys());
    const propsKinds = new Set(controlByProps.keys());
    const nameCounts = new Map();
    for (const { reflection } of entries) nameCounts.set(reflection.name, (nameCounts.get(reflection.name) || 0) + 1);

    const reflectionToSymbol = new Map();
    const nameToSymbol = new Map();
    for (const { entryPoint, reflection } of entries) {
        const id = `${entryPoint}:${reflection.name}`;
        reflectionToSymbol.set(reflection.id, id);
        if (!nameToSymbol.has(reflection.name)) nameToSymbol.set(reflection.name, id);
    }
    const context = { reflectionToSymbol, nameToSymbol, revision };

    const symbols = entries.map(({ entryPoint, reflection }) => {
        const control = controlByKind.get(reflection.name) || controlByProps.get(reflection.name);
        const isProps = controlByProps.has(reflection.name);
        const id = `${entryPoint}:${reflection.name}`;
        const slug = (nameCounts.get(reflection.name) || 0) > 1
            ? `${slugify(entryPoint)}-${slugify(reflection.name)}`
            : slugify(reflection.name);
        const controlProps = control
            ? new Map(flattenControlProps(manifest, control).map((property) => [property.name, property]))
            : new Map();
        let signatures = reflection.signatures || findSignatures(reflection.type);
        if (!signatures.length && controlByKind.has(reflection.name)) {
            signatures = [{
                parameters: [{ name: 'props', type: { type: 'reference', name: control.propsType }, flags: {} }],
                type: { type: 'reference', name: 'GuiElement' }
            }];
        }
        const summary = symbolSummary(reflection, control, isProps);
        const type = reflection.kind === KIND.TypeAlias || (reflection.kind === KIND.Variable && !signatures.length)
            ? typeParts(reflection.type, context)
            : undefined;
        const symbol = {
            id,
            entryPoint,
            name: reflection.name,
            slug,
            route: `/docs/api/gui/${slug}`,
            kind: kindFor(reflection, controlKinds),
            category: categoryFor(entryPoint, reflection.name, controlKinds, propsKinds, commentCategory(reflection)),
            summary,
            remarks: commentTag(reflection, '@remarks'),
            aliases: control ? [control.adapter, isProps ? `${control.kind} props` : control.propsType] : [],
            type,
            enumValues: literalUnionValues(reflection.type),
            signatures: signatures.map((signature) => signatureModel(
                signature,
                context,
                summary,
                controlByKind.has(reflection.name) || reflection.kind === KIND.TypeAlias
            )),
            members: reflection.kind === KIND.Interface ? (reflection.children || []).map((member) => {
                const childDocumentation = member.name === 'children' && control
                    ? { documentation: `Child content accepted by ${control.kind}.`, required: false }
                    : undefined;
                return memberModel(member, context, controlProps.get(member.name) || childDocumentation);
            }) : [],
            source: sourceFor(reflection, revision),
            related: [],
            control: controlByKind.has(reflection.name) ? {
                nativeType: control.nativeType,
                children: control.children,
                propsType: control.propsType,
                handle: control.handle,
                props: flattenControlProps(manifest, control)
            } : undefined
        };
        symbol.related = collectRelated(symbol);
        return symbol;
    });

    symbols.sort((left, right) => left.name.localeCompare(right.name) || left.entryPoint.localeCompare(right.entryPoint));
    const categories = CATEGORY_DEFINITIONS.map(([id, title, summary]) => ({
        id,
        slug: id,
        title,
        summary,
        route: `/docs/api/gui/${id}`,
        symbolIds: symbols.filter((symbol) => symbol.category === id).map((symbol) => symbol.id)
    }));
    const catalog = {
        schemaVersion: 1,
        package: {
            name: packageJson.name,
            version: packageJson.version,
            revision,
            sourceUrl: `https://github.com/nickna/SharpTS/tree/${revision}/src/SharpTS.Gui.Sdk/GuiPackage`
        },
        descriptor: {
            schemaVersion: controlDocs.schemaVersion,
            schemaHash: controlDocs.schemaHash
        },
        metadata: {
            generatedAt: 'reproducible',
            entryPoints: ['index', 'testing', 'devtools', 'jsx-runtime', 'jsx-dev-runtime'],
            excludedEntryPoints: [],
            publicExportCount: entries.length
        },
        categories,
        symbols
    };
    const errors = validateCatalog(catalog, strictDocumentation);
    return { catalog, errors };
}

export function createSearchIndex(catalog) {
    return {
        schemaVersion: 1,
        package: catalog.package.name,
        version: catalog.package.version,
        symbols: catalog.symbols.map((symbol) => ({
            id: symbol.id,
            name: symbol.name,
            aliases: symbol.aliases,
            category: catalog.categories.find((category) => category.id === symbol.category)?.title || symbol.category,
            summary: symbol.summary,
            kind: symbol.kind,
            route: symbol.route
        }))
    };
}

export function runTypeDoc(repoRoot, outputFile) {
    const cli = path.join(toolRoot, 'node_modules', 'typedoc', 'bin', 'typedoc');
    if (!fs.existsSync(cli)) throw new Error('API documentation dependencies are missing; run npm ci in tools/api-docs.');
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const entryRoot = 'lib/SharpTS/src/SharpTS.Gui.Sdk/GuiPackage';
    const result = spawnSync(process.execPath, [
        cli,
        '--tsconfig', 'tools/api-docs/tsconfig.json',
        '--skipErrorChecking',
        '--excludeInternal',
        '--validation.notExported', 'false',
        '--entryPointStrategy', 'resolve',
        '--json', path.relative(repoRoot, outputFile).replaceAll(path.sep, '/'),
        `${entryRoot}/index.ts`,
        `${entryRoot}/testing.ts`,
        `${entryRoot}/devtools.ts`,
        `${entryRoot}/jsx-runtime.ts`,
        `${entryRoot}/jsx-dev-runtime.ts`
    ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('TypeDoc extraction failed.');
}

export function generateApiReference(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot);
    const artifactRoot = path.resolve(options.artifactRoot || process.env.SHARPTS_WWW_API_ARTIFACTS ||
        path.join(repoRoot, 'artifacts', 'api-reference'));
    const rawFile = path.join(artifactRoot, 'typedoc.raw.json');
    const catalogFile = path.join(artifactRoot, 'catalog.json');
    if (!options.skipTypeDoc) runTypeDoc(repoRoot, rawFile);
    const sourceRoot = path.join(repoRoot, 'lib', 'SharpTS', 'src');
    const manifest = readJson(path.join(sourceRoot, 'SharpTS.Gui', 'Controls', 'controls.v1.json'));
    const controlDocs = readJson(path.join(sourceRoot, 'SharpTS.Gui.Sdk', 'GuiPackage', 'control-docs.generated.json'));
    validateDescriptorIdentity(repoRoot, manifest, controlDocs);
    const packageJson = readJson(path.join(sourceRoot, 'SharpTS.Gui.Sdk', 'GuiPackage', 'package.json'));
    const sourceSettings = fs.readFileSync(path.join(repoRoot, 'sharpts-source.env'), 'utf8');
    const revision = /^SHARPTS_SOURCE_REVISION=([0-9a-f]{40})$/m.exec(sourceSettings)?.[1];
    if (!revision) throw new Error('Pinned SharpTS source revision is missing or malformed.');
    const { catalog, errors } = normalizeCatalog({
        typedoc: readJson(rawFile),
        manifest,
        controlDocs,
        packageJson,
        revision,
        strictDocumentation: false
    });
    const inspectionMode = options.strictDocumentation === false || process.argv.includes('--allow-undocumented');
    if (!inspectionMode) {
        const allowlistPath = path.join(repoRoot, 'tools', 'api-docs', 'documentation-gap-allowlist.json');
        const allowlist = readJson(allowlistPath);
        if (!Array.isArray(allowlist) || !allowlist.every((entry) => typeof entry === 'string'))
            throw new Error(`API documentation allowlist is malformed: ${allowlistPath}`);
        const allowed = new Set(allowlist);
        const unexpected = errors.filter((error) => !allowed.has(error));
        const stale = allowlist.filter((error) => !errors.includes(error));
        if (unexpected.length || stale.length) {
            const details = [
                ...unexpected.map((error) => `unexpected: ${error}`),
                ...stale.map((error) => `stale allowlist entry: ${error}`)
            ];
            throw new Error(`API reference validation failed:\n- ${details.join('\n- ')}`);
        }
    }
    writeJson(catalogFile, catalog);
    console.log(`Generated ${catalog.symbols.length} @sharpts/gui API symbols in ${catalogFile}.`);
    if (errors.length) console.warn(`API documentation coverage has ${errors.length} acknowledged issue(s):\n- ${errors.join('\n- ')}`);
    return { catalogFile, catalog, errors };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) generateApiReference();
