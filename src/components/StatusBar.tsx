import { useStore } from '../store';
import { Flame, Lock } from 'lucide-react';

export function StatusBar() {
  const { state } = useStore();
  const { activeNoteId, notes, viewMode } = state;
  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-[#0a0a0a] border-t border-[#1a1a1a] text-[10px] text-[#444] shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Flame size={10} className="text-[#f59e0b]" />
          <span>Flint</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock size={8} className="text-[#22c55e]" />
          <span>Local</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {activeNote && (
          <>
            <span>{activeNote.content.split(/\s+/).filter(Boolean).length} words</span>
            <span>{activeNote.content.length} chars</span>
          </>
        )}
        <span className="capitalize">{viewMode}</span>
      </div>
    </div>
  );
}
