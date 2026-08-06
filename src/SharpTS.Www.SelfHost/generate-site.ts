import { buildSite } from './site-build';
import { eligibleResults, loadConformanceData, passPercentage, totalResults } from './conformance-data';
import type { ConformanceData, ConformanceNode, ResultCounts } from './conformance-data';
import { loadSitePaths } from './site-config';
import { escapeHtml, renderRichText } from './site-html';
import { t } from './site-localization';
import { cultures, siteOrigin } from './site-model';
import type { BrowserAssets, Locale, PageKind } from './site-model';
import { routePath } from './site-paths';
import { comparisonGroups, showcaseExamples } from './showcase-data';
import { presets } from './presets';

const conformanceData = loadConformanceData(loadSitePaths().repoRoot);

const githubIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

function copyButton(locale: Locale): string {
    const copy = escapeHtml(t(locale, 'Components.Shared.CopyButton', 'Copy'));
    const copied = escapeHtml(t(locale, 'Components.Shared.CopyButton', 'Copied'));
    return `<button type="button" class="copy-btn" data-copy-button data-copy-label="${copy}" data-copied-label="${copied}">${copyIcon}<span>${copy}</span></button>`;
}

function codeBlock(locale: Locale, title: string, language: string, code: string): string {
    return `<div class="code-block">
  <div class="code-block__header"><span>${escapeHtml(title)}</span>${copyButton(locale)}</div>
  <div class="code-block__content"><pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre></div>
</div>`;
}

function languageSelector(locale: Locale, page: PageKind): string {
    const languageBundle = 'Components.Shared.LanguageSelector';
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

function renderNav(locale: Locale, page: PageKind): string {
    const bundle = 'Components.Sections.NavHeader';
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
      <a href="${home}#get-started" class="nav__link">${escapeHtml(t(locale, bundle, 'Nav_GetStarted'))}</a>
      <a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener" class="nav__link nav__link--github" aria-label="GitHub">${githubIcon}</a>
      ${languageSelector(locale, page)}
    </nav>
    <button type="button" class="nav__hamburger" data-nav-toggle aria-expanded="false" aria-label="${escapeHtml(t(locale, bundle, 'Nav_ToggleAriaLabel'))}"><span></span><span></span><span></span></button>
  </div>
</header>`;
}

function renderFooter(locale: Locale): string {
    const bundle = 'Components.Sections.FooterSection';
    const home = routePath(locale.culture, 'home');
    return `<footer class="footer">
  <div class="footer__gradient-border"></div>
  <div class="container footer__inner">
    <div class="footer__top">
      <div class="footer__brand"><a href="${home}" class="footer__logo-link"><span class="footer__logo-name">SharpTS</span></a><p class="footer__tagline">${escapeHtml(t(locale, bundle, 'Tagline'))}</p></div>
      <div class="footer__links">
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_Resources'))}</h4><a href="https://github.com/nickna/SharpTS" target="_blank" rel="noopener">GitHub</a><a href="https://www.nuget.org/packages/SharpTS" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_NuGet'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/STATUS.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Status'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/ARCHITECTURE.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Architecture'))}</a></div>
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_Community'))}</h4><a href="https://github.com/nickna/SharpTS/issues" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_ReportIssue'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_Contributing'))}</a><a href="https://github.com/nickna/SharpTS/blob/main/LICENSE" target="_blank" rel="noopener">${escapeHtml(t(locale, bundle, 'Link_License'))}</a></div>
        <div class="footer__col"><h4 class="footer__col-title">${escapeHtml(t(locale, bundle, 'Col_OnThisPage'))}</h4><a href="${home}#features">${escapeHtml(t(locale, bundle, 'Link_Features'))}</a><a href="${home}#examples">${escapeHtml(t(locale, bundle, 'Link_CodeExamples'))}</a><a href="${home}#use-cases">${escapeHtml(t(locale, bundle, 'Link_UseCases'))}</a><a href="${home}#playground">${escapeHtml(t(locale, bundle, 'Link_Playground'))}</a><a href="${home}#faq">${escapeHtml(t(locale, bundle, 'Link_Faq'))}</a><a href="${home}#get-started">${escapeHtml(t(locale, bundle, 'Link_GetStarted'))}</a></div>
      </div>
    </div>
    <div class="footer__bottom"><p>&copy; 2026 <a href="https://github.com/nickna" target="_blank" rel="noopener">Nick Nassiri</a>.</p><p>${escapeHtml(t(locale, bundle, 'BuiltWith'))}</p></div>
  </div>
