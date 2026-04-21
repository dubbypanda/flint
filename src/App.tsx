import { useEffect, useCallback } from 'react';
import { StoreProvider, useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { GraphView } from './components/GraphView';
import { SearchModal } from './components/SearchModal';
import { StatusBar } from './components/StatusBar';
import { BacklinksPanel } from './components/BacklinksPanel';
import { VaultScreen } from './components/VaultScreen';
import {
  PanelLeftOpen,
  PenLine,
  Eye,
  Columns2,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  Waypoints,
  Search,
  Flame,
} from 'lucide-react';

function AppContent() {
  const { state, dispatch, createNote } = useStore();
  const { activeNoteId, viewMode, showGraphView, showSearch, sidebarOpen, rightPanelOpen, activeVaultId } = state;

  // Show vault screen if no vault is active
  if (!activeVaultId) {
    return <VaultScreen />;
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SEARCH' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_GRAPH_VIEW' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (viewMode === 'edit') dispatch({ type: 'SET_VIEW_MODE', payload: 'preview' });
        else if (viewMode === 'preview') dispatch({ type: 'SET_VIEW_MODE', payload: 'split' });
        else dispatch({ type: 'SET_VIEW_MODE', payload: 'edit' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SIDEBAR' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, createNote, viewMode]);

  const renderMainContent = useCallback(() => {
    if (!activeNoteId) {
      return (
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1a1200] flex items-center justify-center mx-auto mb-5">
              <Flame size={28} className="text-[#f59e0b]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1.5">Flint</h2>
            <p className="text-xs text-[#555] mb-6 max-w-[250px] leading-relaxed">
              Create a new note or select one from the sidebar to begin.
            </p>
            <div className="flex items-center gap-2 justify-center">
              <button
                onClick={() => createNote()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black rounded-lg text-xs font-medium transition-colors"
              >
                <Plus size={13} />
                New Note
              </button>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#111] hover:bg-[#1a1a1a] text-[#888] rounded-lg text-xs border border-[#1e1e1e] transition-colors"
              >
                <Waypoints size={13} />
                Graph
              </button>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3 text-[10px] text-[#333]">
              <span className="flex items-center gap-1">
                <kbd className="bg-[#111] px-1 py-0.5 rounded border border-[#1e1e1e]">Ctrl+N</kbd>
                New
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-[#111] px-1 py-0.5 rounded border border-[#1e1e1e]">Ctrl+G</kbd>
                Graph
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-[#111] px-1 py-0.5 rounded border border-[#1e1e1e]">Ctrl+⇧+F</kbd>
                Search
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-black">
        <TabBar />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a] bg-[#0a0a0a]">
          <div className="flex items-center gap-0.5">
            {!sidebarOpen && (
              <button
                onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
                title="Open sidebar"
              >
                <PanelLeftOpen size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-[#111] rounded-md p-0.5 border border-[#1e1e1e]">
            <button
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'edit' })}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'edit' ? 'bg-[#f59e0b] text-black' : 'text-[#555] hover:text-[#888]'
              }`}
            >
              <PenLine size={11} />
              Edit
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'split' })}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'split' ? 'bg-[#f59e0b] text-black' : 'text-[#555] hover:text-[#888]'
              }`}
            >
              <Columns2 size={11} />
              Split
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'preview' })}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'preview' ? 'bg-[#f59e0b] text-black' : 'text-[#555] hover:text-[#888]'
              }`}
            >
              <Eye size={11} />
              Preview
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
              className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
              title="Graph View (Ctrl+G)"
            >
              <Waypoints size={14} />
            </button>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}
              className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
              title="Search (Ctrl+Shift+F)"
            >
              <Search size={14} />
            </button>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })}
              className="p-1 rounded hover:bg-[#1a1a1a] text-[#555] hover:text-[#aaa] transition-colors"
              title="Toggle backlinks"
            >
              {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {viewMode === 'edit' && (
            <div className="flex-1 overflow-hidden">
              <Editor noteId={activeNoteId} />
            </div>
          )}
          {viewMode === 'preview' && (
            <div className="flex-1 overflow-hidden">
              <Preview noteId={activeNoteId} />
            </div>
          )}
          {viewMode === 'split' && (
            <>
              <div className="flex-1 overflow-hidden border-r border-[#1a1a1a]">
                <Editor noteId={activeNoteId} />
              </div>
              <div className="flex-1 overflow-hidden">
                <Preview noteId={activeNoteId} />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }, [activeNoteId, viewMode, sidebarOpen, rightPanelOpen, dispatch, createNote]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-black">
      <div className="flex-1 flex min-h-0">
        {/* Ribbon */}
        <div className="flex flex-col items-center py-2 gap-1 bg-[#0a0a0a] border-r border-[#1a1a1a]" style={{ width: 40 }}>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              sidebarOpen ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : 'text-[#444] hover:bg-[#1a1a1a] hover:text-[#888]'
            }`}
            title="Toggle sidebar (Ctrl+\\)"
          >
            <PanelLeftOpen size={14} />
          </button>

          <div className="w-5 border-t border-[#1a1a1a] my-0.5" />

          <button
            onClick={() => createNote()}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#888] transition-colors"
            title="New note (Ctrl+N)"
          >
            <Plus size={14} />
          </button>

          <button
            onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#888] transition-colors"
            title="Search (Ctrl+Shift+F)"
          >
            <Search size={14} />
          </button>

          <button
            onClick={() => dispatch({ type: 'TOGGLE_GRAPH_VIEW' })}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#444] hover:bg-[#1a1a1a] hover:text-[#888] transition-colors"
            title="Graph View (Ctrl+G)"
          >
            <Waypoints size={14} />
          </button>

          <div className="flex-1" />

          <button
            onClick={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              rightPanelOpen ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : 'text-[#444] hover:bg-[#1a1a1a] hover:text-[#888]'
            }`}
            title="Toggle backlinks"
          >
            <PanelRightOpen size={14} />
          </button>
        </div>

        {/* Sidebar */}
        {sidebarOpen && <Sidebar />}

        {/* Main Content */}
        {renderMainContent()}

        {/* Right Panel */}
        {rightPanelOpen && activeNoteId && <BacklinksPanel />}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Modals */}
      {showGraphView && <GraphView />}
      {showSearch && <SearchModal />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
