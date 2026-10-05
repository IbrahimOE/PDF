// Lokale Ablage der PDFs (IndexedDB). Die Dateien verlassen das Gerät nicht –
// so bleibt die App kostenlos (kein Cloud Storage nötig) und privat.
import { openDB } from 'idb';

const dbPromise = openDB('pdf-atelier', 1, {
  upgrade(db) {
    const files = db.createObjectStore('files', { keyPath: 'id' });
    files.createIndex('uid', 'uid');
    db.createObjectStore('blobs', { keyPath: 'id' });
    const pages = db.createObjectStore('pages', { keyPath: 'key' });
    pages.createIndex('fileId', 'fileId');
    pages.createIndex('uid', 'uid');
    db.createObjectStore('thumbs', { keyPath: 'key' });
  },
});

export const pageKey = (fileId, index) => `${fileId}:${index}`;

export async function listFiles(uid) {
  const db = await dbPromise;
  const files = await db.getAllFromIndex('files', 'uid', uid);
  return files.sort((a, b) => a.addedAt - b.addedAt);
}

export async function listPages(uid) {
  const db = await dbPromise;
  return db.getAllFromIndex('pages', 'uid', uid);
}

export async function saveFile(meta, blob, pages) {
  const db = await dbPromise;
  const tx = db.transaction(['files', 'blobs', 'pages'], 'readwrite');
  tx.objectStore('files').put(meta);
  tx.objectStore('blobs').put({ id: meta.id, blob });
  for (const p of pages) tx.objectStore('pages').put(p);
  await tx.done;
}

export async function updateFile(meta) {
  const db = await dbPromise;
  await db.put('files', meta);
}

export async function updatePages(pages) {
  const db = await dbPromise;
  const tx = db.transaction('pages', 'readwrite');
  for (const p of pages) tx.store.put(p);
  await tx.done;
}

export async function getBlob(fileId) {
  const db = await dbPromise;
  const row = await db.get('blobs', fileId);
  return row?.blob ?? null;
}

export async function deleteFile(fileId, pageCount) {
  const db = await dbPromise;
  const tx = db.transaction(['files', 'blobs', 'pages', 'thumbs'], 'readwrite');
  tx.objectStore('files').delete(fileId);
  tx.objectStore('blobs').delete(fileId);
  for (let i = 0; i < pageCount; i++) {
    tx.objectStore('pages').delete(pageKey(fileId, i));
    tx.objectStore('thumbs').delete(pageKey(fileId, i));
  }
  await tx.done;
}

export async function getThumb(key) {
  const db = await dbPromise;
  return (await db.get('thumbs', key))?.blob ?? null;
}

export async function putThumb(key, blob) {
  const db = await dbPromise;
  await db.put('thumbs', { key, blob });
}

export async function storageEstimate() {
  try {
    const { usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return usage;
  } catch {
    return 0;
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {}
}
