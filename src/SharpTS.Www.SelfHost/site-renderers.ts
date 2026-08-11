import { eligibleResults, passPercentage, totalResults } from './conformance-data';
import type { ConformanceData, ConformanceNode, ResultCounts } from './conformance-data';
import { escapeHtml, renderRichText } from './site-html';
import { t as lookupMessage, tf } from './i18n';
import { cultures, siteOrigin } from './site-model';
import type { BrowserAssets, Locale, PageKind } from './site-model';
import { docsRoutePath, routePath } from './site-paths';
import { showcaseExamples } from './showcase-data';
import { presets } from './presets';
import type { LoadedDocumentation, LoadedDocumentationArticle } from './documentation';
import { documentationSections } from './docs-manifest';
import { renderCopyButton } from './site-components';
import { composeCode, heroCodeBody, playgroundCodeBody } from './code-samples';

function messageKey(key: string): string {
    const parts = key.split('_');
    if (parts[0] === 'Nav') parts[0] = 'Navigation';
    if (parts[0] === 'Meta') parts[0] = 'Metadata';
    return parts.map(part => part === 'ILCompiler'
        ? 'ilCompiler'
        : part.charAt(0).toLowerCase() + part.slice(1)).join('.');
}

function t(locale: Locale, section: string, key: string): string {
    return lookupMessage(locale, section + '.' + messageKey(key));
}

const githubIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

function copyButton(locale: Locale): string {
    return renderCopyButton({
        copy: t(locale, 'common.copyButton', 'Copy'),
        copied: t(locale, 'common.copyButton', 'Copied')
    });
}

function codeBlock(locale: Locale, title: string, language: string, code: string): string {
    return `<div class="code-block">
  <div class="code-block__header"><span>${escapeHtml(title)}</span>${copyButton(locale)}</div>
  <div class="code-block__content"><pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre></div>
</div>`;
}

function installerSelector(locale: Locale, id: string, className: string = ''): string {
    const label = escapeHtml(t(locale, 'home.gettingStarted', 'Step1_Title'));
    const definitions: Array<{ kind: string; title: string; prompt: string; language: string; command: string }> = [
        {
            kind: 'shell',
            title: 'Shell',
            prompt: '$',
            language: 'bash',
            command: 'curl -fsSL https://sharpts.dev/setup.sh | sh'
        },
        {
            kind: 'powershell',
            title: 'PowerShell',
            prompt: 'PS&gt;',
            language: 'powershell',
            command: 'irm https://sharpts.dev/setup.ps1 | iex'
        }
    ];
    const tabs: string[] = [];
    const panels: string[] = [];
    for (let index = 0; index < definitions.length; index++) {
        const definition = definitions[index];
        const active = index === 0;
        tabs.push(`<button type="button" id="${id}-${definition.kind}-tab" class="tab installer-selector__tab${active ? ' active' : ''}" role="tab" data-installer-tab="${definition.kind}" aria-controls="${id}-${definition.kind}-panel" aria-selected="${active}" tabindex="${active ? '0' : '-1'}">${definition.title}</button>`);
        panels.push(`<div id="${id}-${definition.kind}-panel" class="installer-selector__panel" role="tabpanel" aria-labelledby="${id}-${definition.kind}-tab" data-installer-panel="${definition.kind}"${active ? '' : ' hidden'}><span class="installer-selector__prompt" aria-hidden="true">${definition.prompt}</span><code class="installer-selector__command language-${definition.language}" tabindex="0">${escapeHtml(definition.command)}</code>${copyButton(locale)}</div>`);
    }
    return `<div class="installer-selector${className}" data-installer-selector><div class="tabs installer-selector__tabs" role="tablist" aria-label="${label}">${tabs.join('\n')}</div>${panels.join('\n')}</div>`;
}

function languageSelector(locale: Locale, page: PageKind): string {
    const languageBundle = 'common.languageSelector';
    const label = escapeHtml(t(locale, languageBundle, 'ChangeLanguage'));
    const items = cultures.map(culture => {
        const active = culture.code === locale.culture.code;
        const check = active
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '';
        return `<li role="option" aria-selected="${active}"><a class="lang-selector__item${active ? ' lang-selector__item--active' : ''}" href="${routePath(culture, page)}" hreflang="${culture.code}"><span class="lang-selector__check" aria-hidden="true">${check}</span>${escapeHtml(culture.displayName)}</a></li>`;
    }).join('\n');

    return `<details class="lang-selector">
  <summary class="lang-selector__button" title="${label}" aria-label="${label}">
    <svg class="lang-selector__globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
    <span class="lang-selector__current">${escapeHtml(locale.culture.displayName)}</span>
    <svg class="lang-selector__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
  </summary>
  <ul class="lang-selector__menu" role="listbox" aria-label="${label}">${items}</ul>
</details>`;
}

function renderNav(locale: Locale, page: PageKind | 'docs'): string {
    const bundle = 'common';
    const home = routePath(locale.culture, 'home');
    const guide = routePath(locale.culture, 'guide');
    const conformance = routePath(locale.culture, 'conformance');
    return `<header class="nav" data-nav>
  <div class="container nav__inner">
    <a href="${home}" class="nav__logo"><img src="/img/sharpts-logo.png" alt="SharpTS logo" class="nav__logo-icon" width="32" height="32"><span class="nav__logo-text">SharpTS</span></a>
    <nav class="nav__links" data-nav-links>
      <a href="${home}#features" class="nav__link">${escapeHtml(t(locale, bundle, 'Nav_Features'))}</a>
      <a href="${home}#examples" class="nav__link">${escapeHtml(t(locale, bundle, 'Nav_Examples'))}</a>
      <a href="${guide}" class="nav__link"${page === 'guide' ? ' aria-current="page"' : ''}>${escapeHtml(t(locale, bundle, 'Nav_HowItWorks'))}</a>
      <a href="${conformance}" class="nav__link"${page === 'conformance' ? ' aria-current="page"' : ''}>${escapeHtml(t(locale, bundle, 'Nav_Conformance'))}</a>
      <a href="${home}#playground" class="nav__link">${escapeHtml(t(locale, bundle, 'Nav_Playground'))}</a>
      <a href="/docs" class="nav__link"${page === 'docs' ? ' aria-current="page"' : ''}>${escapeHtml(t(locale, bundle, 'Nav_Documentation'))}</a>
      <a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener" class="nav__link nav__link--github" aria-label="GitHub">${githubIcon}</a>
      ${page === 'docs' ? '' : languageSelector(locale, page)}
    </nav>
    <button type="button" class="nav__hamburger" data-nav-toggle aria-expanded="false" aria-label="${escapeHtml(t(locale, bundle, 'Nav_ToggleAriaLabel'))}"><span></span><span></span><span></span></button>
  </div>
</header>`;
}

function renderFooter(locale: Locale): string {
    const bundle = 'common.footer';
    const home = routePath(locale.culture, 'home');
    return `<footer class="footer">
  <div class="footer__gradient-border"></div>
  <div class="container footer__inner">
    <div class="footer__top">
      <div class="footer__brand"><a href="${home}" class="footer__logo-link"><span class="footer__logo-name">SharpTS</span></a><p class="footer__tagline">${escapeHtml(t(locale, bundle, 'Tagline'))}</p></div>
      <div class="footer__links">
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_Resources'))}</h4><a href="/docs">${escapeHtml(t(locale, bundle, 'Link_Documentation'))}</a><a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener">GitHub</a><a href="https://www.nuget.org/packages/SharpTS" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_NuGet'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/STATUS.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Status'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/ARCHITECTURE.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Architecture'))}</a></div>
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_Community'))}</h4><a href="https://github.com/nickna/SharpTS/issues" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_ReportIssue'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Contributing'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/LICENSE" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_License'))}</a></div>
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_OnThisPage'))}</h4><a href="${home}#features">${escapeHtml(t(locale, bundle, 'Link_Features'))}</a><a href="${home}#examples">${escapeHtml(t(locale, bundle, 'Link_CodeExamples'))}</a><a href="${home}#use-cases">${escapeHtml(t(locale, bundle, 'Link_UseCases'))}</a><a href="${home}#playground">${escapeHtml(t(locale, bundle, 'Link_Playground'))}</a><a href="${home}#faq">${escapeHtml(t(locale, bundle, 'Link_Faq'))}</a><a href="/docs">${escapeHtml(t(locale, bundle, 'Link_Documentation'))}</a></div>
      </div>
    </div>
    <div class="footer__bottom"><p>&copy; 2026 <a href="https://github.com/nickna" target="_blank" rel="noopener">Nick Nassiri</a>.</p><p>${escapeHtml(t(locale, bundle, 'BuiltWith'))}</p></div>
  </div>
</footer>`;
}

