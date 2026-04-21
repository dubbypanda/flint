import React, { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import { type Note, type Folder, type Vault, type ViewMode } from './types';

interface State {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  openTabs: string[];
  viewMode: ViewMode;
  showGraphView: boolean;
  showSearch: boolean;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  activeVaultId: string | null;
}

type Action =
  | { type: 'SET_STATE'; payload: Partial<State> }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: { id: string; content?: string; title?: string; pinned?: boolean } }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'RENAME_FOLDER'; payload: { id: string; name: string } }
  | { type: 'DELETE_FOLDER'; payload: string }
  | { type: 'TOGGLE_FOLDER'; payload: string }
  | { type: 'SET_ACTIVE_NOTE'; payload: string | null }
  | { type: 'OPEN_TAB'; payload: string }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'TOGGLE_GRAPH_VIEW' }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'MOVE_NOTE'; payload: { noteId: string; folderId: string | null } }
  | { type: 'PIN_NOTE'; payload: string }
  | { type: 'LOAD_VAULT'; payload: State }
  | { type: 'CLEAR_VAULT' };

export const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

export const VAULTS_KEY = 'flint-vaults';
export const VAULT_DATA_PREFIX = 'flint-vault-';

const defaultFolders: Folder[] = [
  { id: 'folder-personal', name: 'Personal', parentId: null, collapsed: false },
  { id: 'folder-work', name: 'Work', parentId: null, collapsed: false },
  { id: 'folder-ideas', name: 'Ideas', parentId: null, collapsed: false },
];

