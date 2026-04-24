// ============================================================
// Flint File System Service
// Uses the File System Access API to read/write local folders
// Stores directory handles in IndexedDB for persistence
// ============================================================

const DB_NAME = 'flint-fs';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeHandle(vaultId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, vaultId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHandle(vaultId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(vaultId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeHandle(vaultId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(vaultId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    const result = await handle.requestPermission({ mode: 'readwrite' });
    return result === 'granted';
  } catch {
    return false;
  }
}

// Read all .md files from a directory (flat, non-recursive for safety)
export async function readMarkdownFiles(handle: FileSystemDirectoryHandle): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      files.push({ name: entry.name.replace(/\.md$/, ''), content });
    }
  }
  return files;
}

// Read .md files from subdirectories too
export async function readAllMarkdownFiles(handle: FileSystemDirectoryHandle, prefix = ''): Promise<Array<{ name: string; content: string; path: string }>> {
  const files: Array<{ name: string; content: string; path: string }> = [];

  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      const noteName = entry.name.replace(/\.md$/, '');
      files.push({ name: noteName, content, path: prefix ? `${prefix}/${noteName}` : noteName });
    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
      const subHandle = entry as FileSystemDirectoryHandle;
      const subFiles = await readAllMarkdownFiles(subHandle, prefix ? `${prefix}/${entry.name}` : entry.name);
      files.push(...subFiles);
    }
  }

  return files;
}

// Write a markdown file to the directory
export async function writeMarkdownFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  content: string
): Promise<void> {
  const name = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// Delete a markdown file from the directory
export async function deleteMarkdownFile(
  handle: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> {
  const name = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  await handle.removeEntry(name);
}

// Create a subdirectory
export async function createDirectory(
  handle: FileSystemDirectoryHandle,
  dirName: string
): Promise<FileSystemDirectoryHandle> {
  return await handle.getDirectoryHandle(dirName, { create: true });
}

// Check if File System Access API is available
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window;
}
