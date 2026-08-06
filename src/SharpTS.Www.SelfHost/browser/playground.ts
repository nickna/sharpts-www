import { createEditor, type EditorAdapter } from './editor';
import {
    isExecutionResponse,
    isPresetArray,
    type ExecutionPhaseTiming,
    type ExecutionResponse,
    type Preset
} from '../../SharpTS.Www.Shared/execution-contract';

export interface PlaygroundDependencies {
    fetch?: typeof fetch;
    createEditor?: (container: HTMLElement) => EditorAdapter;
    now?: () => number;
}

function replaceTiming(template: string, first: string | number, second?: string | number): string {
    let result = template.replace('{0}', String(first));
    if (second !== undefined)
        result = result.replace('{1}', String(second));
    return result;
}

export function formatDuration(durationMs: number, locale: string = 'en'): string {
    const duration = Math.max(0, durationMs);
    if (duration < 1)
        return '<1 ms';
    const formatter = new Intl.NumberFormat(locale, duration < 10
        ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
        : { maximumFractionDigits: 0 });
    return formatter.format(duration) + ' ms';
}

function phaseDataStem(name: string): string {
    return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function phaseText(root: HTMLElement, phase: ExecutionPhaseTiming, kind: 'name' | 'description'): string {
    const localized = root.getAttribute(`data-phase-${phaseDataStem(phase.name)}-${kind}`);
    return localized || phase.name;
}

function isSharpTsPhase(phase: ExecutionPhaseTiming): boolean {
    return phase.name !== 'queue' && phase.name !== 'isolatedWorker';
}

function setTimingDisabled(timing: HTMLElement, disabled: boolean): void {
    const buttonConstructor = timing.ownerDocument.defaultView?.HTMLButtonElement;
    if (buttonConstructor && timing instanceof buttonConstructor)
        (timing as HTMLButtonElement).disabled = disabled;
    timing.classList.toggle('playground__timing--legacy', disabled);
}

function appendError(doc: Document, container: HTMLElement, message: string): void {
    let errors = container.querySelector<HTMLElement>('.playground__errors');
    if (!errors) {
        errors = doc.createElement('div');
        errors.className = 'playground__errors';
        container.appendChild(errors);
    }
    const error = doc.createElement('div');
    error.className = 'playground__error';
    error.textContent = message;
    errors.appendChild(error);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
    try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === 'string' && body.error.length > 0)
            return new Error(body.error);
    } catch {
        // The stable localized fallback is safer than exposing an invalid body.
    }
    return new Error(fallback);
}

