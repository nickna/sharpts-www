export interface CultureInfo {
    code: string;
    displayName: string;
    openGraphLocale: string;
}

export interface MessageCatalog {
    [key: string]: string | MessageCatalog;
}

export interface Locale {
    culture: CultureInfo;
    messages: { [catalog: string]: MessageCatalog };
}

export type PageKind = 'home' | 'guide' | 'conformance';

export interface DocumentationRoute {
    page: 'docs';
    slug: string;
}

export interface GeneratedRoute {
    culture: string;
    page: PageKind | 'docs' | 'api';
    slug?: string;
    route: string;
    file: string;
}

export interface BrowserAssets {
    script: string;
    style: string;
    conformanceScript: string;
    docsScript: string;
    siteStyle: string;
    files: string[];
}

export const siteOrigin = 'https://sharpts.dev';

export const cultures: CultureInfo[] = [
    { code: 'en', displayName: 'English', openGraphLocale: 'en_US' },
    { code: 'zh-Hans', displayName: '简体中文', openGraphLocale: 'zh_CN' },
    { code: 'fr', displayName: 'Français', openGraphLocale: 'fr_FR' },
    { code: 'es', displayName: 'Español', openGraphLocale: 'es_ES' },
    { code: 'de', displayName: 'Deutsch', openGraphLocale: 'de_DE' }
];

export const pageKinds: PageKind[] = ['home', 'guide', 'conformance'];

export const catalogNames = ['common', 'home', 'how-it-works', 'conformance'];
