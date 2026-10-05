// Zentraler App-Zustand mit einfachem Ereignis-System.
export const state = {
  backendMode: 'demo',
  user: null,
  profile: null,
  files: [], // Datei-Metadaten in Bibliotheksreihenfolge
  pages: new Map(), // key → Seite { key, fileId, index, text, heading, width, height }
  selection: [], // [{ id, key, fileId, index, rotation }]
  view: 'grid', // 'grid' | 'list'
  query: '',
  expanded: new Set(), // aufgeklappte Dateien in der Listenansicht
  processing: null, // { name, done, total }
  ocr: new Map(), // fileId → { done, total }
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => fn(payload));
}

export function pagesOfFile(fileId) {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return [];
  const out = [];
  for (let i = 0; i < file.pageCount; i++) {
    const p = state.pages.get(`${fileId}:${i}`);
    if (p) out.push(p);
  }
  return out;
}

export function allPagesOrdered() {
  return state.files.flatMap((f) => pagesOfFile(f.id));
}

export function selectionIndex(key) {
  return state.selection.findIndex((s) => s.key === key);
}