function renderHero(locale: Locale): string {
    const bundle = 'home';
    const heroCode = composeCode(t(locale, bundle, 'Hero_CodeComment'), heroCodeBody);
    return `<section class="hero" id="hero">
  <div class="hero__orb hero__orb--1"></div><div class="hero__orb hero__orb--2"></div><div class="hero__orb hero__orb--3"></div>
  <canvas id="hero-particles" class="hero__particles" aria-hidden="true"></canvas><div class="hero__grid"></div>
  <div class="container hero__inner">
    <div class="hero__badge hero-enter hero-enter--1"><span class="hero__badge-dot"></span>${escapeHtml(t(locale, bundle, 'Hero_Badge'))}</div>
    <h1 class="hero__title hero-enter hero-enter--2"><span class="gradient-text">SharpTS</span></h1>
    <p class="hero__tagline hero-enter hero-enter--3">${escapeHtml(t(locale, bundle, 'Hero_Tagline'))}</p>
    <p class="hero__subtagline hero-enter hero-enter--4">${escapeHtml(t(locale, bundle, 'Hero_Subtagline'))}</p>
    <div class="hero__ctas hero-enter hero-enter--5">
      ${installerSelector(locale, 'hero-installer', ' installer-selector--hero')}
      <a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener" class="btn btn-secondary btn--glow">${githubIcon}${escapeHtml(t(locale, bundle, 'Hero_StarOnGitHub'))}</a>
    </div>
    <div class="hero__code hero-enter hero-enter--6"><div class="code-block hero__code-block"><div class="code-block__header"><div class="hero__code-dots"><span class="hero__code-dot hero__code-dot--red"></span><span class="hero__code-dot hero__code-dot--yellow"></span><span class="hero__code-dot hero__code-dot--green"></span></div><span>example.ts</span>${copyButton(locale)}</div><div class="code-block__content"><pre><code id="hero-typed-code" class="language-typescript">${escapeHtml(heroCode)}</code></pre></div></div></div>
  </div>
</section>`;
}

interface FeatureCardDefinition {
    key: string;
    color: string;
    icon: string;
}

