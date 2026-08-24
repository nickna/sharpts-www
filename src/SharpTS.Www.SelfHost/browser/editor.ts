import { basicSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { color as oneDarkColor, oneDarkHighlightStyle, oneDarkTheme } from '@codemirror/theme-one-dark';

const accessibleMuted = '#9aa3b2';
const accessibleCoral = '#ed7a84';
const accessibleOneDarkHighlightStyle = HighlightStyle.define(
    oneDarkHighlightStyle.specs.map((specification) => {
        if (specification.color === oneDarkColor.stone)
            return { ...specification, color: accessibleMuted };
        if (specification.color === oneDarkColor.coral)
            return { ...specification, color: accessibleCoral };
        return specification;
    })
);

export interface EditorAdapter {
    getValue(): string;
    setValue(value: string): void;
    focus(): void;
    destroy(): void;
    kind: 'codemirror' | 'textarea';
}

function textareaAdapter(textarea: HTMLTextAreaElement): EditorAdapter {
    return {
        kind: 'textarea',
        getValue: () => textarea.value,
        setValue: value => { textarea.value = value; },
        focus: () => textarea.focus(),
        destroy: () => undefined
    };
}

export function createEditor(container: HTMLElement): EditorAdapter {
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-playground-editor]');
    if (!textarea)
        throw new Error('The playground fallback editor is missing.');

    const host = container.ownerDocument.createElement('div');
    try {
        host.className = 'playground__codemirror-host';
        container.appendChild(host);
        const state = EditorState.create({
            doc: textarea.value,
            extensions: [
                basicSetup,
                javascript({ typescript: true }),
                oneDarkTheme,
                syntaxHighlighting(accessibleOneDarkHighlightStyle),
                EditorView.contentAttributes.of({ 'aria-label': 'TypeScript source editor' }),
                EditorView.theme({
                    '&': { height: '100%', fontSize: '14px' },
                    '.cm-scroller': {
                        overflow: 'auto',
                        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace"
                    },
                    '.cm-content': { padding: '12px 0' },
                    '.cm-gutters': { backgroundColor: '#1e1e2e', border: 'none' }
                }),
                keymap.of([])
            ]
        });
        const view = new EditorView({ state, parent: host });
        view.scrollDOM.tabIndex = 0;
        view.scrollDOM.setAttribute('aria-label', 'TypeScript source editor scroll area');
        textarea.hidden = true;
        container.dataset.editorKind = 'codemirror';
        return {
            kind: 'codemirror',
            getValue: () => view.state.doc.toString(),
            setValue: value => view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: value }
            }),
            focus: () => view.focus(),
            destroy: () => {
                view.destroy();
                host.remove();
                textarea.hidden = false;
            }
        };
    } catch {
        host.remove();
        textarea.hidden = false;
        container.dataset.editorKind = 'textarea';
        return textareaAdapter(textarea);
    }
}
