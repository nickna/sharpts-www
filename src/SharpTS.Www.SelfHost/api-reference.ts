import * as fs from 'fs';

export interface ApiReferenceTypePart {
    text: string;
    symbolId?: string;
}

export interface ApiReferenceParameter {
    name: string;
    optional: boolean;
    rest: boolean;
    type: ApiReferenceTypePart[];
    default?: string;
    description: string;
}

export interface ApiReferenceSignature {
    typeParameters: {
        name: string;
        constraint?: ApiReferenceTypePart[];
        default?: ApiReferenceTypePart[];
    }[];
    parameters: ApiReferenceParameter[];
    returns: {
        type: ApiReferenceTypePart[];
        description: string;
    };
    summary: string;
}

export interface ApiReferenceMember {
    name: string;
    kind: 'property' | 'method';
    isMethodDeclaration: boolean;
    optional: boolean;
    isReadonly: boolean;
    inherited: boolean;
    description: string;
    type?: ApiReferenceTypePart[];
    signatures: ApiReferenceSignature[];
    default?: unknown;
    remarks: string;
    examples: string[];
    throws: string[];
    required: boolean;
    enumValues?: unknown[];
    source?: ApiReferenceSource;
}

export interface ApiReferenceSource {
    file: string;
    line: number;
    url: string;
}

export interface ApiReferenceSymbol {
    id: string;
    entryPoint: 'index' | 'testing' | 'devtools' | 'jsx-runtime' | 'jsx-dev-runtime';
    name: string;
    slug: string;
    route: string;
    kind: string;
    category: string;
    summary: string;
    remarks: string;
    examples: string[];
    throws: string[];
    defaultValue?: unknown;
    aliases: string[];
    type?: ApiReferenceTypePart[];
    enumValues?: unknown[];
    signatures: ApiReferenceSignature[];
    members: ApiReferenceMember[];
    source?: ApiReferenceSource;
    related: string[];
    control?: {
        nativeType: string;
        children: { model: string; minimum: number; maximum: number };
        propsType: string;
        handle: string;
        props: {
            name: string;
            type: string;
            documentation: string;
            required?: boolean;
            default?: unknown;
            enumValues?: unknown[];
        }[];
    };
}

export interface ApiReferenceCategory {
    id: string;
    slug: string;
    title: string;
    summary: string;
    route: string;
    symbolIds: string[];
}

export interface ApiReferenceCatalog {
    schemaVersion: number;
    package: {
        name: string;
        version: string;
        revision: string;
        sourceUrl: string;
    };
    descriptor: {
        schemaVersion: number;
        schemaHash: string;
    };
    metadata: {
        generatedAt: string;
        entryPoints: string[];
        excludedEntryPoints: string[];
        publicExportCount: number;
    };
    categories: ApiReferenceCategory[];
    symbols: ApiReferenceSymbol[];
}

export type ApiReferencePage =
    { kind: 'landing'; route: string } |
    { kind: 'package'; route: string } |
    { kind: 'category'; route: string; category: ApiReferenceCategory } |
    { kind: 'symbol'; route: string; symbol: ApiReferenceSymbol };

export interface ApiSearchIndex {
    schemaVersion: number;
    package: string;
    version: string;
    symbols: {
        id: string;
        name: string;
        aliases: string[];
        category: string;
        summary: string;
        kind: string;
        route: string;
    }[];
}

function fail(message: string): never {
    throw new Error('Invalid API reference catalog: ' + message);
}

export function loadApiReferenceCatalog(file: string): ApiReferenceCatalog {
    if (!fs.existsSync(file))
        fail('catalog is missing; run npm run generate:api before generating the site');
    const catalog: any = JSON.parse(String(fs.readFileSync(file, 'utf8')));
    if (catalog.schemaVersion !== 1) fail('unsupported schema version');
    if (catalog.package?.name !== '@sharpts/gui') fail('unexpected package metadata');
    if (!/^[0-9a-f]{40}$/.test(catalog.package.revision)) fail('malformed SharpTS revision');
    if (!/^[0-9a-f]{64}$/.test(catalog.descriptor.schemaHash)) fail('malformed descriptor hash');
    if (catalog.symbols.length !== catalog.metadata.publicExportCount) fail('public export count does not match');
    const ids: { [id: string]: boolean } = {};
    const routes: { [route: string]: boolean } = {};
    for (const symbol of catalog.symbols) {
        if (!symbol.id || ids[symbol.id]) fail('duplicate or empty symbol id ' + symbol.id);
        if (!symbol.route.startsWith('/docs/api/gui/') || routes[symbol.route])
            fail('duplicate or invalid symbol route ' + symbol.route);
        if (!symbol.name || !symbol.summary) fail('undocumented symbol ' + symbol.id);
        ids[symbol.id] = true;
        routes[symbol.route] = true;
    }
    for (const category of catalog.categories) {
        if (!category.route.startsWith('/docs/api/gui/')) fail('invalid category route ' + category.route);
        if (routes[category.route]) fail('category and symbol route collision ' + category.route);
        routes[category.route] = true;
        for (const id of category.symbolIds) if (!ids[id]) fail('unknown category symbol ' + id);
    }
    for (const symbol of catalog.symbols)
        for (const id of symbol.related) if (!ids[id]) fail('unknown related symbol ' + id);
    return catalog;
}

export function apiReferencePages(catalog: any): any[] {
    const pages: any[] = [
        { kind: 'landing', route: '/docs/api' },
        { kind: 'package', route: '/docs/api/gui' }
    ];
    for (const category of catalog.categories)
        pages.push({ kind: 'category', route: category.route, category });
    for (const symbol of catalog.symbols)
        pages.push({ kind: 'symbol', route: symbol.route, symbol });
    return pages as any;
}

export function createApiSearchIndex(catalog: any): ApiSearchIndex {
    const categoryTitles: { [id: string]: string } = {};
    for (const category of catalog.categories) categoryTitles[category.id] = category.title;
    const symbols: any[] = [];
    for (const symbol of catalog.symbols) {
        symbols.push({
            id: symbol.id,
            name: symbol.name,
            aliases: symbol.aliases,
            category: categoryTitles[symbol.category] || symbol.category,
            summary: symbol.summary,
            kind: symbol.kind,
            route: symbol.route
        });
    }
    return {
        schemaVersion: 1,
        package: catalog.package.name,
        version: catalog.package.version,
        symbols: symbols as any
    };
}
