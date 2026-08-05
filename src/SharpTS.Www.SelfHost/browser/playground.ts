import { createEditor, type EditorAdapter } from './editor';

interface Preset {
    name: string;
    description: string;
    source: string;
}

interface RunError {
    message: string;
    line: number | null;
    column: number | null;
}

interface RunResponse {
    success: boolean;
    output: string;
    errors: RunError[];
    executionTimeMs: number;
    compileTimeMs: number | null;
}

export interface PlaygroundDependencies {
    fetch?: typeof fetch;
    createEditor?: (container: HTMLElement) => EditorAdapter;
}

function isPresetArray(value: unknown): value is Preset[] {
    return Array.isArray(value) && value.every(preset =>
        typeof preset?.name === 'string' && typeof preset?.source === 'string');
}

function isRunResponse(value: unknown): value is RunResponse {
    if (!value || typeof value !== 'object')
        return false;
    const response = value as Partial<RunResponse>;
    return typeof response.success === 'boolean' &&
        typeof response.output === 'string' &&
        Array.isArray(response.errors) &&
        response.errors.every(error => typeof error?.message === 'string') &&
        typeof response.executionTimeMs === 'number' &&
        (response.compileTimeMs === null || typeof response.compileTimeMs === 'number');
}

function replaceTiming(template: string, first: number, second?: number): string {
    let result = template.replace('{0}', String(first));
    if (second !== undefined)
        result = result.replace('{1}', String(second));
    return result;
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
    const editorContainer = root.querySelector<HTMLElement>('#playground-editor');
    const presetSelect = root.querySelector<HTMLSelectElement>('[data-playground-preset]');
    const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-playground-mode]'));
    const clearButton = root.querySelector<HTMLButtonElement>('[data-playground-clear]');
    const runButton = root.querySelector<HTMLButtonElement>('[data-playground-run]');
    const output = root.querySelector<HTMLElement>('[data-playground-output]');
    const timing = root.querySelector<HTMLElement>('[data-playground-timing]');
    if (!editorContainer || !presetSelect || !clearButton || !runButton || !output || !timing)
        return;

    const editor = (dependencies.createEditor || createEditor)(editorContainer);
    const placeholder = root.dataset.placeholder || '';
    const requestFailed = root.dataset.requestFailed || 'The playground request failed.';
    const invalidResponse = root.dataset.invalidResponse || requestFailed;
    let presets: Preset[] = [];
    let mode = 'interpret';
    let running = false;
    let activeRequest: AbortController | null = null;
    presetSelect.setAttribute('aria-busy', 'true');

    const setMode = (nextMode: string): void => {
        mode = nextMode === 'compile' ? 'compile' : 'interpret';
        modeButtons.forEach(button => {
            const active = button.dataset.playgroundMode === mode;
            button.classList.toggle('playground__mode-btn--active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    };

    const renderPlaceholder = (): void => {
        output.replaceChildren();
        const text = doc.createElement('span');
        text.className = 'playground__placeholder';
        text.textContent = placeholder;
        output.appendChild(text);
        timing.hidden = true;
        timing.textContent = '';
    };

    const setRunning = (value: boolean): void => {
        running = value;
        root.dataset.running = String(value);
        runButton.disabled = value;
        runButton.setAttribute('aria-busy', String(value));
    };

    modeButtons.forEach(button => button.addEventListener('click', () => {
        setMode(button.dataset.playgroundMode || 'interpret');
    }));
    setMode('interpret');

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
        timing.hidden = true;
        activeRequest = new AbortController();
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
            if (!isRunResponse(body))
                throw new Error(invalidResponse);

            if (body.output.length > 0) {
                const stdout = doc.createElement('pre');
                stdout.className = 'playground__stdout';
                stdout.textContent = body.output;
                output.appendChild(stdout);
            }
            body.errors.forEach(error => appendError(doc, output, error.message));
            if (body.output.length === 0 && body.errors.length === 0)
                renderPlaceholder();

            const compiledTemplate = timing.dataset.timingCompiled || 'compiled {0}ms · ran {1}ms';
            const executedTemplate = timing.dataset.timingExecuted || '{0}ms';
            timing.textContent = body.compileTimeMs === null
                ? replaceTiming(executedTemplate, body.executionTimeMs)
                : replaceTiming(compiledTemplate, body.compileTimeMs, body.executionTimeMs);
            timing.hidden = false;
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
