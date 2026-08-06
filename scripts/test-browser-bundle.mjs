import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const repoRoot = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(repoRoot, 'artifacts', 'self-host', 'public');
const browserRoot = path.join(repoRoot, 'artifacts', 'browser-assets');
const htmlPath = path.join(publicRoot, 'index.html');
const browserManifest = JSON.parse(fs.readFileSync(path.join(browserRoot, 'browser-manifest.json'), 'utf8'));
const bundlePath = path.join(browserRoot, browserManifest.entry.script);

if (!fs.existsSync(htmlPath) || !fs.existsSync(bundlePath))
    throw new Error('The generated site is missing. Run the self-host build first.');

const browserErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (error) => browserErrors.push(String(error)));
virtualConsole.on('jsdomError', (error) => browserErrors.push(String(error)));

const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'http://localhost/',
    virtualConsole
});

const { window } = dom;
const emptyRect = {
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({})
};
window.Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: () => [][Symbol.iterator]()
});
window.Range.prototype.getBoundingClientRect = () => emptyRect;
window.matchMedia = () => ({
    matches: true,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
});
window.fetch = async (input, init) => {
    const requestPath = String(input);
    if (requestPath === '/api/presets') {
        return {
            ok: true,
            json: async () => [
                {
                    name: 'Hello World',
                    description: 'Example',
                    source: 'console.log("bundle preset");'
                }
            ]
        };
    }
    if (requestPath === '/api/run' && init?.method === 'POST') {
        const request = JSON.parse(String(init.body));
        return {
            ok: true,
            json: async () => ({
                success: true,
                output: `${request.mode} bundle works\n`,
                errors: [],
                executionTimeMs: 5,
                compileTimeMs: request.mode === 'compile' ? 8 : null
            })
        };
    }
    return { ok: false, json: async () => ({ error: 'Unexpected request.' }) };
};

async function waitFor(predicate, label) {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${label}.`);
}

try {
    const globals = {
        window,
        Window: window.Window,
        document: window.document,
        Document: window.Document,
        navigator: window.navigator,
        Node: window.Node,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        HTMLTextAreaElement: window.HTMLTextAreaElement,
        Event: window.Event,
        CustomEvent: window.CustomEvent,
        KeyboardEvent: window.KeyboardEvent,
        MouseEvent: window.MouseEvent,
        Text: window.Text,
        Range: window.Range,
        MutationObserver: window.MutationObserver,
        DOMException: window.DOMException,
        getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        cancelAnimationFrame: window.cancelAnimationFrame.bind(window)
    };
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, {
            configurable: true,
            writable: true,
            value
        });
    }
    await import(`${pathToFileURL(bundlePath).href}?test=${Date.now()}`);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const preset = window.document.querySelector('[data-playground-preset]');
    const compile = window.document.querySelector('[data-playground-mode="compile"]');
    const run = window.document.querySelector('[data-playground-run]');
    if (!preset || !compile || !run) throw new Error('Generated playground controls are missing.');

    await waitFor(
        () => preset.options.length === 2 && preset.getAttribute('aria-busy') === null,
        'lazy playground and preset loading'
    );
    if (preset.disabled) throw new Error('The generated preset selector remained disabled.');

    preset.value = 'Hello World';
    preset.dispatchEvent(new window.Event('change', { bubbles: true }));
    compile.click();
    if (compile.getAttribute('aria-pressed') !== 'true')
        throw new Error('The generated compile-mode button did not respond.');

    run.click();
    await waitFor(
        () => window.document.querySelector('.playground__stdout')?.textContent === 'compile bundle works\n',
        'compiled playground output'
    );

    if (browserErrors.length > 0)
        throw new Error(`Generated browser bundle reported errors:\n${browserErrors.join('\n')}`);

    console.log('Generated browser bundle passed: presets, mode controls, and Run are responsive.');
} finally {
    window.close();
}
