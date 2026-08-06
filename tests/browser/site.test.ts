import { expect, it, vi } from 'vitest';
import { initializeSite } from '../../src/SharpTS.Www.SelfHost/browser/bootstrap';
import { createFakeEditor } from './fixtures';

it('wires playground controls before optional enhancements and preset loading complete', async () => {
    document.documentElement.className = 'preload';
    document.body.innerHTML = `<main>
      <div><canvas id="hero-particles"></canvas></div>
      <div data-playground data-running="false" data-placeholder="Run something" data-request-failed="Request failed" data-invalid-response="Invalid response">
        <select data-playground-preset><option value="">Preset</option><option value="Hello">Hello</option></select>
        <button data-playground-mode="interpret" aria-pressed="true">Interpret</button>
        <button data-playground-mode="compile" aria-pressed="false">Compile</button>
        <button data-playground-clear>Clear</button>
        <button data-playground-run aria-busy="false">Run</button>
        <div id="playground-editor"><textarea data-playground-editor>initial</textarea></div>
        <span data-playground-timing data-timing-compiled="compiled {0}ms / ran {1}ms" data-timing-executed="ran {0}ms" hidden></span>
        <div data-playground-output><span class="playground__placeholder">Run something</span></div>
      </div>
    </main>`;

    Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        }
    });
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => {
            throw new Error('optional canvas setup failed');
        }
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let resolvePresets!: (response: Response) => void;
    const pendingPresets = new Promise<Response>((resolve) => {
        resolvePresets = resolve;
    });
    const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => pendingPresets)
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    success: true,
                    output: 'whole page works\n',
                    errors: [],
                    executionTimeMs: 12,
                    compileTimeMs: 7
                }),
                { status: 200 }
            )
        );
    const editor = createFakeEditor();

    await initializeSite(document, window, { fetch: fetchMock, createEditor: () => editor });

    const preset = document.querySelector<HTMLSelectElement>('[data-playground-preset]')!;
    const compile = document.querySelector<HTMLButtonElement>('[data-playground-mode="compile"]')!;
    const run = document.querySelector<HTMLButtonElement>('[data-playground-run]')!;
    expect(preset.disabled).toBe(true);
    expect(preset.getAttribute('aria-busy')).toBe('true');

    compile.click();
    expect(compile.getAttribute('aria-pressed')).toBe('true');
    run.click();
    await vi.waitFor(() =>
        expect(document.querySelector('.playground__stdout')?.textContent).toBe('whole page works\n')
    );

    resolvePresets(
        new Response(JSON.stringify([{ name: 'Hello', description: 'Example', source: 'console.log("hello");' }]), {
            status: 200
        })
    );
    await vi.waitFor(() => {
        expect(preset.hasAttribute('aria-busy')).toBe(false);
        expect(preset.disabled).toBe(false);
    });
    preset.value = 'Hello';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.value).toBe('console.log("hello");');

    document.querySelector<HTMLButtonElement>('[data-playground-clear]')!.click();
    expect(document.querySelector('.playground__placeholder')?.textContent).toBe('Run something');
    expect(warning).toHaveBeenCalledWith("SharpTS site enhancement 'hero particles' was skipped.", expect.any(Error));
});