</footer>`;
}

function renderHero(locale: Locale): string {
    const bundle = 'Components.Sections.HeroSection';
    const heroCode = t(locale, bundle, 'Hero_Code');
    return `<section class="hero" id="hero">
  <div class="hero__orb hero__orb--1"></div><div class="hero__orb hero__orb--2"></div><div class="hero__orb hero__orb--3"></div>
  <canvas id="hero-particles" class="hero__particles" aria-hidden="true"></canvas><div class="hero__grid"></div>
  <div class="container hero__inner">
    <div class="hero__badge hero-enter hero-enter--1"><span class="hero__badge-dot"></span>${escapeHtml(t(locale, bundle, 'Hero_Badge'))}</div>
    <h1 class="hero__title hero-enter hero-enter--2"><span class="gradient-text">SharpTS</span></h1>
    <p class="hero__tagline hero-enter hero-enter--3">${escapeHtml(t(locale, bundle, 'Hero_Tagline'))}</p>
    <p class="hero__subtagline hero-enter hero-enter--4">${escapeHtml(t(locale, bundle, 'Hero_Subtagline'))}</p>
    <div class="hero__ctas hero-enter hero-enter--5">
      <div class="hero__install"><span class="hero__install-prompt">$</span><code class="hero__install-cmd">dotnet tool install -g SharpTS</code>${copyButton(locale)}</div>
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
    const bundle = 'Components.Sections.FeaturesGrid';
    const cards = featureCards.map(card => `<div class="card feature-card reveal"><div class="feature-card__icon" style="color:var(${card.color})"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${card.icon}</svg></div><h3 class="feature-card__title">${escapeHtml(t(locale, bundle, card.key + '_Title'))}</h3><p class="feature-card__desc">${renderRichText(t(locale, bundle, card.key + '_Desc'))}</p></div>`);
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="features-grid">${cards.join('\n')}</div></div></section>`;
}

function renderExamples(locale: Locale): string {
    const bundle = 'Components.Sections.LiveCodeExamples';
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
    const bundle = 'Components.Sections.WhenItFits';
    const cards = useCases.map(useCase => `<div class="card usecase-card reveal"><h3 class="usecase-card__title">${escapeHtml(t(locale, bundle, useCase.key + '_Title'))}</h3><p class="usecase-card__desc">${renderRichText(t(locale, bundle, useCase.key + '_Desc'))}</p>${codeBlock(locale, useCase.title || t(locale, bundle, 'Terminal'), useCase.language, useCase.code)}</div>`);
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="usecase-grid">${cards.join('\n')}</div></div></section>`;
}

function renderArchitecturePreview(locale: Locale): string {
    const bundle = 'Components.Sections.ArchitectureDiagram';
    const node = (key: string, className: string = ''): string =>
        `<span class="arch-preview__node${className}">${escapeHtml(t(locale, bundle, key))}</span>`;
    return `<section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="arch-preview reveal"><div class="arch-preview__flow">${node('Label_Source')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Lexer')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Parser')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_TypeChecker', ' arch-preview__node--accent')}<span class="arch-preview__sep" aria-hidden="true">→</span>${node('Label_Interpreter', ' arch-preview__node--interpret')}<span class="arch-preview__sep arch-preview__sep--or" aria-hidden="true">/</span>${node('Label_ILCompiler', ' arch-preview__node--compile')}</div><a href="${routePath(locale.culture, 'guide')}" class="btn btn-primary arch-preview__cta">${escapeHtml(t(locale, bundle, 'Cta_LearnMore'))}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></a></div></div></section>`;
}

