import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SearchModal() {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = query.trim()
    ? state.notes.filter(n => n.title.toLowerCase().includes(query.toLowerCase()) || n.content.toLowerCase().includes(query.toLowerCase()))
    : [];

  useEffect(() => { setIdx(0); }, [query]);

  return (
    <div 
      className="fixed inset-0 animate-fade-in" 
      style={{ zIndex: 150, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}
      role="presentation">
      <div 
        className="animate-scale-in" 
        role="dialog"
        aria-modal="true"
        aria-label={t('searchModal.searchNotesAria')}
        style={{ width: 480, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid #1a1a1a' }}>
          <Search size={14} style={{ color: '#444' }} aria-hidden="true" />
          <label htmlFor="search-input" className="sr-only">{t('searchModal.title')}</label>
          <input 
            id="search-input"
            ref={inputRef} 
            type="text" 
            placeholder={t('searchModal.placeholder')}
            value={query}
            aria-label={t('searchModal.queryAria')}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', color: '#bbb', fontSize: 14, outline: 'none' }} />
        </div>
        <div 
          id="search-results"
          style={{ maxHeight: 300, overflowY: 'auto' }}>
          {results.length === 0 && query.trim() && (
            <div style={{ padding: '16px 14px', color: '#333', fontSize: 13 }}>{t('searchModal.noResults')}</div>
          )}
          {results.map((note) => (
            <div 
              key={note.id} 
              className="flex items-center gap-2 cursor-pointer"
              style={{ padding: '8px 14px', background: 'transparent', borderLeft: '2px solid transparent', transition: 'all 0.08s' }}
              onClick={() => { dispatch({ type: 'OPEN_TAB', payload: note.id }); dispatch({ type: 'TOGGLE_SEARCH' }); }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#bbb' }}>{note.title}</div>
                <div style={{ fontSize: 11, color: '#333', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {note.content.replace(/[#*\[\]`]/g, '').substring(0, 80)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 14px', borderTop: '1px solid #1a1a1a', fontSize: 10, color: '#333', display: 'flex', gap: 12 }} aria-hidden="true">
          <span>↑↓ {t('searchModal.navigate')}</span><span>↵ {t('searchModal.open')}</span><span>{t('searchModal.escClose')}</span>
        </div>
      </div>
    </div>
  );
}
