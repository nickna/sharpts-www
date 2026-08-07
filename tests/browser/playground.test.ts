import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '../../src/SharpTS.Www.SelfHost/browser/editor';
import { formatDuration, initializePlayground } from '../../src/SharpTS.Www.SelfHost/browser/playground';
import { createFakeEditor } from './fixtures';

function playgroundMarkup(): HTMLElement {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `<div data-playground data-running="false" data-placeholder="Run something" data-request-failed="Request failed" data-invalid-response="Invalid response"
      data-timing-headline="Executed in {0}" data-timing-failed-headline="{0} failed"
      data-timing-sharp-ts-pipeline="SharpTS pipeline: {0}" data-timing-end-to-end="End to end: {0}"
      data-timing-status-completed="completed" data-timing-status-failed="failed"
      data-phase-tokenize-name="Tokenize" data-phase-tokenize-description="Tokenize details"
      data-phase-parse-name="Parse" data-phase-parse-description="Parse details"
      data-phase-validate-modules-name="Validate modules" data-phase-validate-modules-description="Validate details"
      data-phase-type-check-name="Type check" data-phase-type-check-description="Type details"
      data-phase-compile-name="Compile" data-phase-compile-description="Compile details"
      data-phase-analyze-dead-code-name="Analyze dead code" data-phase-analyze-dead-code-description="Dead code details"
      data-phase-serialize-assembly-name="Serialize assembly" data-phase-serialize-assembly-description="Serialize details"
      data-phase-load-name="Load" data-phase-load-description="Load details"
      data-phase-execute-name="Execute" data-phase-execute-description="Execute details">
      <select data-playground-preset><option value="">Preset</option></select>
      <button data-playground-mode="interpret"></button><button data-playground-mode="compile"></button>
      <button data-playground-clear></button><button data-playground-run aria-busy="false"></button>
      <div id="playground-editor"><textarea data-playground-editor>initial</textarea></div>
      <button data-playground-timing data-timing-compiled="compiled {0}ms / ran {1}ms" data-timing-executed="ran {0}ms" aria-expanded="false" hidden><span data-playground-timing-headline></span></button>
      <div data-playground-timing-details hidden>
        <div data-playground-timing-phases></div><p data-playground-timing-description></p>
        <span data-playground-timing-pipeline></span><span data-playground-timing-total></span>
      </div>
      <div data-playground-output></div>
    </div>`;
    return document.querySelector<HTMLElement>('[data-playground]')!;
}

