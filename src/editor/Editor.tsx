import React, { useEffect, useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { tableEditing, columnResizing } from 'prosemirror-tables';
import { parseMarkdown } from './parser';
import { serializeMarkdown } from './serializer';
import { getCorePlugins } from './plugins';
import { buildKeymap } from './keymap';

import './theme.css';

interface EditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  editorRef?: React.MutableRefObject<EditorView | null>;
}

export const Editor: React.FC<EditorProps> = ({ markdown, onChange, editorRef }) => {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentMarkdownRef = useRef<string>(markdown);

  useEffect(() => {
    if (!editorHostRef.current) return;

    // Parse initial markdown
    const initialDoc = parseMarkdown(markdown);

    // Create state
    const state = EditorState.create({
      doc: initialDoc,
      plugins: [
        ...getCorePlugins(),
        keymap(buildKeymap()),
        columnResizing({}),
        tableEditing(),
      ],
    });

    // Create view
    const view = new EditorView(editorHostRef.current, {
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);

        // Check if doc changed
        if (transaction.docChanged) {
          const newMarkdown = serializeMarkdown(newState.doc);
          currentMarkdownRef.current = newMarkdown;
          onChange(newMarkdown);
        }
      },
    });

    viewRef.current = view;
    if (editorRef) {
      editorRef.current = view;
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef) {
        editorRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Watch for external markdown updates (e.g. file loaded)
  useEffect(() => {
    if (!viewRef.current) return;

    if (markdown !== currentMarkdownRef.current) {
      currentMarkdownRef.current = markdown;
      const parsedDoc = parseMarkdown(markdown);
      
      const { state } = viewRef.current;
      const tr = state.tr;
      
      // Replace entire doc content
      tr.replaceWith(0, state.doc.content.size, parsedDoc.content);
      viewRef.current.dispatch(tr);
    }
  }, [markdown]);

  return (
    <div className="editor-host-wrapper">
      <div ref={editorHostRef} className="editor-host" />
    </div>
  );
};

export default Editor;