const defaultNotes: Note[] = [
  {
    id: 'note-welcome',
    title: 'Welcome to Flint',
    content: `# Welcome to Flint 🔥

A **local-first**, secure knowledge base that lives on your machine. Your thoughts, your data, your control.

## Quick Start

1. **Create notes** — Click **+** in the sidebar or press \`Ctrl+N\`
2. **Link notes** — Use \`[[double brackets]]\` to connect ideas, like [[Getting Started]]
3. **Graph view** — Press \`Ctrl+G\` to visualize your knowledge graph
4. **Search** — Press \`Ctrl+Shift+F\` to search across all notes

## Features

| Feature | Description |
|---------|-------------|
| 📝 Markdown | Full GFM support with live preview |
| 🔗 Wiki Links | Connect notes with \`[[links]]\` |
| 🌐 Graph View | Interactive force-directed graph |
| 🔒 Local & Secure | All data stays on your machine |
| 📁 Folders | Organize notes hierarchically |
| 🔍 Search | Instant full-text search |
| 💾 Auto-save | Never lose your work |
| 🏪 Multi-vault | Separate workspaces for different projects |

## Markdown Examples

### Code
\`\`\`bash
# Install Flint
bash install.sh

# Update to latest version
bash update.sh
\`\`\`

### Task List
- [x] Install Flint
- [x] Create first note
- [ ] Build my knowledge graph

### Blockquote
> "The mind is not a vessel to be filled, but a fire to be kindled." — Plutarch

---

*Start building your second brain — locally, securely, forever.*
`,
    folderId: null,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
    pinned: true,
    tags: ['welcome', 'start'],
  },
  {
    id: 'note-started',
    title: 'Getting Started',
    content: `# Getting Started

## Creating Notes

Click the **+** icon in the sidebar or use \`Ctrl+N\`. Notes are automatically saved as you type.

## Linking Notes

Type \`[[note name]]\` to create a link to another note. If the note doesn't exist yet, the link will appear muted — click it to create the note.

You can also use aliases: \`[[Welcome to Flint|the welcome page]]\`

## Organization

- **Folders** — Right-click in the sidebar to create folders
- **Pinning** — Pin important notes for quick access
- **Tags** — Add tags in your notes for categorization

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+N\` | New note |
| \`Ctrl+E\` | Cycle view modes |
| \`Ctrl+G\` | Graph view |
| \`Ctrl+Shift+F\` | Search |
| \`Ctrl+\\\` | Toggle sidebar |
| \`Ctrl+S\` | Force save |

## Next Steps

Check out [[Daily Notes]] and [[Project Ideas]] to see wiki links in action.
`,
    folderId: null,
    createdAt: Date.now() - 80000000,
    updatedAt: Date.now() - 2000000,
    tags: ['guide'],
  },
  {
    id: 'note-daily',
    title: 'Daily Notes',
    content: `# Daily Notes

## Today's Tasks
- [ ] Review [[Project Ideas]]
- [ ] Update [[Meeting Notes]]
- [ ] Write in [[Journal]]

## Quick Thoughts
Remember to connect new ideas back to [[Welcome to Flint]] for context.

## References
- [[Project Ideas]]
- [[Meeting Notes]]
- [[Journal]]
- [[Getting Started]]
`,
    folderId: 'folder-personal',
    createdAt: Date.now() - 72000000,
    updatedAt: Date.now() - 1800000,
    tags: ['daily'],
  },
  {
    id: 'note-ideas',
    title: 'Project Ideas',
    content: `# Project Ideas 💡

## Web Projects
1. **Knowledge Graph Visualizer** — Interactive graph of interconnected ideas
2. **Markdown Editor** — Beautiful, distraction-free writing experience
3. **Habit Tracker** — Daily habits with streak tracking

## Learning Goals
- Deep dive into [[Daily Notes]] patterns
- Explore knowledge management systems
- Build a personal wiki

## Inspiration
> The best way to predict the future is to invent it.

See also: [[Welcome to Flint]] | [[Daily Notes]] | [[Getting Started]]
`,
    folderId: 'folder-ideas',
    createdAt: Date.now() - 50000000,
    updatedAt: Date.now() - 900000,
    tags: ['ideas', 'projects'],
  },
  {
    id: 'note-meeting',
    title: 'Meeting Notes',
    content: `# Meeting Notes

## Standup — Monday
**Attendees:** Team Alpha

### Discussion Points
1. Sprint progress review
2. Blockers and dependencies
3. Upcoming deadlines

### Action Items
- [ ] Follow up with design team
- [ ] Update [[Project Ideas]] with feedback
- [ ] Schedule next review

## Links
- [[Daily Notes]]
- [[Project Ideas]]
`,
    folderId: 'folder-work',
    createdAt: Date.now() - 30000000,
    updatedAt: Date.now() - 600000,
    tags: ['meeting', 'work'],
  },
  {
    id: 'note-journal',
    title: 'Journal',
    content: `# Journal 📝

## Today's Reflections

It's been a productive day. I spent time organizing my notes and creating meaningful connections between ideas.

The [[Welcome to Flint|knowledge base]] is shaping up nicely. I can see the graph growing every day.

### Gratitude
- Good coffee ☕
- Productive workflow
- New ideas for [[Project Ideas]]

### Tomorrow's Focus
- Continue with [[Daily Notes]]
- Explore new connections in the graph view
- Review [[Getting Started]] for any tips I missed
`,
    folderId: 'folder-personal',
    createdAt: Date.now() - 20000000,
    updatedAt: Date.now() - 300000,
    tags: ['journal', 'personal'],
  },
];

