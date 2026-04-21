import { useStore } from '../store';
import { ArrowRight, Link } from 'lucide-react';

export function BacklinksPanel() {
  const { state, dispatch, getBacklinks, extractLinks, getNoteByTitle } = useStore();
  const { activeNoteId, notes } = state;

  if (!activeNoteId) return null;

  const activeNote = notes.find(n => n.id === activeNoteId);
  if (!activeNote) return null;

  const backlinks = getBacklinks(activeNoteId);
  const outgoingLinks = extractLinks(activeNote.content);
  const outgoingNotes = outgoingLinks
    .map(title => getNoteByTitle(title))
    .filter((n): n is NonNullable<typeof n> => n !== undefined);

  return (
    <div className="w-56 bg-[#0a0a0a] border-l border-[#1a1a1a] flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-3 border-b border-[#1a1a1a]">
        <h3 className="text-[10px] font-semibold text-[#555] uppercase tracking-widest">Backlinks</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {backlinks.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] text-[#333]">No backlinks yet</div>
        ) : (
          backlinks.map(note => (
            <div
              key={note.id}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#111] transition-colors text-xs text-[#777] hover:text-[#bbb]"
              onClick={() => dispatch({ type: 'OPEN_TAB', payload: note.id })}
            >
              <ArrowRight size={10} className="text-[#f59e0b] shrink-0" />
              <span className="truncate">{note.title}</span>
            </div>
          ))
        )}
      </div>

      {/* Outgoing links */}
      {outgoingNotes.length > 0 && (
        <>
          <div className="px-3 py-3 border-t border-b border-[#1a1a1a]">
            <h3 className="text-[10px] font-semibold text-[#555] uppercase tracking-widest">Outgoing</h3>
          </div>
          <div className="overflow-y-auto">
            {outgoingNotes.map(note => (
              <div
                key={note.id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#111] transition-colors text-xs text-[#777] hover:text-[#bbb]"
                onClick={() => dispatch({ type: 'OPEN_TAB', payload: note.id })}
              >
                <Link size={10} className="text-[#444] shrink-0" />
                <span className="truncate">{note.title}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