export async function initializePlayground(
    root: HTMLElement,
    dependencies: PlaygroundDependencies = {}
): Promise<void> {
    const doc = root.ownerDocument;
    const win = doc.defaultView || window;
    const fetchRequest = dependencies.fetch || win.fetch.bind(win);
    const now = dependencies.now || (() => win.performance.now());
    const editorContainer = root.querySelector<HTMLElement>('#playground-editor');
    const presetSelect = root.querySelector<HTMLSelectElement>('[data-playground-preset]');
    const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-playground-mode]'));
    const clearButton = root.querySelector<HTMLButtonElement>('[data-playground-clear]');
    const runButton = root.querySelector<HTMLButtonElement>('[data-playground-run]');
    const output = root.querySelector<HTMLElement>('[data-playground-output]');
    const timing = root.querySelector<HTMLElement>('[data-playground-timing]');
    if (!editorContainer || !presetSelect || !clearButton || !runButton || !output || !timing)
        return;

    const timingHeadline = timing.querySelector<HTMLElement>('[data-playground-timing-headline]');
    const timingDetails = root.querySelector<HTMLElement>('[data-playground-timing-details]');
    const timingPhases = root.querySelector<HTMLElement>('[data-playground-timing-phases]');
    const timingDescription = root.querySelector<HTMLElement>('[data-playground-timing-description]');
    const timingPipeline = root.querySelector<HTMLElement>('[data-playground-timing-pipeline]');
    const timingTotal = root.querySelector<HTMLElement>('[data-playground-timing-total]');
    const supportsJourney = Boolean(
        timingHeadline && timingDetails && timingPhases && timingDescription &&
        timingPipeline && timingTotal);
    const editor = (dependencies.createEditor || createEditor)(editorContainer);
    const placeholder = root.dataset.placeholder || '';
    const requestFailed = root.dataset.requestFailed || 'The playground request failed.';
    const invalidResponse = root.dataset.invalidResponse || requestFailed;
    const locale = doc.documentElement.lang || 'en';
    let presets: Preset[] = [];
    let mode = 'interpret';
    let running = false;
    let hasJourney = false;
    let activeRequest: AbortController | null = null;
    presetSelect.disabled = true;
    presetSelect.setAttribute('aria-busy', 'true');

    const setMode = (nextMode: string): void => {
        mode = nextMode === 'compile' ? 'compile' : 'interpret';
        modeButtons.forEach(button => {
            const active = button.dataset.playgroundMode === mode;
            button.classList.toggle('playground__mode-btn--active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    };

    const resetTiming = (): void => {
        hasJourney = false;
        timing.hidden = true;
        timing.setAttribute('aria-expanded', 'false');
        setTimingDisabled(timing, false);
        if (timingHeadline)
            timingHeadline.textContent = '';
        else
            timing.textContent = '';
        if (timingDetails)
            timingDetails.hidden = true;
        timingPhases?.replaceChildren();
        if (timingDescription) timingDescription.textContent = '';
        if (timingPipeline) timingPipeline.textContent = '';
        if (timingTotal) timingTotal.textContent = '';
    };

    const renderPlaceholder = (): void => {
        output.replaceChildren();
        const text = doc.createElement('span');
        text.className = 'playground__placeholder';
        text.textContent = placeholder;
        output.appendChild(text);
        resetTiming();
    };

    const selectPhase = (selected: HTMLButtonElement): void => {
        if (!timingPhases || !timingDescription)
            return;
        const phaseButtons = Array.from(
            timingPhases.querySelectorAll<HTMLButtonElement>('[data-playground-timing-phase]'));
        phaseButtons.forEach(button => {
            const active = button === selected;
            button.setAttribute('aria-pressed', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        timingDescription.textContent = selected.dataset.phaseDescription || '';
    };

    const renderJourney = (body: ExecutionResponse, roundTripMs: number): void => {
        if (!body.timings || !supportsJourney || !timingHeadline || !timingDetails ||
            !timingPhases || !timingDescription || !timingPipeline || !timingTotal)
            return;

        timingPhases.replaceChildren();
        const phases = body.timings.phases.filter(isSharpTsPhase);
        if (phases.length === 0)
            return;
        const completedLabel = root.dataset.timingStatusCompleted || 'completed';
        const failedLabel = root.dataset.timingStatusFailed || 'failed';
        const buttons: HTMLButtonElement[] = [];
        phases.forEach((phase, index) => {
            const name = phaseText(root, phase, 'name');
            const duration = formatDuration(phase.durationMs, locale);
            const status = phase.status === 'failed' ? failedLabel : completedLabel;
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'playground__timing-phase';
            button.dataset.playgroundTimingPhase = phase.name;
            button.dataset.phaseStatus = phase.status;
            button.dataset.phaseDescription = phaseText(root, phase, 'description');
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', `${name}, ${duration}, ${status}`);
            button.tabIndex = -1;
            button.style.setProperty('--phase-index', String(index));

            const nameElement = doc.createElement('span');
            nameElement.className = 'playground__timing-phase-name';
            nameElement.textContent = name;
            const durationElement = doc.createElement('span');
            durationElement.className = 'playground__timing-phase-duration';
            durationElement.textContent = duration;
            button.append(nameElement, durationElement);
            button.addEventListener('click', () => selectPhase(button));
            button.addEventListener('keydown', event => {
                const currentIndex = buttons.indexOf(button);
                let nextIndex = currentIndex;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                    nextIndex = Math.min(buttons.length - 1, currentIndex + 1);
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                    nextIndex = Math.max(0, currentIndex - 1);
                else if (event.key === 'Home')
                    nextIndex = 0;
                else if (event.key === 'End')
                    nextIndex = buttons.length - 1;
                else
                    return;
                event.preventDefault();
                selectPhase(buttons[nextIndex]);
                buttons[nextIndex].focus();
            });
            buttons.push(button);
            timingPhases.appendChild(button);
        });

        const executionPhase = phases.find(phase => phase.name === 'execute');
        let failedPhase: ExecutionPhaseTiming | undefined;
        for (const phase of phases) {
            if (phase.status === 'failed')
                failedPhase = phase;
        }
        if (executionPhase) {
            timingHeadline.textContent = replaceTiming(
                root.dataset.timingHeadline || 'Executed in {0}',
                formatDuration(executionPhase.durationMs, locale));
        } else if (failedPhase) {
            timingHeadline.textContent = replaceTiming(
                root.dataset.timingFailedHeadline || '{0} failed',
                phaseText(root, failedPhase, 'name'));
        } else {
            timingHeadline.textContent = replaceTiming(
                root.dataset.timingHeadline || 'Executed in {0}',
                formatDuration(body.executionTimeMs, locale));
        }
        timing.setAttribute('aria-label', timingHeadline.textContent || 'Execution phases');

        const pipelineDuration = phases.reduce((total, phase) => total + phase.durationMs, 0);
        timingPipeline.textContent = replaceTiming(
            root.dataset.timingSharpTsPipeline || 'SharpTS pipeline: {0}',
            formatDuration(pipelineDuration, locale));
        timingTotal.textContent = replaceTiming(
            root.dataset.timingEndToEnd || 'End to end: {0}',
            formatDuration(roundTripMs, locale));

        const initialPhase = executionPhase || failedPhase || phases.at(-1);
        const initialButton = initialPhase
            ? buttons[phases.indexOf(initialPhase)]
            : undefined;
        if (initialButton)
            selectPhase(initialButton);

        timingDetails.hidden = true;
        timing.setAttribute('aria-expanded', 'false');
        timing.hidden = false;
        setTimingDisabled(timing, false);
        hasJourney = true;
    };

    const renderLegacyTiming = (body: ExecutionResponse): void => {
        const compiledTemplate = timing.dataset.timingCompiled || 'compiled {0}ms · ran {1}ms';
        const executedTemplate = timing.dataset.timingExecuted || '{0}ms';
        const text = body.compileTimeMs === null
            ? replaceTiming(executedTemplate, body.executionTimeMs)
            : replaceTiming(compiledTemplate, body.compileTimeMs, body.executionTimeMs);
        if (timingHeadline)
            timingHeadline.textContent = text;
        else
            timing.textContent = text;
        timing.setAttribute('aria-label', text);
        timing.hidden = false;
        setTimingDisabled(timing, true);
    };

    const setRunning = (value: boolean): void => {
        running = value;
        root.dataset.running = String(value);
        runButton.disabled = value;
        runButton.setAttribute('aria-busy', String(value));
    };

    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            setMode(button.dataset.playgroundMode || 'interpret');
        });
    });
    setMode('interpret');

    timing.addEventListener('click', () => {
        if (!hasJourney || !timingDetails)
            return;
        const expanded = timing.getAttribute('aria-expanded') !== 'true';
        timing.setAttribute('aria-expanded', String(expanded));
        timingDetails.hidden = !expanded;
    });

    clearButton.addEventListener('click', renderPlaceholder);
    presetSelect.addEventListener('change', () => {
        const preset = presets.find(candidate => candidate.name === presetSelect.value);
        if (!preset)
            return;
        editor.setValue(preset.source);
        renderPlaceholder();
        editor.focus();
    });

    const run = async (): Promise<void> => {
        if (running)
            return;
        setRunning(true);
        output.replaceChildren();
        resetTiming();
        activeRequest = new AbortController();
        const roundTripStartedAt = now();
        try {
            const response = await fetchRequest('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ source: editor.getValue(), timeoutMs: 5000, mode }),
                signal: activeRequest.signal
            });
            if (!response.ok)
                throw await responseError(response, requestFailed);
            const body: unknown = await response.json();
            const roundTripMs = Math.max(0, now() - roundTripStartedAt);
            if (!isExecutionResponse(body))
                throw new Error(invalidResponse);

            if (body.output.length > 0) {
                const stdout = doc.createElement('pre');
                stdout.className = 'playground__stdout';
                stdout.textContent = body.output;
                output.appendChild(stdout);
            }
            body.errors.forEach(error => {
                appendError(doc, output, error.message);
            });
            if (body.output.length === 0 && body.errors.length === 0) {
                const text = doc.createElement('span');
                text.className = 'playground__placeholder';
                text.textContent = placeholder;
                output.appendChild(text);
            }

            if (body.timings)
                renderJourney(body, roundTripMs);
            else
                renderLegacyTiming(body);
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                appendError(doc, output, error instanceof Error ? error.message : requestFailed);
        } finally {
            activeRequest = null;
            setRunning(false);
        }
    };

    runButton.addEventListener('click', () => { void run(); });
    root.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void run();
        }
    });
    win.addEventListener('pagehide', () => activeRequest?.abort(), { once: true });

    try {
        const response = await fetchRequest('/api/presets', { headers: { 'Accept': 'application/json' } });
        if (!response.ok)
            return;
        const body: unknown = await response.json();
        if (!isPresetArray(body))
            return;
        presets = body;
        const firstOption = presetSelect.options[0];
        presetSelect.replaceChildren(firstOption);
        presets.forEach(preset => {
            const option = doc.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            presetSelect.appendChild(option);
        });
    } catch {
        // The default editor and execution remain usable when presets are unavailable.
    } finally {
        // Preset loading is an enhancement. It must never lock the static
        // selector or any of the independently functional playground controls.
        presetSelect.disabled = false;
        presetSelect.removeAttribute('aria-busy');
    }
}
