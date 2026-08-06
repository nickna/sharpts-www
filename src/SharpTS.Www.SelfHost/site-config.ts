import * as path from 'path';

export interface SitePaths {
    repoRoot: string;
    localeRoot: string;
    stylesRoot: string;
    staticRoot: string;
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
        browserRoot: path.resolve(process.env.SHARPTS_WWW_BROWSER_OUTPUT ||
            path.join(repoRoot, 'artifacts', 'browser-assets')),
        outputRoot: path.resolve(process.env.SHARPTS_WWW_SITE_OUTPUT ||
            path.join(repoRoot, 'artifacts', 'generated-site'))
    };
}
