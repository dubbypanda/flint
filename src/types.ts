export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  collapsed?: boolean;
}

export interface Vault {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastOpened: number;
  color: string;
}

export type ViewMode = 'edit' | 'preview' | 'split';

export interface AppState {
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
