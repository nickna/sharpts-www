import { loadConformanceData } from './conformance-data';
import { buildSite } from './site-build';
import { loadSitePaths } from './site-config';
import { renderApiReferenceDocument, renderDocument, renderDocumentationDocument } from './site-renderers';

const conformance = loadConformanceData(loadSitePaths().repoRoot);
buildSite(
    (locale, page, assets) => renderDocument(locale, page, assets, conformance),
    renderDocumentationDocument,
    renderApiReferenceDocument,
    conformance
);
