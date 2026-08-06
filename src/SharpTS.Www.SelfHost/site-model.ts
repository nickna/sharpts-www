export interface CultureInfo {
    code: string;
    displayName: string;
    openGraphLocale: string;
}

export interface Locale {
    culture: CultureInfo;
    bundles: { [bundle: string]: { [key: string]: string } };
}

export type PageKind = 'home' | 'guide';

export interface GeneratedRoute {
    culture: string;
    page: PageKind;
    route: string;
    file: string;
}

export interface BrowserAssets {
    script: string;
    style: string;
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

export const pageKinds: PageKind[] = ['home', 'guide'];

export const bundleNames = [
    'Components.App',
    'Components.Pages.HowItWorks',
    'Components.Sections.ArchitectureDiagram',
    'Components.Sections.FaqSection',
    'Components.Sections.FeatureComparison',
    'Components.Sections.FeaturesGrid',
    'Components.Sections.FooterSection',
    'Components.Sections.GettingStarted',
    'Components.Sections.HeroSection',
    'Components.Sections.LiveCodeExamples',
    'Components.Sections.NavHeader',
    'Components.Sections.PlaygroundSection',
    'Components.Sections.WhenItFits',
    'Components.Shared.CopyButton',
    'Components.Shared.LanguageSelector'
];