const initialState: State = {
  notes: defaultNotes,
  folders: defaultFolders,
  activeNoteId: 'note-welcome',
  openTabs: ['note-welcome'],
  viewMode: 'edit',
  showGraphView: false,
  showSearch: false,
  sidebarOpen: true,
  rightPanelOpen: false,
  activeVaultId: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };

    case 'ADD_NOTE':
      return {
        ...state,
        notes: [...state.notes, action.payload],
        activeNoteId: action.payload.id,
        openTabs: [...state.openTabs, action.payload.id],
      };

    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.payload.id
            ? { ...n, ...action.payload, updatedAt: Date.now() }
            : n
        ),
      };

    case 'DELETE_NOTE': {
      const newTabs = state.openTabs.filter((id) => id !== action.payload);
      const newActive =
        state.activeNoteId === action.payload
          ? newTabs[newTabs.length - 1] || null
          : state.activeNoteId;
      return {
        ...state,
        notes: state.notes.filter((n) => n.id !== action.payload),
        openTabs: newTabs,
        activeNoteId: newActive,
      };
    }

    case 'ADD_FOLDER':
      return {
        ...state,
        folders: [...state.folders, action.payload],
      };

    case 'RENAME_FOLDER':
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.payload.id ? { ...f, name: action.payload.name } : f
        ),
      };

    case 'DELETE_FOLDER':
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.payload),
        notes: state.notes.map((n) =>
          n.folderId === action.payload ? { ...n, folderId: null } : n
        ),
      };

    case 'TOGGLE_FOLDER':
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.payload ? { ...f, collapsed: !f.collapsed } : f
        ),
      };

    case 'SET_ACTIVE_NOTE':
      return { ...state, activeNoteId: action.payload };

    case 'OPEN_TAB': {
      const tabs = state.openTabs.includes(action.payload)
        ? state.openTabs
        : [...state.openTabs, action.payload];
      return { ...state, openTabs: tabs, activeNoteId: action.payload };
    }

    case 'CLOSE_TAB': {
      const idx = state.openTabs.indexOf(action.payload);
      const newTabs = state.openTabs.filter((id) => id !== action.payload);
      let newActive = state.activeNoteId;
      if (state.activeNoteId === action.payload) {
        newActive = newTabs[Math.min(idx, newTabs.length - 1)] || null;
      }
      return { ...state, openTabs: newTabs, activeNoteId: newActive };
    }

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'TOGGLE_GRAPH_VIEW':
      return { ...state, showGraphView: !state.showGraphView };

    case 'TOGGLE_SEARCH':
      return { ...state, showSearch: !state.showSearch };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'TOGGLE_RIGHT_PANEL':
      return { ...state, rightPanelOpen: !state.rightPanelOpen };

    case 'MOVE_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.payload.noteId
            ? { ...n, folderId: action.payload.folderId }
            : n
        ),
      };

    case 'PIN_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.payload ? { ...n, pinned: !n.pinned } : n
        ),
      };

    case 'LOAD_VAULT':
      return { ...action.payload, showSearch: false, showGraphView: false };

    case 'CLEAR_VAULT':
      return { ...initialState, activeVaultId: null, showSearch: false, showGraphView: false };

    default:
      return state;
  }
}

interface StoreContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  createNote: (folderId?: string | null, title?: string) => string;
  extractLinks: (content: string) => string[];
  getBacklinks: (noteId: string) => Note[];
  getNoteByTitle: (title: string) => Note | undefined;
  // Vault management
  vaults: Vault[];
  createVault: (name: string, color?: string) => string;
  openVault: (vaultId: string) => void;
  deleteVault: (vaultId: string) => void;
  renameVault: (vaultId: string, name: string) => void;
  closeVault: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

