import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Search, FileText } from 'lucide-react';

export function SearchModal() {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = query.trim()
    ? state.notes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.content.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      dispatch({ type: 'OPEN_TAB', payload: results[selectedIndex].id });
      dispatch({ type: 'TOGGLE_SEARCH' });
    } else if (e.key === 'Escape') {
      dispatch({ type: 'TOGGLE_SEARCH' });
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })} />
      <div className="relative w-full max-w-lg bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden animate-slide-in">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1a1a]">
          <Search size={14} className="text-[#555]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-[#444]"
          />
          <kbd className="text-[10px] text-[#444] bg-[#1a1a1a] px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[#444]">
              No results for "{query}"
            </div>
          )}
          {results.map((note, idx) => (
            <div
              key={note.id}
              className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors ${
                idx === selectedIndex ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'text-[#888] hover:bg-[#1a1a1a]'
              }`}
              onClick={() => {
                dispatch({ type: 'OPEN_TAB', payload: note.id });
                dispatch({ type: 'TOGGLE_SEARCH' });
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <FileText size={12} className={idx === selectedIndex ? 'text-[#f59e0b]' : 'text-[#333]'} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{note.title}</div>
                {note.content && (
                  <div className="text-[10px] text-[#444] truncate mt-0.5">
                    {note.content.substring(0, 80).replace(/[#*_\[\]]/g, '')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center gap-3 text-[10px] text-[#444]">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>Esc Close</span>
            <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