const featureCards: FeatureCardDefinition[] = [
    { key: 'Card1', color: '--accent-green', icon: '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>' },
    { key: 'Card2', color: '--accent-csharp', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path>' },
    { key: 'Card3', color: '--accent-neon', icon: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>' },
    { key: 'Card4', color: '--accent-ts', icon: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>' },
    { key: 'Card5', color: '--accent-yellow', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>' },
    { key: 'Card6', color: '--accent-green', icon: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>' }
];

function renderFeatures(locale: Locale): string {
    const bundle = 'home.features';
    const cards = featureCards.map(card => `<div class="card feature-card reveal"><div class="feature-card__icon" style="color:var(${card.color})"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${card.icon}</svg></div><h3 class="feature-card__title">${escapeHtml(t(locale, bundle, card.key + '_Title'))}</h3><p class="feature-card__desc">${renderRichText(t(locale, bundle, card.key + '_Desc'))}</p></div>`);
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="features-grid">${cards.join('\n')}</div></div></section>`;
}

function renderExamples(locale: Locale): string {
    const bundle = 'home.examples';
    const tabs: string[] = [];
    const panels: string[] = [];
    for (let index = 1; index <= showcaseExamples.length; index++) {
        const active = index === 1;
        tabs.push(`<button type="button" id="example-tab-${index}" class="tab${active ? ' active' : ''}" role="tab" data-example-tab="${index}" aria-controls="example-panel-${index}" aria-selected="${active}" tabindex="${active ? '0' : '-1'}">${escapeHtml(t(locale, bundle, 'Ex' + index + '_Title'))}</button>`);
        panels.push(`<div id="example-panel-${index}" class="examples__body examples__panel" role="tabpanel" aria-labelledby="example-tab-${index}" data-example-panel="${index}"${active ? '' : ' hidden'}><div class="examples__code"><div class="code-block__content"><pre><code class="language-typescript">${escapeHtml(showcaseExamples[index - 1].source)}</code></pre></div></div><div class="examples__output"><div class="code-block__header"><span>${escapeHtml(t(locale, bundle, 'Output'))}</span></div><div class="code-block__content"><pre class="examples__output-text">${escapeHtml(showcaseExamples[index - 1].expectedOutput)}</pre></div></div></div>`);
    }
    return `<section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="examples reveal" data-examples><div class="tabs" role="tablist">${tabs.join('\n')}</div>${panels.join('\n')}</div><p class="examples__cta reveal"><a href="#playground">${escapeHtml(t(locale, bundle, 'Cta_TryYourOwn'))}</a></p></div></section>`;
}

interface UseCaseDefinition {
    key: string;
    title: string | null;
    language: string;
    code: string;
}

const useCases: UseCaseDefinition[] = [
    { key: 'Case1', title: null, language: 'bash', code: 'sharpts rotate-logs.ts' },
    { key: 'Case2', title: null, language: 'bash', code: 'sharpts --compile pricing.ts --ref-asm\nsharpts --compile pricing.ts --pack' },
    { key: 'Case3', title: 'app.csproj', language: 'xml', code: '<Project Sdk="SharpTS.Sdk/1.0.0">\n  <PropertyGroup>\n    <TargetFramework>net10.0</TargetFramework>\n    <SharpTSEntryPoint>src/main.ts</SharpTSEntryPoint>\n  </PropertyGroup>\n</Project>' },
    { key: 'Case4', title: null, language: 'bash', code: 'sharpts --compile tool.ts -t exe\n./tool' }
];

function renderUseCases(locale: Locale): string {
    const bundle = 'home.useCases';
    const cards = useCases.map(useCase => `<div class="card usecase-card reveal"><h3 class="usecase-card__title">${escapeHtml(t(locale, bundle, useCase.key + '_Title'))}</h3><p class="usecase-card__desc">${renderRichText(t(locale, bundle, useCase.key + '_Desc'))}</p>${codeBlock(locale, useCase.title || t(locale, bundle, 'Terminal'), useCase.language, useCase.code)}</div>`);
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="usecase-grid">${cards.join('\n')}</div></div></section>`;
}

function renderArchitecturePreview(locale: Locale): string {
    const bundle = 'how-it-works.architecture';
    const node = (key: string, className: string = ''): string =>
        `<span class="arch-preview__node${className}">${escapeHtml(t(locale, bundle, key))}</span>`;
    return `<section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="arch-preview reveal"><div class="arch-preview__flow">${node('Label_Source')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Lexer')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Parser')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_TypeChecker', ' arch-preview__node--accent')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Interpreter', ' arch-preview__node--interpret')}<span class="arch-preview__sep arch-preview__sep--or" aria-hidden="true">/</span>${node('Label_ILCompiler', ' arch-preview__node--compile')}</div><a href="${routePath(locale.culture, 'guide')}" class="btn btn-primary arch-preview__cta">${escapeHtml(t(locale, bundle, 'Cta_LearnMore'))}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></a></div></div></section>`;
}

const playgroundTimingPhases = [
    ['tokenize', 'Tokenize'],
    ['parse', 'Parse'],
    ['validate-modules', 'ValidateModules'],
    ['type-check', 'TypeCheck'],
    ['prepare-interpreter', 'PrepareInterpreter'],
    // Retained for rolling deployments and responses from older workers.
    ['compile', 'Compile'],
    ['analyze-dead-code', 'AnalyzeDeadCode'],
    ['initialize-compiler', 'InitializeCompiler'],
    ['prepare-compilation', 'PrepareCompilation'],
    ['extract-namespaces', 'ExtractNamespaces'],
    ['emit-runtime-types', 'EmitRuntimeTypes'],
    ['analyze-closures', 'AnalyzeClosures'],
    ['define-program-structure', 'DefineProgramStructure'],
    ['analyze-module-bindings', 'AnalyzeModuleBindings'],
    ['define-declarations', 'DefineDeclarations'],
    ['collect-functions', 'CollectFunctions'],
    ['emit-function-bodies', 'EmitFunctionBodies'],
    ['emit-method-bodies', 'EmitMethodBodies'],
    ['emit-entry-point', 'EmitEntryPoint'],
    ['finalize-types', 'FinalizeTypes'],
    ['serialize-assembly', 'SerializeAssembly'],
    ['load', 'Load'],
    ['execute', 'Execute']
] as const;

function renderPlayground(locale: Locale): string {
    const bundle = 'home.playground';
    const defaultCode = composeCode(t(locale, bundle, 'IntroComment') + '\n', playgroundCodeBody);
    const options = presets.map(preset => `<option value="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</option>`).join('\n');
    const timingData: Array<{ attribute: string; key: string }> = [
        { attribute: 'timing-headline', key: 'TimingHeadline' },
        { attribute: 'timing-failed-headline', key: 'TimingFailedHeadline' },
        { attribute: 'timing-sharp-ts-pipeline', key: 'TimingSharpTSPipeline' },
        { attribute: 'timing-end-to-end', key: 'TimingEndToEnd' },
        { attribute: 'timing-status-completed', key: 'TimingStatusCompleted' },
        { attribute: 'timing-status-failed', key: 'TimingStatusFailed' }
    ];
    for (const [attribute, key] of playgroundTimingPhases) {
        timingData.push(
            { attribute: `phase-${attribute}-name`, key: `TimingPhase${key}Name` },
            { attribute: `phase-${attribute}-description`, key: `TimingPhase${key}Description` });
    }
    const timingAttributes = timingData
        .map(item => `data-${item.attribute}="${escapeHtml(t(locale, bundle, item.key))}"`)
        .join(' ');
    return `<section class="section" id="playground"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="playground reveal" data-playground data-running="false" data-placeholder="${escapeHtml(t(locale, bundle, 'Placeholder'))}" data-request-failed="${escapeHtml(t(locale, bundle, 'RequestFailed'))}" data-invalid-response="${escapeHtml(t(locale, bundle, 'InvalidResponse'))}" ${timingAttributes}>
  <div class="playground__toolbar"><div class="playground__toolbar-left"><select class="playground__preset" data-playground-preset aria-label="${escapeHtml(t(locale, bundle, 'SelectPreset'))}"><option value="">${escapeHtml(t(locale, bundle, 'SelectPreset'))}</option>${options}</select><div class="playground__mode" role="group" aria-label="${escapeHtml(t(locale, bundle, 'ModeLabel'))}"><button type="button" class="playground__mode-btn playground__mode-btn--active" data-playground-mode="interpret" aria-pressed="true">${escapeHtml(t(locale, bundle, 'ModeInterpret'))}</button><button type="button" class="playground__mode-btn" data-playground-mode="compile" aria-pressed="false">${escapeHtml(t(locale, bundle, 'ModeCompile'))}</button></div></div><div class="playground__toolbar-right"><button type="button" class="btn btn-sm btn-secondary" data-playground-clear>${escapeHtml(t(locale, bundle, 'Clear'))}</button><button type="button" id="playground-run-btn" class="btn btn-sm btn-primary" data-playground-run aria-busy="false"><span class="playground__spinner" aria-hidden="true"></span><span class="playground__run-label--idle">${escapeHtml(t(locale, bundle, 'Run'))}</span><span class="playground__run-label--running">${escapeHtml(t(locale, bundle, 'Running'))}</span><kbd class="playground__kbd">${escapeHtml(t(locale, bundle, 'RunShortcut'))}</kbd></button></div></div>
  <div class="playground__body"><div class="playground__editor"><div id="playground-editor" class="playground__cm-container"><textarea class="playground__fallback-editor" data-playground-editor spellcheck="false" aria-label="TypeScript source">${escapeHtml(defaultCode)}</textarea></div></div><div class="playground__output"><div class="playground__output-header"><span>${escapeHtml(t(locale, bundle, 'Output'))}</span><button type="button" class="playground__timing" data-playground-timing data-timing-compiled="${escapeHtml(t(locale, bundle, 'TimingCompiled'))}" data-timing-executed="${escapeHtml(t(locale, bundle, 'TimingExecuted'))}" aria-label="${escapeHtml(t(locale, bundle, 'TimingJourneyLabel'))}" aria-expanded="false" aria-controls="playground-timing-details" hidden><span data-playground-timing-headline></span><span class="playground__timing-chevron" aria-hidden="true">▾</span></button></div><div id="playground-timing-details" class="playground__timing-details" data-playground-timing-details hidden><div class="playground__timing-phases" data-playground-timing-phases role="group" aria-label="${escapeHtml(t(locale, bundle, 'TimingJourneyLabel'))}"></div><p class="playground__timing-description" data-playground-timing-description aria-live="polite"></p><p class="playground__timing-summary"><span data-playground-timing-pipeline></span><span data-playground-timing-total></span></p></div><div class="playground__output-body" data-playground-output role="status" aria-live="polite"><span class="playground__placeholder">${escapeHtml(t(locale, bundle, 'Placeholder'))}</span></div></div></div>
</div></div></section>`;
}

function renderSupportOverview(locale: Locale): string {
    const bundle = 'home.support';
    const cards = ['EverydayTypeScript', 'StandardRuntime', 'PackagesNode', 'KnownLimitations']
        .map(key => `<article class="card support-card"><h3 class="support-card__title">${escapeHtml(t(locale, bundle, `Card_${key}_Title`))}</h3><p class="support-card__body">${escapeHtml(t(locale, bundle, `Card_${key}_Body`))}</p></article>`)
        .join('\n');
    return `<section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="support-overview reveal">${cards}</div><div class="support-overview__actions reveal"><a class="btn btn-primary" href="${routePath(locale.culture, 'conformance')}">${escapeHtml(t(locale, bundle, 'Link_Conformance'))}</a><a class="btn btn-secondary" href="https://github.com/nickna/SharpTS/blob/main/STATUS-NODE.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_NodeStatus'))}</a></div></div></section>`;
}

function renderFaq(locale: Locale): string {
    const bundle = 'home.faq';
    const items: string[] = [];
    for (let index = 1; index <= 5; index++) {
        let link = '';
        if (index === 3)
            link = `<a href="https://github.com/nickna/SharpTS/blob/main/STATUS-NODE.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_NodeStatus'))}</a>`;
        else if (index === 5)
            link = `<a href="https://github.com/nickna/SharpTS/blob/main/STATUS.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Status'))}</a>`;
        items.push(`<details class="card faq__item"><summary class="faq__question"><span>${escapeHtml(t(locale, bundle, 'Q' + index))}</span><span class="faq__chevron" aria-hidden="true">▾</span></summary><div class="faq__answer"><p>${escapeHtml(t(locale, bundle, 'A' + index))}</p>${link}</div></details>`);
    }
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="faq reveal">${items.join('\n')}</div></div></section>`;
}

const gettingStartedWriteCode = [
    'interface Config {',
    '    name: string;',
    '    debug: boolean;',
    '}',
    '',
    'const config: Config = { name: "MyApp", debug: true };',
    'console.log(`Starting ${config.name}...`);'
].join('\n');

function renderGettingStarted(locale: Locale): string {
    const bundle = 'home.gettingStarted';
    const codes = [gettingStartedWriteCode, t(locale, bundle, 'RunCode')];
    const titles = ['hello.ts', t(locale, bundle, 'Terminal')];
    const languages = ['typescript', 'bash'];
    const steps: string[] = [];
    for (let index = 1; index <= 3; index++) {
        const content = index === 1
            ? installerSelector(locale, 'getting-started-installer', ' installer-selector--getting-started')
            : codeBlock(locale, titles[index - 2], languages[index - 2], codes[index - 2]);
        steps.push(`<div class="gs-step"><div class="gs-step__number">${index}</div><div class="gs-step__content"><h3 class="gs-step__title">${escapeHtml(t(locale, bundle, 'Step' + index + '_Title'))}</h3><p class="gs-step__desc">${escapeHtml(t(locale, bundle, 'Step' + index + '_Desc'))}</p>${content}</div></div>`);
    }
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="getting-started reveal">${steps.join('\n')}</div></div></section>`;
}

export function renderHome(locale: Locale): string {
    return `<main class="landing">${renderHero(locale)}<div id="features">${renderFeatures(locale)}</div><div id="examples">${renderExamples(locale)}</div><div id="use-cases">${renderUseCases(locale)}</div><div id="architecture">${renderArchitecturePreview(locale)}</div>${renderPlayground(locale)}<div id="support">${renderSupportOverview(locale)}</div><div id="faq">${renderFaq(locale)}</div><div id="get-started">${renderGettingStarted(locale)}</div>${renderFooter(locale)}</main>`;
}

const architectureStages = ['Lexer', 'Parser', 'TypeChecker', 'Interpreter', 'ILCompiler'];

function architectureButton(locale: Locale, stage: string, modifier: string, icon: string): string {
    const bundle = 'how-it-works.architecture';
    return `<button type="button" class="pipeline__box${modifier}" data-architecture-stage="${stage}" aria-pressed="false"><span class="pipeline__icon" aria-hidden="true">${icon}</span><span class="pipeline__label">${escapeHtml(t(locale, bundle, 'Label_' + stage))}</span><span class="pipeline__detail">${escapeHtml(t(locale, bundle, 'Detail_' + stage))}</span></button>`;
}

function renderArchitectureDiagram(locale: Locale): string {
    const bundle = 'how-it-works.architecture';
    const explanations = architectureStages.map(stage => `<div class="pipeline__detail-content" data-architecture-detail="${stage}" hidden><h3 class="pipeline__detail-title">${escapeHtml(t(locale, bundle, 'Label_' + stage))}</h3><p class="pipeline__detail-body">${escapeHtml(t(locale, bundle, 'Explain_' + stage))}</p></div>`).join('\n');
    return `<section class="section"><div class="container"><h1 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h1><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="architecture reveal" data-architecture>
  <div class="pipeline"><div class="pipeline__step"><div class="pipeline__box pipeline__box--input"><span class="pipeline__icon" aria-hidden="true">📄</span><span class="pipeline__label">${escapeHtml(t(locale, bundle, 'Label_Source'))}</span></div><div class="pipeline__arrow"></div></div><div class="pipeline__step">${architectureButton(locale, 'Lexer', '', '🔤')}<div class="pipeline__arrow"></div></div><div class="pipeline__step">${architectureButton(locale, 'Parser', '', '🌳')}<div class="pipeline__arrow"></div></div><div class="pipeline__step">${architectureButton(locale, 'TypeChecker', ' pipeline__box--accent', '🔍')}<div class="pipeline__arrow pipeline__arrow--fork"></div></div></div>
  <div class="pipeline__branches"><div class="pipeline__branch"><div class="pipeline__branch-arrow pipeline__branch-arrow--top"></div>${architectureButton(locale, 'Interpreter', ' pipeline__box--interpret', '▶️')}<div class="pipeline__arrow"></div><div class="pipeline__box pipeline__box--output"><span class="pipeline__label">${escapeHtml(t(locale, bundle, 'Label_Output'))}</span></div></div><div class="pipeline__branch"><div class="pipeline__branch-arrow pipeline__branch-arrow--bottom"></div>${architectureButton(locale, 'ILCompiler', ' pipeline__box--compile', '⚙️')}<div class="pipeline__arrow"></div><div class="pipeline__box pipeline__box--output"><span class="pipeline__label">${escapeHtml(t(locale, bundle, 'Label_DotNetAssembly'))}</span></div></div></div>
  <div class="pipeline__detail-panel" role="region" aria-live="polite"><p class="pipeline__detail-hint" data-architecture-hint>${escapeHtml(t(locale, bundle, 'SelectHint'))}</p>${explanations}</div>
</div></div></section>`;
}

const compileCommand = 'sharpts --compile script.ts\ndotnet script.dll';
const typingExample = 'interface Walkable { walk(): void }\nclass Dog { walk(): void {} }\n\nlet w: Walkable = new Dog();';
const dotNetExample = [
    '@DotNetType("System.Text.StringBuilder")',
    'declare class StringBuilder {',
    '    constructor();',
    '    append(value: string): StringBuilder;',
    '    toString(): string;',
    '}',
    '',
    'const sb = new StringBuilder();',
    'sb.append("Hello from .NET!");',
    'console.log(sb.toString());'
].join('\n');

export function renderGuide(locale: Locale): string {
    const bundle = 'how-it-works';
    const capabilities = [
        ['🔌', 'Cap1_Title', 'Cap1_Body'], ['🤝', 'Cap2_Title', 'Cap2_Body'],
        ['📦', 'Cap3_Title', 'Cap3_Body'], ['🛠️', 'Cap4_Title', 'Cap4_Body'],
        ['💡', 'Cap5_Title', 'Cap5_Body']
    ];
    const capabilityCards = capabilities.map(capability => `<div class="card capability-card reveal"><span class="capability-card__icon" aria-hidden="true">${capability[0]}</span><h3 class="capability-card__title">${escapeHtml(t(locale, bundle, capability[1]))}</h3><p class="capability-card__body">${escapeHtml(t(locale, bundle, capability[2]))}</p></div>`).join('\n');
    const home = routePath(locale.culture, 'home');
    return `<main class="landing">${renderArchitectureDiagram(locale)}
  <section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Modes_Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Modes_Subtitle'))}</p><div class="modes reveal"><div class="card mode-card"><span class="mode-card__icon" aria-hidden="true">▶️</span><h3 class="mode-card__title">${escapeHtml(t(locale, bundle, 'Mode_Interpret_Title'))}</h3><p class="mode-card__desc">${escapeHtml(t(locale, bundle, 'Mode_Interpret_Desc'))}</p>${codeBlock(locale, t(locale, bundle, 'Terminal'), 'bash', 'sharpts script.ts')}</div><div class="card mode-card"><span class="mode-card__icon" aria-hidden="true">⚙️</span><h3 class="mode-card__title">${escapeHtml(t(locale, bundle, 'Mode_Compile_Title'))}</h3><p class="mode-card__desc">${escapeHtml(t(locale, bundle, 'Mode_Compile_Desc'))}</p>${codeBlock(locale, t(locale, bundle, 'Terminal'), 'bash', compileCommand)}</div></div></div></section>
  <section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Typing_Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Typing_Subtitle'))}</p><div class="typing reveal"><div class="typing__cols"><div class="card typing-card"><h3 class="typing-card__title">${escapeHtml(t(locale, bundle, 'Typing_CompileTime_Title'))}</h3><p class="typing-card__desc">${escapeHtml(t(locale, bundle, 'Typing_CompileTime_Desc'))}</p></div><div class="typing__arrow" aria-hidden="true">→</div><div class="card typing-card"><h3 class="typing-card__title">${escapeHtml(t(locale, bundle, 'Typing_Runtime_Title'))}</h3><p class="typing-card__desc">${escapeHtml(t(locale, bundle, 'Typing_Runtime_Desc'))}</p></div></div><div class="typing__example">${codeBlock(locale, 'shapes.ts', 'typescript', typingExample)}<p class="typing__caption">${escapeHtml(t(locale, bundle, 'Typing_Caption'))}</p></div></div></div></section>
  <section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Dotnet_Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Dotnet_Subtitle'))}</p><div class="capability-grid">${capabilityCards}</div><div class="dotnet-example reveal">${codeBlock(locale, 'dotnet-interop.ts', 'typescript', dotNetExample)}</div><p class="matrix-link reveal"><a href="${home}#support">${escapeHtml(t(locale, bundle, 'Matrix_Link'))}</a></p></div></section>
  <section class="section"><div class="container"><div class="guide-cta reveal"><h2 class="guide-cta__title">${escapeHtml(t(locale, bundle, 'Cta_Title'))}</h2><p class="guide-cta__body">${escapeHtml(t(locale, bundle, 'Cta_Body'))}</p><div class="guide-cta__actions"><a href="${home}#playground" class="btn btn-primary">${escapeHtml(t(locale, bundle, 'Cta_Playground'))}</a><a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener" class="btn btn-secondary">${escapeHtml(t(locale, bundle, 'Cta_GitHub'))}</a></div></div></div></section>
  ${renderFooter(locale)}
</main>`;
}

function conformanceName(locale: Locale, node: ConformanceNode): string {
    return node.localizationKey
        ? t(locale, 'conformance', node.localizationKey)
        : node.name;
}

const conformanceBuckets: string[] = [
    'Pass', 'Fail', 'ParseError', 'TypeCheckError', 'RuntimeError', 'Timeout', 'HarnessError', 'Skipped'
];

function emptyConformanceCounts(): ResultCounts {
    return {
        Pass: 0,
        Fail: 0,
        RuntimeError: 0,
        ParseError: 0,
        TypeCheckError: 0,
        Timeout: 0,
        HarnessError: 0,
        Skipped: 0
    };
}

function sumConformanceCounts(nodes: ConformanceNode[], mode: 'interpreted' | 'compiled'): ResultCounts | null {
    const total = emptyConformanceCounts();
    let available = false;
    for (const node of nodes) {
        const counts = mode === 'interpreted' ? node.interpreted : node.compiled;
        if (!counts)
            continue;
        const actual = counts as ResultCounts;
        available = true;
        total.Pass += actual.Pass;
        total.Fail += actual.Fail;
        total.RuntimeError += actual.RuntimeError;
        total.ParseError += actual.ParseError;
        total.TypeCheckError += actual.TypeCheckError;
        total.Timeout += actual.Timeout;
        total.HarnessError += actual.HarnessError;
        total.Skipped += actual.Skipped;
    }
    return available ? total : null;
}

function conformanceBucketCount(counts: ResultCounts, bucket: string): number {
    if (bucket === 'Pass') return counts.Pass;
    if (bucket === 'Fail') return counts.Fail;
    if (bucket === 'RuntimeError') return counts.RuntimeError;
    if (bucket === 'ParseError') return counts.ParseError;
    if (bucket === 'TypeCheckError') return counts.TypeCheckError;
    if (bucket === 'Timeout') return counts.Timeout;
    if (bucket === 'HarnessError') return counts.HarnessError;
    return counts.Skipped;
}

function conformanceStatus(counts: ResultCounts | null): string {
    if (!counts || eligibleResults(counts) === 0)
        return 'no-eligible';
    if (counts.Pass === 0)
        return 'zero';
    return counts.Pass === eligibleResults(counts) ? 'passing' : 'partial';
}

function conformanceDataAttributes(mode: 'interpreted' | 'compiled', counts: ResultCounts | null): string {
    if (!counts)
        return ` data-${mode}-status="no-eligible"`;
    return ` data-${mode}-status="${conformanceStatus(counts)}" data-${mode}-pass="${counts.Pass}" data-${mode}-eligible="${eligibleResults(counts)}"`;
}

function renderConformanceBar(locale: Locale, counts: ResultCounts): string {
    const bundle = 'conformance';
    const eligible = eligibleResults(counts);
    const percentage = passPercentage(counts);
    const formattedPercentage = percentage.toFixed(1);
    const aria = tf(locale, 'conformance.barAria', {
        passed: counts.Pass,
        eligible,
        percentage: formattedPercentage
    });
    const total = totalResults(counts);
    const segmentValues: string[] = [];
    const outcomeDescriptions: string[] = [];
    for (const bucket of conformanceBuckets) {
        const count = conformanceBucketCount(counts, bucket);
        if (count === 0)
            continue;
        const width = total === 0 ? 0 : count * 100 / total;
        const label = t(locale, bundle, 'Outcome_' + bucket);
        outcomeDescriptions.push(label + ': ' + count);
        segmentValues.push(`<span class="conformance__bar-segment conformance__bar-segment--${bucket.toLowerCase()}" style="width:${width.toFixed(3)}%" title="${escapeHtml(label)}: ${count}" aria-hidden="true"></span>`);
    }
    const segments = segmentValues.join('');
    const fullAria = aria + ' ' + outcomeDescriptions.join(', ') + '.';
    return `<div class="conformance__bar" role="img" aria-label="${escapeHtml(fullAria)}">${segments}</div>`;
}

function renderConformanceMode(locale: Locale, counts: ResultCounts | null,
    mode: 'interpreted' | 'compiled', comparison: ResultCounts | null = null): string {
    const bundle = 'conformance';
    const modeClass = ` conformance__metric--${mode}`;
    if (!counts)
        return `<div class="conformance__metric${modeClass}" data-conformance-metric="${mode}"><span class="conformance__unavailable" aria-label="${escapeHtml(t(locale, bundle, 'NotAvailable'))}">—</span></div>`;
    const eligible = eligibleResults(counts);
    const percentage = passPercentage(counts);
    const formattedPercentage = percentage.toFixed(1);
    let delta = '';
    if (comparison) {
        const difference = percentage - passPercentage(comparison);
        const sign = difference > 0 ? '+' : '';
        const deltaClass = difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral';
        delta = `<span class="conformance__delta conformance__delta--${deltaClass}" title="${escapeHtml(t(locale, bundle, 'Delta_Label'))}">${sign}${difference.toFixed(1)}</span>`;
    }
    return `<div class="conformance__metric${modeClass}" data-conformance-metric="${mode}"><div class="conformance__metric-heading"><strong class="conformance__percentage">${formattedPercentage}%</strong>${delta}<span class="conformance__ratio">${counts.Pass} / ${eligible}</span></div>${renderConformanceBar(locale, counts)}<small>${counts.Skipped} ${escapeHtml(t(locale, bundle, 'Skipped'))}</small></div>`;
}

function renderConformanceRow(locale: Locale, node: ConformanceNode, depth: number,
    suite: 'test262' | 'typescript'): string {
    const localizedName = conformanceName(locale, node);
    const label = escapeHtml(localizedName);
    const attributes = ` data-conformance-node data-conformance-name="${escapeHtml(localizedName.toLowerCase())}"${conformanceDataAttributes('interpreted', node.interpreted)}${conformanceDataAttributes('compiled', node.compiled)}`;
    const compiled = suite === 'test262' ? renderConformanceMode(locale, node.compiled, 'compiled', node.interpreted) : '';
    const row = `<span class="conformance__name">${label}</span>${renderConformanceMode(locale, node.interpreted, 'interpreted')}${compiled}`;
    if (node.children.length === 0)
        return `<div class="conformance__node conformance__node--leaf conformance__node--depth-${depth}"${attributes}><div class="conformance__row conformance__row--leaf" style="--tree-depth:${depth}">${row}</div></div>`;
    const children = node.children.map(child => renderConformanceRow(locale, child, depth + 1, suite)).join('\n');
    return `<details class="conformance__node conformance__node--depth-${depth}"${attributes}${depth === 0 ? ' open' : ''}><summary class="conformance__row" style="--tree-depth:${depth}">${row}</summary><div class="conformance__children">${children}</div></details>`;
}

function renderOutcomeLegend(locale: Locale, buckets: string[]): string {
    const bundle = 'conformance';
    const itemValues: string[] = [];
    for (const bucket of buckets)
        itemValues.push(`<li><span class="conformance__legend-swatch conformance__bar-segment--${bucket.toLowerCase()}" aria-hidden="true"></span>${escapeHtml(t(locale, bundle, 'Outcome_' + bucket))}</li>`);
    const items = itemValues.join('');
    return `<ul class="conformance__legend" aria-label="${escapeHtml(t(locale, bundle, 'Legend_Label'))}">${items}</ul>`;
}

function renderSummaryCard(locale: Locale, titleKey: string, descriptionKey: string,
    counts: ResultCounts | null, modifier: string): string {
    const bundle = 'conformance';
    if (!counts)
        return '';
    return `<article class="conformance-summary__card conformance-summary__card--${modifier}"><p>${escapeHtml(t(locale, bundle, titleKey))}</p><strong>${passPercentage(counts).toFixed(1)}%</strong><span>${counts.Pass} / ${eligibleResults(counts)} ${escapeHtml(t(locale, bundle, 'Eligible'))}</span>${renderConformanceBar(locale, counts)}<small>${escapeHtml(t(locale, bundle, descriptionKey))}</small></article>`;
}

function renderSuiteControls(locale: Locale, suite: 'test262' | 'typescript'): string {
    const bundle = 'conformance';
    const mode = suite === 'test262' ? `<label>${escapeHtml(t(locale, bundle, 'Mode_Label'))}<select data-conformance-mode><option value="compare">${escapeHtml(t(locale, bundle, 'Mode_Compare'))}</option><option value="interpreted">${escapeHtml(t(locale, bundle, 'Interpreted'))}</option><option value="compiled">${escapeHtml(t(locale, bundle, 'Compiled'))}</option></select></label>` : '';
    return `<div class="conformance-suite__controls" data-conformance-suite-controls hidden>${mode}<label>${escapeHtml(t(locale, bundle, 'Status_Label'))}<select data-conformance-status><option value="all">${escapeHtml(t(locale, bundle, 'Status_All'))}</option><option value="passing">${escapeHtml(t(locale, bundle, 'Status_Passing'))}</option><option value="partial">${escapeHtml(t(locale, bundle, 'Status_Partial'))}</option><option value="zero">${escapeHtml(t(locale, bundle, 'Status_Zero'))}</option><option value="no-eligible">${escapeHtml(t(locale, bundle, 'Status_NoEligible'))}</option></select></label></div>`;
}

function renderConformanceSuite(locale: Locale, suite: 'test262' | 'typescript', nodes: ConformanceNode[]): string {
    const bundle = 'conformance';
    const test262 = suite === 'test262';
    const titleKey = test262 ? 'Test262_Title' : 'TypeScript_Title';
    const descriptionKey = test262 ? 'Test262_Description' : 'TypeScript_Description';
    const columns = test262
        ? `<span>${escapeHtml(t(locale, bundle, 'Feature'))}</span><span class="conformance__column--interpreted">${escapeHtml(t(locale, bundle, 'Interpreted'))}</span><span class="conformance__column--compiled">${escapeHtml(t(locale, bundle, 'Compiled'))}</span>`
        : `<span>${escapeHtml(t(locale, bundle, 'Feature'))}</span><span class="conformance__column--interpreted">${escapeHtml(t(locale, bundle, 'DiagnosticMatch'))}</span>`;
    const rows = nodes.map(node => renderConformanceRow(locale, node, 0, suite)).join('\n');
    const applicableBuckets = test262 ? conformanceBuckets : [
        'Pass', 'Fail', 'ParseError', 'TypeCheckError', 'HarnessError', 'Skipped'
    ];
    return `<section class="conformance-suite conformance-suite--${suite}" id="${suite}" data-conformance-suite="${suite}" data-view-mode="${test262 ? 'compare' : 'interpreted'}"><div class="conformance-suite__heading"><div><p class="conformance-suite__eyebrow">${escapeHtml(t(locale, bundle, test262 ? 'Test262_Eyebrow' : 'TypeScript_Eyebrow'))}</p><h2>${escapeHtml(t(locale, bundle, titleKey))}</h2><p>${escapeHtml(t(locale, bundle, descriptionKey))}</p></div>${renderSuiteControls(locale, suite)}</div>${renderOutcomeLegend(locale, applicableBuckets)}<div class="conformance card"><div class="conformance__header">${columns}</div><div class="conformance__tree">${rows}</div></div><p class="conformance__empty" data-conformance-empty hidden>${escapeHtml(t(locale, bundle, 'NoResults'))}</p><p class="conformance__result-count" data-conformance-result-count data-count-template="${escapeHtml(t(locale, bundle, 'ResultCount'))}"></p></section>`;
}

export function renderConformance(locale: Locale, data: ConformanceData): string {
    const bundle = 'conformance';
    const test262Roots = data.roots.filter(node => node.compiled !== null);
    const typeScriptRoots = data.roots.filter(node => node.compiled === null);
    const test262Interpreted = sumConformanceCounts(test262Roots, 'interpreted');
    const test262Compiled = sumConformanceCounts(test262Roots, 'compiled');
    const typeScriptCounts = sumConformanceCounts(typeScriptRoots, 'interpreted');
    const sharpTs = data.provenance.sharpTsRevision;
    const test262 = data.provenance.test262Revision;
    const typeScriptRevision = data.provenance.typeScriptRevision;
    return `<main class="landing conformance-page" data-conformance-explorer><section class="section conformance-hero"><div class="container"><p class="conformance-hero__eyebrow">${escapeHtml(t(locale, bundle, 'Eyebrow'))}</p><h1 class="section-title">${escapeHtml(t(locale, bundle, 'Title'))}</h1><p class="section-subtitle">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><nav class="conformance-hero__links" aria-label="${escapeHtml(t(locale, bundle, 'SuiteNavigation'))}"><a href="#test262">Test262</a><a href="#typescript">TypeScript</a></nav></div></section>
  <section class="section section--alt conformance-content"><div class="container"><div class="conformance-summary" aria-label="${escapeHtml(t(locale, bundle, 'Overview'))}">${renderSummaryCard(locale, 'Summary_Test262Interpreted', 'Summary_Runtime', test262Interpreted, 'interpreted')}${renderSummaryCard(locale, 'Summary_Test262Compiled', 'Summary_Runtime', test262Compiled, 'compiled')}${renderSummaryCard(locale, 'Summary_TypeScript', 'Summary_Diagnostics', typeScriptCounts, 'typescript')}</div><div class="conformance-explorer__controls" data-conformance-controls hidden><label class="conformance-search"><span>${escapeHtml(t(locale, bundle, 'Search_Label'))}</span><input type="search" data-conformance-search placeholder="${escapeHtml(t(locale, bundle, 'Search_Placeholder'))}"></label><div class="conformance-explorer__actions"><button type="button" class="btn btn-secondary btn-sm" data-conformance-expand>${escapeHtml(t(locale, bundle, 'ExpandAll'))}</button><button type="button" class="btn btn-secondary btn-sm" data-conformance-collapse>${escapeHtml(t(locale, bundle, 'CollapseAll'))}</button><button type="button" class="btn btn-secondary btn-sm" data-conformance-reset>${escapeHtml(t(locale, bundle, 'Reset'))}</button></div></div>${renderConformanceSuite(locale, 'test262', test262Roots)}${renderConformanceSuite(locale, 'typescript', typeScriptRoots)}
  <div class="conformance__notes"><p>${escapeHtml(t(locale, bundle, 'PercentageFootnote'))}</p><p>${escapeHtml(t(locale, bundle, 'HonestyFootnote'))}</p></div>
  <p class="conformance__provenance">${escapeHtml(t(locale, bundle, 'Provenance'))}: <a href="https://github.com/nickna/SharpTS/commit/${sharpTs}">SharpTS ${sharpTs.slice(0, 8)}</a> · <a href="https://github.com/nickna/SharpTS/tree/${sharpTs}/SharpTS.Test262">${escapeHtml(t(locale, bundle, 'Test262Suite'))}</a> (<a href="https://github.com/tc39/test262/commit/${test262}">${test262.slice(0, 8)}</a>) · <a href="https://github.com/nickna/SharpTS/tree/${sharpTs}/SharpTS.TypeScriptConformance">${escapeHtml(t(locale, bundle, 'TypeScriptSuite'))}</a> (<a href="https://github.com/microsoft/TypeScript/commit/${typeScriptRevision}">${typeScriptRevision.slice(0, 8)}</a>) · <a href="/conformance.json">JSON</a></p></div></section>${renderFooter(locale)}</main>`;
}

function alternateLinks(page: PageKind): string {
    const links = cultures.map(culture => `<link rel="alternate" hreflang="${culture.code}" href="${siteOrigin}${routePath(culture, page)}">`).join('\n');
    return links + `\n<link rel="alternate" hreflang="x-default" href="${siteOrigin}${routePath(cultures[0], page)}">`;
}

export function renderDocument(locale: Locale, page: PageKind, browserAssets: BrowserAssets,
    conformanceData: ConformanceData): string {
    const appBundle = 'home';
    const pagePath = routePath(locale.culture, page);
    const canonical = siteOrigin + pagePath;
    const pageBundle = page === 'guide' ? 'how-it-works' : 'conformance';
    const title = page === 'home' ? t(locale, appBundle, 'Meta_Title') : t(locale, pageBundle, 'Meta_Title');
    const ogTitle = page === 'home' ? t(locale, appBundle, 'Og_Title') : title;
    const description = page === 'conformance'
        ? t(locale, 'conformance', 'Meta_Description')
        : t(locale, appBundle, 'Meta_Description');
    const ogDescription = page === 'conformance'
        ? description
        : t(locale, appBundle, 'Og_Description');
    const body = page === 'home'
        ? renderHome(locale)
        : page === 'guide' ? renderGuide(locale) : renderConformance(locale, conformanceData);
    const preloadScript = page === 'conformance' ? '' : '  <script src="/js/preload.js"></script>\n';
    const browserScript = page === 'conformance'
        ? `  <script type="module" src="/assets/browser/${browserAssets.conformanceScript}"></script>\n`
        : `  <script type="module" src="/assets/browser/${browserAssets.script}"></script>\n`;
    return `<!doctype html>
<html lang="${locale.culture.code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0d1117">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${siteOrigin}/img/sharpts-logo.png">
  <meta property="og:locale" content="${locale.culture.openGraphLocale}">
  <link rel="canonical" href="${canonical}">
  ${alternateLinks(page)}
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" href="/favicon.png" sizes="any">
${preloadScript}  <link rel="stylesheet" href="/css/${browserAssets.siteStyle}">
  <link rel="stylesheet" href="/assets/browser/${browserAssets.style}">
</head>
<body class="page-${page}">
  ${renderNav(locale, page)}
  <div class="page">${body}</div>
${browserScript}
</body>
</html>
`;
}
function renderDocsSidebar(article: LoadedDocumentationArticle, documentation: LoadedDocumentation): string {
    const sections = documentationSections.map(section => {
        const items = documentation.published.filter(candidate => candidate.metadata.section === section).map(candidate => {
            const current = candidate.metadata.slug === article.metadata.slug;
            return `<li><a href="${docsRoutePath(candidate.metadata.slug)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(candidate.metadata.title)}</a></li>`;
        }).join('\n');
        return items ? `<p class="docs-sidebar__section">${escapeHtml(section)}</p><ul>${items}</ul>` : '';
    }).join('\n');
    return `<nav class="docs-sidebar__nav" aria-label="Documentation" data-docs-sidebar>${sections}<p class="docs-sidebar__section">API Reference</p><ul><li><a href="/docs/api">API Reference</a></li><li><a href="/docs/api/gui">@sharpts/gui</a></li></ul></nav>`;
}

function renderDocsOutline(article: LoadedDocumentationArticle, mobile: boolean): string {
    const items = article.rendered.headings.map(heading => `<li class="docs-outline__level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('\n');
    if (mobile)
        return `<details class="docs-mobile-outline" data-docs-outline><summary>On this page</summary><nav aria-label="On this page"><ul>${items}</ul></nav></details>`;
    return `<aside class="docs-outline" data-docs-outline><p>On this page</p><nav aria-label="On this page"><ul>${items}</ul></nav></aside>`;
}

function renderDocsPagination(article: LoadedDocumentationArticle, documentation: LoadedDocumentation): string {
    const index = documentation.published.findIndex(candidate => candidate.metadata.slug === article.metadata.slug);
    const previous = index > 0 ? documentation.published[index - 1] : null;
    const next = index + 1 < documentation.published.length ? documentation.published[index + 1] : null;
    const previousLink = previous ? `<a class="docs-pagination__previous" href="${docsRoutePath(previous.metadata.slug)}"><span>Previous</span><strong>← ${escapeHtml(previous.metadata.title)}</strong></a>` : '<span></span>';
    const nextLink = next ? `<a class="docs-pagination__next" href="${docsRoutePath(next.metadata.slug)}"><span>Next</span><strong>${escapeHtml(next.metadata.title)} →</strong></a>` : '<span></span>';
    return `<nav class="docs-pagination" aria-label="Documentation pagination">${previousLink}${nextLink}</nav>`;
}

export function renderDocumentationDocument(locale: Locale, article: LoadedDocumentationArticle,
    documentation: LoadedDocumentation, browserAssets: BrowserAssets): string {
    const route = docsRoutePath(article.metadata.slug);
    const canonical = siteOrigin + route;
    const sidebar = renderDocsSidebar(article, documentation);
    const crumb = article.metadata.slug === 'index' ? '' : `<li><span aria-hidden="true">/</span><span>${escapeHtml(article.metadata.section)}</span></li><li><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(article.metadata.title)}</span></li>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(article.metadata.description)}">
  <meta name="theme-color" content="#0d1117">
  <meta property="og:title" content="${escapeHtml(article.metadata.title)} · SharpTS Documentation">
  <meta property="og:description" content="${escapeHtml(article.metadata.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${siteOrigin}/img/sharpts-logo.png">
  <meta property="og:locale" content="en_US">
  <link rel="canonical" href="${canonical}">
  <title>${escapeHtml(article.metadata.title)} · SharpTS Documentation</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" href="/favicon.png" sizes="any">
  <link rel="stylesheet" href="/css/${browserAssets.siteStyle}">
  <link rel="stylesheet" href="/assets/browser/${browserAssets.style}">
</head>
<body class="page-docs">
  ${renderNav(locale, 'docs')}
  <div class="page docs-page">
    <div class="docs-mobile-controls"><details class="docs-mobile-menu"><summary>Documentation</summary>${sidebar}</details>${renderDocsOutline(article, true)}</div>
    <div class="docs-layout">
      <aside class="docs-sidebar">${sidebar}</aside>
      <main class="docs-main" id="main-content">
        <nav class="docs-breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/docs">Documentation</a></li>${crumb}</ol></nav>
        <p class="docs-language-notice">Documentation is currently available in English.</p>
        <article class="docs-article">
          <header class="docs-article__header"><p class="docs-article__section">${escapeHtml(article.metadata.section)}</p><h1>${escapeHtml(article.metadata.title)}</h1><p>${escapeHtml(article.metadata.description)}</p><span class="docs-tested">Tested with SharpTS ${escapeHtml(documentation.testedVersion)}</span></header>
          ${article.rendered.html}
        </article>
        ${renderDocsPagination(article, documentation)}
      </main>
      ${renderDocsOutline(article, false)}
    </div>
    ${renderFooter(locale)}
  </div>
  <script type="module" src="/assets/browser/${browserAssets.docsScript}"></script>
</body>
</html>
`;
}

function apiTypeText(parts: any[] | undefined): string {
    return (parts || []).map(part => part.text).join('');
}

function renderApiType(parts: any[] | undefined, catalog: any): string {
    return (parts || []).map(part => {
        const symbol = part.symbolId ? catalog.symbols.find((candidate: any) => candidate.id === part.symbolId) : null;
        const text = escapeHtml(part.text);
        return symbol ? `<a class="api-type-link" href="${symbol.route}">${text}</a>` : text;
    }).join('');
}

function apiSlug(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '').toLowerCase();
}

function apiValue(value: unknown): string {
    if (value === undefined) return '—';
    return JSON.stringify(value);
}

function apiSignatureText(symbol: any, signature: any): string {
    const generics = signature.typeParameters.length ? '<' + signature.typeParameters.map((parameter: any) => {
        let text = parameter.name;
        if (parameter.constraint) text += ' extends ' + apiTypeText(parameter.constraint);
        if (parameter.default) text += ' = ' + apiTypeText(parameter.default);
        return text;
    }).join(', ') + '>' : '';
    const parameters = signature.parameters.map((parameter: any) => {
        let text = (parameter.rest ? '...' : '') + parameter.name + (parameter.optional ? '?' : '') + ': ' +
            apiTypeText(parameter.type);
        if (parameter.default !== undefined) text += ' = ' + parameter.default;
        return text;
    }).join(', ');
    return `${symbol.name}${generics}(${parameters}): ${apiTypeText(signature.returns.type)}`;
}

function renderApiSearch(catalog: any): string {
    const fallback = catalog.categories.map((category: any) =>
        `<li><a href="${category.route}">${escapeHtml(category.title)}</a></li>`).join('');
    return `<section class="api-search" aria-label="Search API Reference" data-api-search data-search-url="/docs/api/search-index.json">
  <label for="api-search-input">Search <code>@sharpts/gui</code></label>
  <div class="api-search__field"><input id="api-search-input" type="search" autocomplete="off" placeholder="Search symbols" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="api-search-results" data-api-search-input></div>
  <ul id="api-search-results" class="api-search__results" role="listbox" hidden data-api-search-results></ul>
  <p class="api-search__status" role="status" aria-live="polite" data-api-search-status></p>
</section><noscript><nav class="api-search-fallback" aria-label="Browse API categories"><p>Browse API categories</p><ul>${fallback}</ul></nav></noscript>`;
}

function renderApiSymbolList(symbols: any[]): string {
    if (!symbols.length) return '<p>No public symbols are assigned to this category.</p>';
    return `<div class="api-symbol-grid">${symbols.map(symbol => `<a class="api-symbol-card" href="${symbol.route}"><span class="api-kind">${escapeHtml(symbol.kind)}</span><strong><code>${escapeHtml(symbol.name)}</code></strong><p>${escapeHtml(symbol.summary)}</p></a>`).join('')}</div>`;
}

function renderApiCategories(catalog: any): string {
    return `<div class="api-category-grid">${catalog.categories.map((category: any) => `<a class="api-category-card" href="${category.route}"><strong>${escapeHtml(category.title)}</strong><span>${category.symbolIds.length} symbols</span><p>${escapeHtml(category.summary)}</p></a>`).join('')}</div>`;
}

function renderApiSignature(locale: Locale, symbol: any, signature: any,
    index: number, catalog: any): string {
    const suffix = symbol.signatures.length > 1 ? ` ${index + 1}` : '';
    const parameters = signature.parameters.length ? `<h3 id="parameters${index || ''}">Parameters${suffix}</h3><div class="api-table-wrap"><table class="api-table"><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>${signature.parameters.map((parameter: any) => `<tr><td><code>${escapeHtml(parameter.name)}</code>${parameter.optional ? ' <span class="api-optional">optional</span>' : ''}</td><td><code>${renderApiType(parameter.type, catalog)}</code>${parameter.default !== undefined ? `<div class="api-default">Default: <code>${escapeHtml(parameter.default)}</code></div>` : ''}</td><td>${escapeHtml(parameter.description)}</td></tr>`).join('')}</tbody></table></div>` : '';
    const returnType = apiTypeText(signature.returns.type);
    const returns = returnType === 'void' ? '' : `<h3 id="returns${index || ''}">Returns${suffix}</h3><p><code>${renderApiType(signature.returns.type, catalog)}</code> — ${escapeHtml(signature.returns.description)}</p>`;
    return `<section class="api-signature"><h2 id="signature${index || ''}">Signature${suffix}</h2><div class="docs-code">${codeBlock(locale, 'TypeScript', 'typescript', apiSignatureText(symbol, signature))}</div>${parameters}${returns}</section>`;
}

function renderApiMember(member: any, catalog: any): string {
    const modifiers = `${member.isReadonly ? 'readonly ' : ''}${member.name}${member.optional ? '?' : ''}`;
    const signature = member.signatures.length
        ? member.signatures.map((value: any) => `${modifiers}(${value.parameters.map((parameter: any) => `${parameter.name}${parameter.optional ? '?' : ''}: ${apiTypeText(parameter.type)}`).join(', ')}): ${apiTypeText(value.returns.type)}`).join('\n')
        : `${modifiers}: ${apiTypeText(member.type)}`;
    const details: string[] = [];
    if (member.default !== undefined) details.push(`Default: <code>${escapeHtml(apiValue(member.default))}</code>`);
    if (member.enumValues?.length) details.push(`Values: ${member.enumValues.map((value: any) => `<code>${escapeHtml(apiValue(value))}</code>`).join(', ')}`);
    if (member.inherited) details.push('Inherited');
    return `<section class="api-member" id="member-${apiSlug(member.name)}"><h3><code>${escapeHtml(member.name)}</code></h3><pre><code class="language-typescript">${escapeHtml(signature)}</code></pre><p>${escapeHtml(member.description)}</p>${details.length ? `<p class="api-member__details">${details.join(' · ')}</p>` : ''}${member.type ? `<p class="api-member__type">Type: <code>${renderApiType(member.type, catalog)}</code></p>` : ''}</section>`;
}

function renderApiControl(symbol: any): string {
    if (!symbol.control) return '';
    const child = symbol.control.children;
    const maximum = child.maximum < 0 ? 'unbounded' : String(child.maximum);
    const rows = symbol.control.props.map((prop: any) => `<tr><td><code>${escapeHtml(prop.name)}</code>${prop.required ? ' <span class="api-required">required</span>' : ''}</td><td><code>${escapeHtml(prop.type)}</code></td><td>${escapeHtml(prop.documentation)}${prop.default !== undefined ? `<div class="api-default">Default: <code>${escapeHtml(apiValue(prop.default))}</code></div>` : ''}${prop.enumValues?.length ? `<div class="api-values">Values: ${prop.enumValues.map((value: any) => `<code>${escapeHtml(apiValue(value))}</code>`).join(', ')}</div>` : ''}</td></tr>`).join('');
    return `<h2 id="control-metadata">Control metadata</h2><dl class="api-metadata"><div><dt>Native type</dt><dd><code>${escapeHtml(symbol.control.nativeType)}</code></dd></div><div><dt>Props</dt><dd><a href="/docs/api/gui/${apiSlug(symbol.control.propsType)}"><code>${escapeHtml(symbol.control.propsType)}</code></a></dd></div><div><dt>Children</dt><dd>${escapeHtml(child.model)} (${child.minimum}–${maximum})</dd></div><div><dt>Handle</dt><dd><code>${escapeHtml(symbol.control.handle)}</code></dd></div></dl><h2 id="props">Props</h2><div class="api-table-wrap"><table class="api-table"><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderApiSymbol(locale: Locale, symbol: any, catalog: any): string {
    let declaration = '';
    if (!symbol.signatures.length && symbol.type) {
        const prefix = symbol.kind === 'Type alias' ? 'type ' : 'const ';
        declaration = `<h2 id="definition">Definition</h2><div class="docs-code">${codeBlock(locale, 'TypeScript', 'typescript', `${prefix}${symbol.name} = ${apiTypeText(symbol.type)}`)}</div>`;
    }
    const signatures = symbol.signatures.map((signature: any, index: number) => renderApiSignature(locale, symbol, signature, index, catalog)).join('');
    const enumValues = symbol.enumValues?.length ? `<h2 id="values">Values</h2><ul class="api-values-list">${symbol.enumValues.map((value: any) => `<li><code>${escapeHtml(apiValue(value))}</code></li>`).join('')}</ul>` : '';
    const members = symbol.members.length ? `<h2 id="members">Members</h2><div class="api-members">${symbol.members.map((member: any) => renderApiMember(member, catalog)).join('')}</div>` : '';
    const related = symbol.related.length ? `<h2 id="related">Related symbols</h2><ul class="api-related">${symbol.related.map((id: string) => catalog.symbols.find((candidate: any) => candidate.id === id)).filter((candidate: any) => candidate !== undefined).map((candidate: any) => `<li><a href="${candidate!.route}"><code>${escapeHtml(candidate!.name)}</code></a> <span>${escapeHtml(candidate!.kind)}</span></li>`).join('')}</ul>` : '';
    const source = symbol.source ? `<h2 id="source">Source</h2><p><a href="${symbol.source.url}" target="_blank" rel="noopener"><code>${escapeHtml(symbol.source.file)}:${symbol.source.line}</code></a> at SharpTS revision <code>${escapeHtml(catalog.package.revision)}</code>.</p>` : '';
    const remarks = symbol.remarks ? `<h2 id="remarks">Remarks</h2><p>${escapeHtml(symbol.remarks)}</p>` : '';
    return `${declaration}${signatures}${enumValues}${renderApiControl(symbol)}${members}${remarks}${related}${source}`;
}

function renderApiSidebar(page: any, documentation: LoadedDocumentation,
    catalog: any): string {
    const editorial = documentationSections.map(section => {
        const first = documentation.published.find(article => article.metadata.section === section);
        return first ? `<li><a href="${docsRoutePath(first.metadata.slug)}">${escapeHtml(section)}</a></li>` : '';
    }).join('');
    const packageCurrent = page.kind === 'package';
    const currentSymbol: any = page.kind === 'symbol' ? page.symbol : null;
    const categories = catalog.categories.map((category: any) => {
        const current = page.kind === 'category' && page.category.id === category.id;
        const symbolCurrent = currentSymbol !== null && currentSymbol.category === category.id;
        return `<li><a href="${category.route}"${current ? ' aria-current="page"' : ''}>${escapeHtml(category.title)}</a>${symbolCurrent ? `<a class="docs-sidebar__symbol" href="${currentSymbol.route}" aria-current="page"><code>${escapeHtml(currentSymbol.name)}</code></a>` : ''}</li>`;
    }).join('');
    return `<nav class="docs-sidebar__nav" aria-label="Documentation" data-docs-sidebar><p class="docs-sidebar__section">Documentation</p><ul><li><a href="/docs">Overview</a></li>${editorial}</ul><p class="docs-sidebar__section">API Reference</p><ul><li><a href="/docs/api"${page.kind === 'landing' ? ' aria-current="page"' : ''}>Overview</a></li><li><a href="/docs/api/gui"${packageCurrent ? ' aria-current="page"' : ''}>@sharpts/gui</a></li>${categories}</ul></nav>`;
}

function apiPageDetails(locale: Locale, page: any, catalog: any): { title: string; section: string; description: string; content: string } {
    if (page.kind === 'landing') return {
        title: 'API Reference',
        section: 'SharpTS APIs',
        description: 'Generated reference documentation for the public SharpTS TypeScript packages.',
        content: `<h2 id="packages">Packages</h2><a class="api-package-card" href="/docs/api/gui"><strong><code>@sharpts/gui</code></strong><span>${catalog.symbols.length} public symbols</span><p>Native desktop GUI components, composition, state, lifecycle, services, testing, and devtools.</p></a>`
    };
    if (page.kind === 'package') return {
        title: '@sharpts/gui',
        section: 'API Reference',
        description: 'Complete public TypeScript API for SharpTS native desktop applications.',
        content: `<h2 id="categories">Categories</h2>${renderApiCategories(catalog)}`
    };
    if (page.kind === 'category') return {
        title: page.category.title,
        section: '@sharpts/gui',
        description: page.category.summary,
        content: `<h2 id="symbols">Symbols</h2>${renderApiSymbolList(page.category.symbolIds.map((id: string) => catalog.symbols.find((symbol: any) => symbol.id === id)!).filter((symbol: any) => symbol !== undefined))}`
    };
    const category = catalog.categories.find((candidate: any) => candidate.id === page.symbol.category);
    return {
        title: page.symbol.name,
        section: `${page.symbol.kind} · ${category ? category.title : page.symbol.category}`,
        description: page.symbol.summary,
        content: renderApiSymbol(locale, page.symbol, catalog)
    };
}

function renderApiOutline(page: any, mobile: boolean): string {
    const items: { id: string; text: string }[] = [];
    if (page.kind === 'landing') items.push({ id: 'packages', text: 'Packages' });
    else if (page.kind === 'package') items.push({ id: 'categories', text: 'Categories' });
    else if (page.kind === 'category') items.push({ id: 'symbols', text: 'Symbols' });
    else {
        if (page.symbol.type && !page.symbol.signatures.length) items.push({ id: 'definition', text: 'Definition' });
        if (page.symbol.signatures.length) items.push({ id: 'signature', text: 'Signature' });
        if (page.symbol.enumValues?.length) items.push({ id: 'values', text: 'Values' });
        if (page.symbol.control) items.push({ id: 'control-metadata', text: 'Control metadata' }, { id: 'props', text: 'Props' });
        if (page.symbol.members.length) items.push({ id: 'members', text: 'Members' });
        if (page.symbol.remarks) items.push({ id: 'remarks', text: 'Remarks' });
        if (page.symbol.related.length) items.push({ id: 'related', text: 'Related symbols' });
        if (page.symbol.source) items.push({ id: 'source', text: 'Source' });
    }
    const links = items.map(item => `<li><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`).join('');
    if (mobile) return `<details class="docs-mobile-outline" data-docs-outline><summary>On this page</summary><nav aria-label="On this page"><ul>${links}</ul></nav></details>`;
    return `<aside class="docs-outline" data-docs-outline><p>On this page</p><nav aria-label="On this page"><ul>${links}</ul></nav></aside>`;
}

export function renderApiReferenceDocument(locale: Locale, page: any,
    catalog: any, documentation: LoadedDocumentation, browserAssets: BrowserAssets): string {
    const details = apiPageDetails(locale, page, catalog);
    const canonical = siteOrigin + page.route;
    const sidebar = renderApiSidebar(page, documentation, catalog);
    const crumbs = page.kind === 'landing' ? '' : page.kind === 'package'
        ? '<li><span aria-hidden="true">/</span><span aria-current="page">@sharpts/gui</span></li>'
        : page.kind === 'category'
            ? `<li><span aria-hidden="true">/</span><a href="/docs/api/gui">@sharpts/gui</a></li><li><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(page.category.title)}</span></li>`
            : `<li><span aria-hidden="true">/</span><a href="/docs/api/gui">@sharpts/gui</a></li><li><span aria-hidden="true">/</span><a href="/docs/api/gui/${escapeHtml(page.symbol.category)}">${escapeHtml(catalog.categories.find((category: any) => category.id === page.symbol.category)?.title || page.symbol.category)}</a></li><li><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(page.symbol.name)}</span></li>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(details.description)}">
  <meta name="theme-color" content="#0d1117">
  <meta property="og:title" content="${escapeHtml(details.title)} · SharpTS API Reference">
  <meta property="og:description" content="${escapeHtml(details.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${siteOrigin}/img/sharpts-logo.png">
  <meta property="og:locale" content="en_US">
  <link rel="canonical" href="${canonical}">
  <title>${escapeHtml(details.title)} · SharpTS API Reference</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" href="/favicon.png" sizes="any">
  <link rel="stylesheet" href="/css/${browserAssets.siteStyle}">
  <link rel="stylesheet" href="/assets/browser/${browserAssets.style}">
</head>
<body class="page-docs page-api">
  ${renderNav(locale, 'docs')}
  <div class="page docs-page">
    <div class="docs-mobile-controls"><details class="docs-mobile-menu"><summary>Documentation</summary>${sidebar}</details>${renderApiOutline(page, true)}</div>
    <div class="docs-layout">
      <aside class="docs-sidebar">${sidebar}</aside>
      <main class="docs-main" id="main-content">
        <nav class="docs-breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/docs">Documentation</a></li><li><span aria-hidden="true">/</span><a href="/docs/api">API Reference</a></li>${crumbs}</ol></nav>
        ${renderApiSearch(catalog)}
        <article class="docs-article api-article">
          <header class="docs-article__header"><p class="docs-article__section">${escapeHtml(details.section)}</p><h1>${escapeHtml(details.title)}</h1><p>${escapeHtml(details.description)}</p><span class="docs-tested"><code>${escapeHtml(catalog.package.name)}</code> ${escapeHtml(catalog.package.version)} · SharpTS <a href="${catalog.package.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(catalog.package.revision.slice(0, 12))}</a></span></header>
          ${details.content}
        </article>
      </main>
      ${renderApiOutline(page, false)}
    </div>
    ${renderFooter(locale)}
  </div>
  <script type="module" src="/assets/browser/${browserAssets.docsScript}"></script>
</body>
</html>
`;
}
