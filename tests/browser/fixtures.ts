import { vi } from 'vitest';
import type { EditorAdapter } from '../../src/SharpTS.Www.SelfHost/browser/editor';

export interface FakeEditor extends EditorAdapter {
    value: string;
}

export function createFakeEditor(initialValue: string = 'initial'): FakeEditor {
    const editor: FakeEditor = {
        kind: 'textarea',
        value: initialValue,
        getValue: () => editor.value,
        setValue: value => { editor.value = value; },
        focus: vi.fn(),
        destroy: vi.fn()
    };
    return editor;
}