function renderPlayground(locale: Locale): string {
    const bundle = 'Components.Sections.PlaygroundSection';
    const options = presets.map(preset => `<option value="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</option>`).join('\n');
    const timingData = [
        ['timing-headline', 'TimingHeadline'],
        ['timing-failed-headline', 'TimingFailedHeadline'],
        ['timing-sharp-ts-pipeline', 'TimingSharpTSPipeline'],
        ['timing-end-to-end', 'TimingEndToEnd'],
        ['timing-status-completed', 'TimingStatusCompleted'],
        ['timing-status-failed', 'TimingStatusFailed'],
        ['phase-tokenize-name', 'TimingPhaseTokenizeName'],
        ['phase-tokenize-description', 'TimingPhaseTokenizeDescription'],
        ['phase-parse-name', 'TimingPhaseParseName'],
        ['phase-parse-description', 'TimingPhaseParseDescription'],
        ['phase-type-check-name', 'TimingPhaseTypeCheckName'],
        ['phase-type-check-description', 'TimingPhaseTypeCheckDescription'],
        ['phase-prepare-interpreter-name', 'TimingPhasePrepareInterpreterName'],
        ['phase-prepare-interpreter-description', 'TimingPhasePrepareInterpreterDescription'],
        ['phase-compile-name', 'TimingPhaseCompileName'],
        ['phase-compile-description', 'TimingPhaseCompileDescription'],
        ['phase-load-name', 'TimingPhaseLoadName'],
        ['phase-load-description', 'TimingPhaseLoadDescription'],
        ['phase-execute-name', 'TimingPhaseExecuteName'],
        ['phase-execute-description', 'TimingPhaseExecuteDescription']
    ].map(([attribute, key]) => `data-${attribute}="${escapeHtml(t(locale, bundle, key))}"`).join(' ');
    return `<section class="section" id="playground"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="playground reveal" data-playground data-running="false" data-placeholder="${escapeHtml(t(locale, bundle, 'Placeholder'))}" data-request-failed="${escapeHtml(t(locale, bundle, 'RequestFailed'))}" data-invalid-response="${escapeHtml(t(locale, bundle, 'InvalidResponse'))}" ${timingData}>
  <div class="playground__toolbar"><div class="playground__toolbar-left"><select class="playground__preset" data-playground-preset aria-label="${escapeHtml(t(locale, bundle, 'SelectPreset'))}"><option value="">${escapeHtml(t(locale, bundle, 'SelectPreset'))}</option>${options}</select><div class="playground__mode" role="group" aria-label="${escapeHtml(t(locale, bundle, 'ModeLabel'))}"><button type="button" class="playground__mode-btn playground__mode-btn--active" data-playground-mode="interpret" aria-pressed="true">${escapeHtml(t(locale, bundle, 'ModeInterpret'))}</button><button type="button" class="playground__mode-btn" data-playground-mode="compile" aria-pressed="false">${escapeHtml(t(locale, bundle, 'ModeCompile'))}</button></div></div><div class="playground__toolbar-right"><button type="button" class="btn btn-sm btn-secondary" data-playground-clear>${escapeHtml(t(locale, bundle, 'Clear'))}</button><button type="button" id="playground-run-btn" class="btn btn-sm btn-primary" data-playground-run aria-busy="false"><span class="playground__spinner" aria-hidden="true"></span><span class="playground__run-label--idle">${escapeHtml(t(locale, bundle, 'Run'))}</span><span class="playground__run-label--running">${escapeHtml(t(locale, bundle, 'Running'))}</span><kbd class="playground__kbd">${escapeHtml(t(locale, bundle, 'RunShortcut'))}</kbd></button></div></div>
  <div class="playground__body"><div class="playground__editor"><div id="playground-editor" class="playground__cm-container"><textarea class="playground__fallback-editor" data-playground-editor spellcheck="false" aria-label="TypeScript source">${escapeHtml(t(locale, bundle, 'DefaultCode'))}</textarea></div></div><div class="playground__output"><div class="playground__output-header"><span>${escapeHtml(t(locale, bundle, 'Output'))}</span><button type="button" class="playground__timing" data-playground-timing data-timing-compiled="${escapeHtml(t(locale, bundle, 'TimingCompiled'))}" data-timing-executed="${escapeHtml(t(locale, bundle, 'TimingExecuted'))}" aria-label="${escapeHtml(t(locale, bundle, 'TimingJourneyLabel'))}" aria-expanded="false" aria-controls="playground-timing-details" hidden><span data-playground-timing-headline></span><span class="playground__timing-chevron" aria-hidden="true">▾</span></button></div><div id="playground-timing-details" class="playground__timing-details" data-playground-timing-details hidden><div class="playground__timing-phases" data-playground-timing-phases role="group" aria-label="${escapeHtml(t(locale, bundle, 'TimingJourneyLabel'))}"></div><p class="playground__timing-description" data-playground-timing-description aria-live="polite"></p><p class="playground__timing-summary"><span data-playground-timing-pipeline></span><span data-playground-timing-total></span></p></div><div class="playground__output-body" data-playground-output role="status" aria-live="polite"><span class="playground__placeholder">${escapeHtml(t(locale, bundle, 'Placeholder'))}</span></div></div></div>
</div></div></section>`;
}

