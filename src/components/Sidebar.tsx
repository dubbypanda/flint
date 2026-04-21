import { useState } from 'react';
import { useStore } from '../store';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderPlus,
  Plus,
  Trash2,
  Pin,
  Flame,
  LogOut,
} from 'lucide-react';

export function Sidebar() {
  const { state, dispatch, createNote, closeVault } = useStore();
  const { notes, folders, activeNoteId } = state;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'note' | 'folder'; id: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const pinnedNotes = notes.filter(n => n.pinned);
  const rootNotes = notes.filter(n => !n.folderId && !n.pinned);

  const getFolderNotes = (folderId: string) => notes.filter(n => n.folderId === folderId);

  const handleContextMenu = (e: React.MouseEvent, type: 'note' | 'folder', id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const handleNoteClick = (noteId: string) => {
    dispatch({ type: 'OPEN_TAB', payload: noteId });
  };

  const handleCreateNote = (folderId?: string | null) => {
    createNote(folderId);
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div
      className="w-60 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col shrink-0 overflow-hidden select-none"
      onClick={closeContextMenu}
    >
      {/* Header */}
      <div className="px-3 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-[#f59e0b]" />
          <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">Explorer</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleCreateNote()}
            className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
            title="New note"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowNewFolder(true)}
            className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
            title="New folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="px-3 py-2 border-b border-[#1a1a1a]">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                dispatch({
                  type: 'ADD_FOLDER',
                  payload: {
                    id: Math.random().toString(36).substring(2, 11),
                    name: newFolderName.trim(),
                    parentId: null,
                    collapsed: false,
                  },
                });
                setNewFolderName('');
                setShowNewFolder(false);
              }
              if (e.key === 'Escape') {
                setNewFolderName('');
                setShowNewFolder(false);
              }
            }}
            placeholder="Folder name..."
            className="w-full bg-[#111] border border-[#222] rounded px-2 py-1 text-xs text-white placeholder-[#444] outline-none focus:border-[#f59e0b]/50"
            autoFocus
          />
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Pinned section */}
        {pinnedNotes.length > 0 && (
          <div className="mb-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-[#555] uppercase tracking-widest">
              <Pin size={9} />
              Pinned
            </div>
            {pinnedNotes.map(note => (
              <NoteItem
                key={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                onClick={() => handleNoteClick(note.id)}
                onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
              />
            ))}
          </div>
        )}

        {/* Root notes */}
        {rootNotes.length > 0 && (
          <div className="mb-1">
            {rootNotes.map(note => (
              <NoteItem
                key={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                onClick={() => handleNoteClick(note.id)}
                onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
              />
            ))}
          </div>
        )}

        {/* Folders */}
        {folders.map(folder => {
          const folderNotes = getFolderNotes(folder.id);
          return (
            <div key={folder.id} className="mb-0.5">
              <div
                className="flex items-center gap-1 px-3 py-1 text-xs text-[#777] hover:text-[#bbb] hover:bg-[#111] cursor-pointer transition-colors group"
                onClick={() => dispatch({ type: 'TOGGLE_FOLDER', payload: folder.id })}
                onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
              >
                {folder.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="truncate flex-1">{folder.name}</span>
                <span className="text-[10px] text-[#444] group-hover:text-[#666]">{folderNotes.length}</span>
              </div>
              {!folder.collapsed && folderNotes.map(note => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  onClick={() => handleNoteClick(note.id)}
                  onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
                  indent
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Close vault */}
      <div className="border-t border-[#1a1a1a] p-2">
        <button
          onClick={closeVault}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#555] hover:text-[#aaa] hover:bg-[#111] transition-colors"
        >
          <LogOut size={12} />
          Close vault
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#151515] border border-[#2a2a2a] rounded-lg shadow-xl py-1 z-[200] min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'note' && (
            <>
              <button
                onClick={() => {
                  dispatch({ type: 'PIN_NOTE', payload: contextMenu.id });
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#aaa] hover:bg-[#222] hover:text-white transition-colors"
              >
                <Pin size={12} />
                {notes.find(n => n.id === contextMenu.id)?.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'DELETE_NOTE', payload: contextMenu.id });
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
          {contextMenu.type === 'folder' && (
            <>
              <button
                onClick={() => {
                  handleCreateNote(contextMenu.id);
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#aaa] hover:bg-[#222] hover:text-white transition-colors"
              >
                <Plus size={12} />
                New note here
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'DELETE_FOLDER', payload: contextMenu.id });
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete folder
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NoteItem({ note, isActive, onClick, onContextMenu, indent }: {
  note: { id: string; title: string };
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer transition-colors text-xs ${
        indent ? 'pl-7' : 'pl-5'
      } ${
        isActive
          ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-r-2 border-[#f59e0b]'
          : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <FileText size={12} className={isActive ? 'text-[#f59e0b]' : 'text-[#444]'} />
      <span className="truncate">{note.title}</span>
    </div>
  );
}
