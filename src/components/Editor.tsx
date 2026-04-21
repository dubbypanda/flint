import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

export function Editor({ noteId }: { noteId: string }) {
  const { state, dispatch } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const note = state.notes.find(n => n.id === noteId);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch({ type: 'UPDATE_NOTE', payload: { id: noteId, content: e.target.value } });
  }, [dispatch, noteId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      dispatch({ type: 'UPDATE_NOTE', payload: { id: noteId, content: newValue } });
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
    }
  }, [dispatch, noteId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [noteId]);

  if (!note) return null;

  return (
    <textarea
      ref={textareaRef}
      value={note.content}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className="flint-editor"
      placeholder="Start writing..."
      spellCheck={false}
    />
  );
}
