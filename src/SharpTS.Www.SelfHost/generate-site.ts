import { loadConformanceData } from './conformance-data';
import { buildSite } from './site-build';
import { loadSitePaths } from './site-config';
import { renderApiReferenceDocument, renderDocument, renderDocumentationDocument } from './site-renderers';
import { loadPerformanceData } from './performance-data';

const repoRoot = loadSitePaths().repoRoot;
const conformance = loadConformanceData(repoRoot);
const performance = loadPerformanceData(repoRoot);
buildSite(
    (locale, page, assets) => renderDocument(locale, page, assets, conformance, performance),
    renderDocumentationDocument,
    renderApiReferenceDocument,
    conformance,
    performance
);