describe('playground controller', () => {
    beforeEach(() => document.body.replaceChildren());

    it('keeps a working editor adapter with progressive enhancement', () => {
        document.body.innerHTML = '<div id="editor"><textarea data-playground-editor>initial</textarea></div>';
        const adapter = createEditor(document.querySelector<HTMLElement>('#editor')!);
        adapter.setValue('updated');
        expect(adapter.getValue()).toBe('updated');
        expect(['codemirror', 'textarea']).toContain(adapter.kind);
        adapter.destroy();
    });

    it('formats phase durations adaptively', () => {
        expect(formatDuration(0.25)).toBe('<1 ms');
        expect(formatDuration(4.26)).toBe('4.3 ms');
        expect(formatDuration(12.6)).toBe('13 ms');
    });

    it('loads presets and executes the selected mode', async () => {
        const root = playgroundMarkup();
        const editor = createFakeEditor();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([{ name: 'Hello', description: 'Example', source: 'console.log("hello");' }]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        success: true,
                        output: 'hello\n',
                        errors: [],
                        executionTimeMs: 12,
                        compileTimeMs: 20,
                        timings: {
                            serverDurationMs: 90,
                            phases: [
                                { name: 'queue', durationMs: 2, status: 'completed' },
                                { name: 'isolatedWorker', durationMs: 3, status: 'completed' },
                                { name: 'tokenize', durationMs: 0.4, status: 'completed' },
                                { name: 'parse', durationMs: 4.26, status: 'completed' },
                                { name: 'validateModules', durationMs: 0.3, status: 'completed' },
                                { name: 'typeCheck', durationMs: 10.4, status: 'completed' },
                                { name: 'analyzeDeadCode', durationMs: 0.1, status: 'completed' },
                                { name: 'initializeCompiler', durationMs: 0.1, status: 'completed' },
                                { name: 'prepareCompilation', durationMs: 0.1, status: 'completed' },
                                { name: 'extractNamespaces', durationMs: 0.1, status: 'completed' },
                                { name: 'emitRuntimeTypes', durationMs: 0.1, status: 'completed' },
                                { name: 'analyzeClosures', durationMs: 0.1, status: 'completed' },
                                { name: 'defineProgramStructure', durationMs: 0.1, status: 'completed' },
                                { name: 'analyzeModuleBindings', durationMs: 0.1, status: 'completed' },
                                { name: 'defineDeclarations', durationMs: 0.1, status: 'completed' },
                                { name: 'collectFunctions', durationMs: 0.1, status: 'completed' },
                                { name: 'emitFunctionBodies', durationMs: 0.1, status: 'completed' },
                                { name: 'emitMethodBodies', durationMs: 0.1, status: 'completed' },
                                { name: 'emitEntryPoint', durationMs: 0.1, status: 'completed' },
                                { name: 'finalizeTypes', durationMs: 0.1, status: 'completed' },
                                { name: 'serializeAssembly', durationMs: 0.1, status: 'completed' },
                                { name: 'load', durationMs: 0.6, status: 'completed' },
                                { name: 'execute', durationMs: 2.2, status: 'completed' }
                            ]
                        }
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
            );

        const clock = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
        await initializePlayground(root, { fetch: fetchMock, createEditor: () => editor, now: clock });
        const select = root.querySelector<HTMLSelectElement>('[data-playground-preset]')!;
        expect(select.options).toHaveLength(2);
        select.value = 'Hello';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(editor.value).toBe('console.log("hello");');

        root.querySelector<HTMLButtonElement>('[data-playground-mode="compile"]')!.click();
        root.querySelector<HTMLButtonElement>('[data-playground-run]')!.click();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));

        const request = fetchMock.mock.calls[1][1] as RequestInit;
        expect(JSON.parse(String(request.body))).toMatchObject({ mode: 'compile', source: 'console.log("hello");' });
        expect(root.querySelector('.playground__stdout')?.textContent).toBe('hello\n');
        const timing = root.querySelector<HTMLButtonElement>('[data-playground-timing]')!;
        const details = root.querySelector<HTMLElement>('[data-playground-timing-details]')!;
        expect(root.querySelector('[data-playground-timing-headline]')?.textContent).toBe('Executed in 12 ms');
        expect(timing.getAttribute('aria-expanded')).toBe('false');
        expect(details.hidden).toBe(true);

        timing.click();
        expect(timing.getAttribute('aria-expanded')).toBe('true');
        expect(details.hidden).toBe(false);
        expect(root.querySelector('[data-playground-timing-phase="execute"]')?.getAttribute('aria-pressed')).toBe(
            'true'
        );
        expect(root.querySelectorAll('[data-playground-timing-phase]')).toHaveLength(21);
        expect(root.querySelector('[data-playground-timing-phase="queue"]')).toBeNull();
        expect(root.querySelector('[data-playground-timing-phase="isolatedWorker"]')).toBeNull();
        expect(root.querySelector('[data-playground-timing-phase="compile"]')).toBeNull();
        expect(root.querySelector('[data-playground-timing-phase="serializeAssembly"]')?.textContent).toContain(
            'Serialize assembly'
        );
        expect(root.querySelector('[data-playground-timing-pipeline]')?.textContent).toBe('SharpTS pipeline: 32 ms');
        expect(root.querySelector('[data-playground-timing-total]')?.textContent).toBe('End to end: 100 ms');

        root.querySelector<HTMLButtonElement>('[data-playground-timing-phase="parse"]')!.click();
        expect(root.querySelector('[data-playground-timing-description]')?.textContent).toBe('Parse details');

        select.value = 'Hello';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(timing.hidden).toBe(true);
        expect(root.querySelectorAll('[data-playground-timing-phase]')).toHaveLength(0);

        root.querySelector<HTMLButtonElement>('[data-playground-clear]')!.click();
        expect(timing.hidden).toBe(true);
        expect(root.querySelectorAll('[data-playground-timing-phase]')).toHaveLength(0);
    });

    it('renders server errors as text rather than markup', async () => {
        const root = playgroundMarkup();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        success: false,
                        output: '',
                        errors: [{ message: '<img src=x onerror=alert(1)>', line: null, column: null }],
                        executionTimeMs: 1,
                        compileTimeMs: null
                    }),
                    { status: 200 }
                )
            );

        await initializePlayground(root, { fetch: fetchMock, createEditor: () => createFakeEditor() });
        root.querySelector<HTMLButtonElement>('[data-playground-run]')!.click();
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));

        expect(root.querySelector('.playground__error')?.textContent).toContain('<img');
        expect(root.querySelector('.playground__error img')).toBeNull();
        expect(root.querySelector('[data-playground-timing-headline]')?.textContent).toBe('ran 1ms');
    });

    it('replaces the previous journey and renders only reached failure phases', async () => {
        const root = playgroundMarkup();
        const response = (durationMs: number, failed: boolean) =>
            new Response(
                JSON.stringify({
                    success: !failed,
                    output: '',
                    errors: failed ? [{ message: 'Type Error: boom', line: null, column: null }] : [],
                    executionTimeMs: failed ? 0 : durationMs,
                    compileTimeMs: null,
                    timings: {
                        serverDurationMs: 20,
                        phases: failed
                            ? [
                                  { name: 'queue', durationMs: 1, status: 'completed' },
                                  { name: 'isolatedWorker', durationMs: 2, status: 'completed' },
                                  { name: 'tokenize', durationMs: 1, status: 'completed' },
                                  { name: 'parse', durationMs: 2, status: 'completed' },
                                  { name: 'validateModules', durationMs: 1, status: 'completed' },
                                  { name: 'typeCheck', durationMs: 4, status: 'failed' }
                              ]
                            : [
                                  { name: 'queue', durationMs: 1, status: 'completed' },
                                  { name: 'isolatedWorker', durationMs: 2, status: 'completed' },
                                  { name: 'execute', durationMs, status: 'completed' }
                              ]
                    }
                }),
                { status: 200 }
            );
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(response(2, false))
            .mockResolvedValueOnce(response(0, true));
        const clock = vi
            .fn()
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(25)
            .mockReturnValueOnce(100)
            .mockReturnValueOnce(125);

        await initializePlayground(root, {
            fetch: fetchMock,
            createEditor: () => createFakeEditor(),
            now: clock
        });
        const run = root.querySelector<HTMLButtonElement>('[data-playground-run]')!;
        run.click();
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));
        expect(root.querySelector('[data-playground-timing-headline]')?.textContent).toBe('Executed in 2.0 ms');

        run.click();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));
        expect(root.querySelector('[data-playground-timing-headline]')?.textContent).toBe('Type check failed');
        expect(root.querySelectorAll('[data-playground-timing-phase]')).toHaveLength(4);
        expect(root.querySelector('[data-playground-timing-phase="execute"]')).toBeNull();
        expect(root.querySelector('[data-playground-timing-phase="typeCheck"]')?.getAttribute('aria-pressed')).toBe(
            'true'
        );
    });

    it('keeps infrastructure-only failures out of the timing journey', async () => {
        const root = playgroundMarkup();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        success: false,
                        output: '',
                        errors: [{ message: 'Execution was terminated.', line: null, column: null }],
                        executionTimeMs: 0,
                        compileTimeMs: null,
                        timings: {
                            serverDurationMs: 25,
                            phases: [
                                { name: 'queue', durationMs: 1, status: 'completed' },
                                { name: 'isolatedWorker', durationMs: 24, status: 'failed' }
                            ]
                        }
                    }),
                    { status: 200 }
                )
            );

        await initializePlayground(root, {
            fetch: fetchMock,
            createEditor: () => createFakeEditor(),
            now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(25)
        });
        root.querySelector<HTMLButtonElement>('[data-playground-run]')!.click();
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));

        expect(root.querySelector('.playground__error')?.textContent).toBe('Execution was terminated.');
        expect(root.querySelector<HTMLButtonElement>('[data-playground-timing]')!.hidden).toBe(true);
        expect(root.querySelectorAll('[data-playground-timing-phase]')).toHaveLength(0);
    });

    it('shows stable errors for unavailable and invalid API responses', async () => {
        const root = playgroundMarkup();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: 'Execution service is busy.' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));

        await initializePlayground(root, { fetch: fetchMock, createEditor: () => createFakeEditor() });
        const run = root.querySelector<HTMLButtonElement>('[data-playground-run]')!;
        run.click();
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));
        expect(root.querySelector('.playground__error')?.textContent).toBe('Execution service is busy.');

        run.click();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));
        expect(root.querySelector('.playground__error')?.textContent).toBe('Invalid response');
    });
});
