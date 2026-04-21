import { useStore } from '../store';
import { X, FileText } from 'lucide-react';

export function TabBar() {
  const { state, dispatch } = useStore();
  const { openTabs, activeNoteId, notes } = state;

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center bg-[#0a0a0a] border-b border-[#1a1a1a] overflow-x-auto shrink-0">
      {openTabs.map(tabId => {
        const note = notes.find(n => n.id === tabId);
        if (!note) return null;
        const isActive = tabId === activeNoteId;
        return (
          <div
            key={tabId}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-r border-[#1a1a1a] cursor-pointer group shrink-0 transition-colors text-xs ${
              isActive
                ? 'bg-[#111] text-[#e0e0e0]'
                : 'bg-[#0a0a0a] text-[#555] hover:text-[#888] hover:bg-[#0f0f0f]'
            }`}
            onClick={() => dispatch({ type: 'OPEN_TAB', payload: tabId })}
          >
            <FileText size={11} className={isActive ? 'text-[#f59e0b]' : 'text-[#333]'} />
            <span className="max-w-[120px] truncate">{note.title}</span>
            {isActive && note.content !== undefined && (
              <span className="w-1 h-1 rounded-full bg-[#f59e0b]" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'CLOSE_TAB', payload: tabId });
              }}
              className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#222] text-[#555] hover:text-[#aaa] transition-all"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