function renderComparison(locale: Locale): string {
    const bundle = 'Components.Sections.FeatureComparison';
    const badgeKey: { [status: string]: string } = { done: 'Badge_Implemented', partial: 'Badge_Partial', missing: 'Badge_Missing' };
    const badgeClass: { [status: string]: string } = { done: 'badge-green', partial: 'badge-yellow', missing: 'badge-red' };
    const groups = comparisonGroups.map(group => {
        const rows = group.features.map(feature => `<tr><td class="comparison__feature">${escapeHtml(t(locale, bundle, feature.key))}</td><td><span class="badge ${badgeClass[feature.status]}">${escapeHtml(t(locale, bundle, badgeKey[feature.status]))}</span></td><td class="comparison__notes">${feature.note ? escapeHtml(t(locale, bundle, feature.note)) : ''}</td></tr>`).join('\n');
        return `<div class="comparison__group"><h3 class="comparison__group-title">${escapeHtml(t(locale, bundle, group.key))}</h3><table class="comparison__table"><thead><tr><th>${escapeHtml(t(locale, bundle, 'Th_Feature'))}</th><th>${escapeHtml(t(locale, bundle, 'Th_Status'))}</th><th>${escapeHtml(t(locale, bundle, 'Th_Notes'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('\n');
    return `<section class="section section--alt"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="comparison reveal">${groups}</div><p class="comparison__conformance-link reveal"><a href="${routePath(locale.culture, 'conformance')}">${escapeHtml(t(locale, bundle, 'Link_Conformance'))}</a></p></div></section>`;
}

function renderFaq(locale: Locale): string {
    const bundle = 'Components.Sections.FaqSection';
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
    const bundle = 'Components.Sections.GettingStarted';
    const codes = ['dotnet tool install -g SharpTS', gettingStartedWriteCode, t(locale, bundle, 'RunCode')];
    const titles = [t(locale, bundle, 'Terminal'), 'hello.ts', t(locale, bundle, 'Terminal')];
    const languages = ['bash', 'typescript', 'bash'];
    const steps: string[] = [];
    for (let index = 1; index <= 3; index++)
        steps.push(`<div class="gs-step"><div class="gs-step__number">${index}</div><div class="gs-step__content"><h3 class="gs-step__title">${escapeHtml(t(locale, bundle, 'Step' + index + '_Title'))}</h3><p class="gs-step__desc">${escapeHtml(t(locale, bundle, 'Step' + index + '_Desc'))}</p>${codeBlock(locale, titles[index - 1], languages[index - 1], codes[index - 1])}</div></div>`);
    return `<section class="section"><div class="container"><h2 class="section-title reveal">${escapeHtml(t(locale, bundle, 'Title'))}</h2><p class="section-subtitle reveal">${escapeHtml(t(locale, bundle, 'Subtitle'))}</p><div class="getting-started reveal">${steps.join('\n')}</div></div></section>`;
}

function renderHome(locale: Locale): string {
    return `<main class="landing">${renderHero(locale)}<div id="features">${renderFeatures(locale)}</div><div id="examples">${renderExamples(locale)}</div><div id="use-cases">${renderUseCases(locale)}</div><div id="architecture">${renderArchitecturePreview(locale)}</div>${renderPlayground(locale)}<div id="support">${renderComparison(locale)}</div><div id="faq">${renderFaq(locale)}</div><div id="get-started">${renderGettingStarted(locale)}</div>${renderFooter(locale)}</main>`;
}

const architectureStages = ['Lexer', 'Parser', 'TypeChecker', 'Interpreter', 'ILCompiler'];

function architectureButton(locale: Locale, stage: string, modifier: string, icon: string): string {
    const bundle = 'Components.Sections.ArchitectureDiagram';
    return `<button type="button" class="pipeline__box${modifier}" data-architecture-stage="${stage}" aria-pressed="false"><span class="pipeline__icon" aria-hidden="true">${icon}</span><span class="pipeline__label">${escapeHtml(t(locale, bundle, 'Label_' + stage))}</span><span class="pipeline__detail">${escapeHtml(t(locale, bundle, 'Detail_' + stage))}</span></button>`;
}

function renderArchitectureDiagram(locale: Locale): string {
    const bundle = 'Components.Sections.ArchitectureDiagram';
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

function renderGuide(locale: Locale): string {
    const bundle = 'Components.Pages.HowItWorks';
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
        ? t(locale, 'Components.Pages.Conformance', node.localizationKey)
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
    const bundle = 'Components.Pages.Conformance';
    const eligible = eligibleResults(counts);
    const percentage = passPercentage(counts);
    const formattedPercentage = percentage.toFixed(1);
    const aria = t(locale, bundle, 'BarAria')
        .replace('{0}', String(counts.Pass))
        .replace('{1}', String(eligible))
        .replace('{2}', formattedPercentage);
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
    const bundle = 'Components.Pages.Conformance';
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
    const bundle = 'Components.Pages.Conformance';
    const itemValues: string[] = [];
    for (const bucket of buckets)
        itemValues.push(`<li><span class="conformance__legend-swatch conformance__bar-segment--${bucket.toLowerCase()}" aria-hidden="true"></span>${escapeHtml(t(locale, bundle, 'Outcome_' + bucket))}</li>`);
    const items = itemValues.join('');
    return `<ul class="conformance__legend" aria-label="${escapeHtml(t(locale, bundle, 'Legend_Label'))}">${items}</ul>`;
}

function renderSummaryCard(locale: Locale, titleKey: string, descriptionKey: string,
    counts: ResultCounts | null, modifier: string): string {
    const bundle = 'Components.Pages.Conformance';
    if (!counts)
        return '';
    return `<article class="conformance-summary__card conformance-summary__card--${modifier}"><p>${escapeHtml(t(locale, bundle, titleKey))}</p><strong>${passPercentage(counts).toFixed(1)}%</strong><span>${counts.Pass} / ${eligibleResults(counts)} ${escapeHtml(t(locale, bundle, 'Eligible'))}</span>${renderConformanceBar(locale, counts)}<small>${escapeHtml(t(locale, bundle, descriptionKey))}</small></article>`;
}

function renderSuiteControls(locale: Locale, suite: 'test262' | 'typescript'): string {
    const bundle = 'Components.Pages.Conformance';
    const mode = suite === 'test262' ? `<label>${escapeHtml(t(locale, bundle, 'Mode_Label'))}<select data-conformance-mode><option value="compare">${escapeHtml(t(locale, bundle, 'Mode_Compare'))}</option><option value="interpreted">${escapeHtml(t(locale, bundle, 'Interpreted'))}</option><option value="compiled">${escapeHtml(t(locale, bundle, 'Compiled'))}</option></select></label>` : '';
    return `<div class="conformance-suite__controls" data-conformance-suite-controls hidden>${mode}<label>${escapeHtml(t(locale, bundle, 'Status_Label'))}<select data-conformance-status><option value="all">${escapeHtml(t(locale, bundle, 'Status_All'))}</option><option value="passing">${escapeHtml(t(locale, bundle, 'Status_Passing'))}</option><option value="partial">${escapeHtml(t(locale, bundle, 'Status_Partial'))}</option><option value="zero">${escapeHtml(t(locale, bundle, 'Status_Zero'))}</option><option value="no-eligible">${escapeHtml(t(locale, bundle, 'Status_NoEligible'))}</option></select></label></div>`;
}

function renderConformanceSuite(locale: Locale, suite: 'test262' | 'typescript', nodes: ConformanceNode[]): string {
    const bundle = 'Components.Pages.Conformance';
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

function renderConformance(locale: Locale, data: ConformanceData): string {
    const bundle = 'Components.Pages.Conformance';
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

function renderDocument(locale: Locale, page: PageKind, browserAssets: BrowserAssets): string {
    const appBundle = 'Components.App';
    const pagePath = routePath(locale.culture, page);
    const canonical = siteOrigin + pagePath;
    const pageBundle = page === 'guide' ? 'Components.Pages.HowItWorks' : 'Components.Pages.Conformance';
    const title = page === 'home' ? t(locale, appBundle, 'Meta_Title') : t(locale, pageBundle, 'Meta_Title');
    const ogTitle = page === 'home' ? t(locale, appBundle, 'Og_Title') : title;
    const description = page === 'conformance'
        ? t(locale, 'Components.Pages.Conformance', 'Meta_Description')
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

buildSite(renderDocument, conformanceData);