function getEmptyVaultState(vaultId: string): State {
  return {
    notes: [{
      id: 'note-first',
      title: 'Welcome to your Vault',
      content: `# Welcome to your new vault 🔥

This is your fresh workspace in **Flint**. Start writing, linking, and building your knowledge graph.

## Quick Tips
- Use \`[[double brackets]]\` to link notes
- Press \`Ctrl+G\` for graph view
- Press \`Ctrl+N\` for a new note

Happy writing!
`,
      folderId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: true,
    }],
    folders: [],
    activeNoteId: 'note-first',
    openTabs: ['note-first'],
    viewMode: 'edit',
    showGraphView: false,
    showSearch: false,
    sidebarOpen: true,
    rightPanelOpen: false,
    activeVaultId: vaultId,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [vaults, setVaults] = React.useState<Vault[]>(() => {
    try {
      const saved = localStorage.getItem(VAULTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Load last active vault on mount
  useEffect(() => {
    if (vaults.length > 0 && !state.activeVaultId) {
      const lastVault = [...vaults].sort((a, b) => b.lastOpened - a.lastOpened)[0];
      openVault(lastVault.id);
    }
  }, []);

  // Save vault data whenever state changes (if vault is active)
  useEffect(() => {
    if (!state.activeVaultId) return;
    try {
      const toSave = { ...state, showSearch: false, showGraphView: false };
      localStorage.setItem(VAULT_DATA_PREFIX + state.activeVaultId, JSON.stringify(toSave));
    } catch { /* storage full */ }
  }, [state]);

  // Save vaults list
  useEffect(() => {
    localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults));
  }, [vaults]);

  const createVault = useCallback((name: string, color: string = '#f59e0b'): string => {
    const id = generateId();
    const vault: Vault = {
      id,
      name,
      path: `~/.flint/vaults/${name.toLowerCase().replace(/\s+/g, '-')}`,
      createdAt: Date.now(),
      lastOpened: Date.now(),
      color,
    };
    setVaults(prev => [...prev, vault]);
    const vaultState = getEmptyVaultState(id);
    dispatch({ type: 'LOAD_VAULT', payload: vaultState });
    return id;
  }, []);

  const openVault = useCallback((vaultId: string) => {
    try {
      const saved = localStorage.getItem(VAULT_DATA_PREFIX + vaultId);
      if (saved) {
        const parsed = JSON.parse(saved);
        dispatch({ type: 'LOAD_VAULT', payload: { ...parsed, activeVaultId: vaultId, showSearch: false, showGraphView: false } });
      } else {
        dispatch({ type: 'LOAD_VAULT', payload: getEmptyVaultState(vaultId) });
      }
      setVaults(prev => prev.map(v => v.id === vaultId ? { ...v, lastOpened: Date.now() } : v));
    } catch {
      dispatch({ type: 'LOAD_VAULT', payload: getEmptyVaultState(vaultId) });
    }
  }, []);

  const deleteVault = useCallback((vaultId: string) => {
    setVaults(prev => prev.filter(v => v.id !== vaultId));
    localStorage.removeItem(VAULT_DATA_PREFIX + vaultId);
    if (state.activeVaultId === vaultId) {
      dispatch({ type: 'CLEAR_VAULT' });
    }
  }, [state.activeVaultId]);

  const renameVault = useCallback((vaultId: string, name: string) => {
    setVaults(prev => prev.map(v => v.id === vaultId ? { ...v, name } : v));
  }, []);

  const closeVault = useCallback(() => {
    if (state.activeVaultId) {
      const toSave = { ...state, showSearch: false, showGraphView: false };
      localStorage.setItem(VAULT_DATA_PREFIX + state.activeVaultId, JSON.stringify(toSave));
    }
    dispatch({ type: 'CLEAR_VAULT' });
  }, [state]);

  const extractLinks = useCallback((content: string): string[] => {
    const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const links: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1].trim());
    }
    return links;
  }, []);

  const getNoteByTitle = useCallback(
    (title: string): Note | undefined => {
      return state.notes.find(
        (n) => n.title.toLowerCase() === title.toLowerCase()
      );
    },
    [state.notes]
  );

  const getBacklinks = useCallback(
    (noteId: string): Note[] => {
      const note = state.notes.find((n) => n.id === noteId);
      if (!note) return [];
      return state.notes.filter((n) => {
        if (n.id === noteId) return false;
        const links = extractLinks(n.content);
        return links.some(
          (link) => link.toLowerCase() === note.title.toLowerCase()
        );
      });
    },
    [state.notes, extractLinks]
  );

  const createNote = useCallback(
    (folderId?: string | null, title?: string): string => {
      const id = generateId();
      const note: Note = {
        id,
        title: title || 'Untitled',
        content: '',
        folderId: folderId ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      dispatch({ type: 'ADD_NOTE', payload: note });
      return id;
    },
    []
  );

  return (
    <StoreContext.Provider
      value={{
        state, dispatch, createNote, extractLinks, getBacklinks, getNoteByTitle,
        vaults, createVault, openVault, deleteVault, renameVault, closeVault,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
