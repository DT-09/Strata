import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';

type Props = { value: string; onChange: (value: string) => void };

const strataTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0d0e12', color: '#ddd9d1', fontSize: '11px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: "'DM Mono', monospace", lineHeight: '1.75' },
  '.cm-gutters': { backgroundColor: '#111216', color: '#5f6069', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#1b1c22' },
  '.cm-activeLine': { backgroundColor: '#17181d' },
  '.cm-cursor': { borderLeftColor: '#c49a6c' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#514231 !important' },
  '.cm-tooltip': { backgroundColor: '#191a20', border: '1px solid #393a42', color: '#e5e2dc' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#393024' },
}, { dark: true });

export function SqlEditor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        sql(),
        oneDark,
        strataTheme,
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = null; };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div className="sql-editor-host" ref={host} />;
}
