import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '../../src/SharpTS.Www.SelfHost/browser/editor';
import { initializePlayground } from '../../src/SharpTS.Www.SelfHost/browser/playground';
import { createFakeEditor } from './fixtures';

function playgroundMarkup(): HTMLElement {
    document.body.innerHTML = `<div data-playground data-running="false" data-placeholder="Run something" data-request-failed="Request failed" data-invalid-response="Invalid response">
      <select data-playground-preset><option value="">Preset</option></select>
      <button data-playground-mode="interpret"></button><button data-playground-mode="compile"></button>
      <button data-playground-clear></button><button data-playground-run aria-busy="false"></button>
      <div id="playground-editor"><textarea data-playground-editor>initial</textarea></div>
      <span data-playground-timing data-timing-compiled="compiled {0}ms / ran {1}ms" data-timing-executed="ran {0}ms" hidden></span>
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

    it('loads presets and executes the selected mode', async () => {
        const root = playgroundMarkup();
        const editor = createFakeEditor();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify([
                { name: 'Hello', description: 'Example', source: 'console.log("hello");' }
            ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: true,
                output: 'hello\n',
                errors: [],
                executionTimeMs: 12,
                compileTimeMs: 7
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await initializePlayground(root, { fetch: fetchMock, createEditor: () => editor });
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
        expect(root.querySelector('[data-playground-timing]')?.textContent).toBe('compiled 7ms / ran 12ms');
    });

    it('renders server errors as text rather than markup', async () => {
        const root = playgroundMarkup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: false,
                output: '',
                errors: [{ message: '<img src=x onerror=alert(1)>', line: null, column: null }],
                executionTimeMs: 1,
                compileTimeMs: null
            }), { status: 200 }));

        await initializePlayground(root, { fetch: fetchMock, createEditor: () => createFakeEditor() });
        root.querySelector<HTMLButtonElement>('[data-playground-run]')!.click();
        await vi.waitFor(() => expect(root.dataset.running).toBe('false'));

        expect(root.querySelector('.playground__error')?.textContent).toContain('<img');
        expect(root.querySelector('.playground__error img')).toBeNull();
    });

    it('shows stable errors for unavailable and invalid API responses', async () => {
        const root = playgroundMarkup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('[]', { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Execution service is busy.' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }))
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
