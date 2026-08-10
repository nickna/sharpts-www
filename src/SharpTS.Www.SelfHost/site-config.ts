import * as path from 'path';

export interface SitePaths {
    repoRoot: string;
    localeRoot: string;
    stylesRoot: string;
    staticRoot: string;
    docsRoot: string;
    apiCatalog: string;
    browserRoot: string;
    outputRoot: string;
}

export function loadSitePaths(): SitePaths {
    const repoRoot = path.resolve(process.env.SHARPTS_WWW_SITE_REPO_ROOT || process.cwd());
    const sourceRoot = path.join(repoRoot, 'src', 'SharpTS.Www.SelfHost');
    return {
        repoRoot,
        localeRoot: path.join(sourceRoot, 'locales'),
        stylesRoot: path.join(sourceRoot, 'styles'),
        staticRoot: path.join(sourceRoot, 'static'),
        docsRoot: path.join(sourceRoot, 'docs'),
        apiCatalog: path.resolve(process.env.SHARPTS_WWW_API_CATALOG ||
            path.join(repoRoot, 'artifacts', 'api-reference', 'catalog.json')),
        browserRoot: path.resolve(process.env.SHARPTS_WWW_BROWSER_OUTPUT ||
            path.join(repoRoot, 'artifacts', 'browser-assets')),
        outputRoot: path.resolve(process.env.SHARPTS_WWW_SITE_OUTPUT ||
            path.join(repoRoot, 'artifacts', 'generated-site'))
    };
}
