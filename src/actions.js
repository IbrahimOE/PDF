import { state, emit, pagesOfFile, selectionIndex } from './state.js';
import * as db from './services/db.js';
import { analyzePdf, forgetDoc, dropThumbnails, PdfError } from './services/pdf.js';
import { t } from './i18n/index.js';
import { toast } from './ui/toast.js';

const prefsKey = () => `pa_prefs_${state.user?.uid}`;

function savePrefs() {
  if (!state.user) return;
  try {
    localStorage.setItem(
      prefsKey(),
      JSON.stringify({
        view: state.view,
        selection: state.selection.map(({ key, rotation }) => ({ key, rotation })),
      })
    );
  } catch {}
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(prefsKey())) || {};
  } catch {
    return {};
  }
}

function reindexFileOrder() {
  state.files.forEach((f, order) => {
    for (let i = 0; i < f.pageCount; i++) {
      const p = state.pages.get(db.pageKey(f.id, i));
      if (p) p.fileOrder = order;
    }
  });
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function makeSelItem(key, rotation = 0) {
  const p = state.pages.get(key);
  return p ? { id: newId(), key, fileId: p.fileId, index: p.index, rotation } : null;
}

// ---------- Bibliothek ----------

export async function loadLibrary() {
  const uid = state.user.uid;
  const [files, pages] = await Promise.all([db.listFiles(uid), db.listPages(uid)]);
  state.files = files;
  state.pages = new Map(pages.map((p) => [p.key, p]));
  reindexFileOrder();
  const prefs = loadPrefs();
  state.view = prefs.view === 'list' ? 'list' : 'grid';
  state.selection = (prefs.selection || []).map((s) => makeSelItem(s.key, s.rotation)).filter(Boolean);
  state.query = '';
  state.expanded = new Set();
  emit('files');
  emit('selection');
  emit('view');
  db.requestPersistence();
}

export function resetLibrary() {
  state.files.forEach((f) => {
    forgetDoc(f.id);
    dropThumbnails(f.id, f.pageCount);
  });
  state.files = [];
  state.pages = new Map();
  state.selection = [];
  state.query = '';
}

const isPdf = (file) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

export async function importFiles(fileList) {
  const files = [...fileList];
  const pdfs = [];
  for (const f of files) {
    if (isPdf(f)) pdfs.push(f);
    else toast(t('library.notPdf', { name: f.name }), 'warn');
  }
  if (!pdfs.length) return [];

  const added = [];
  for (const file of pdfs) {
    state.processing = { name: file.name, done: 0, total: 0 };
    emit('processing');
    try {
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)));
      if (!header.includes('%PDF')) throw Object.assign(new Error('no pdf'), { code: PdfError.BROKEN });

      const result = await analyzePdf(new Uint8Array(buffer.slice(0)), (done, total) => {
        state.processing = { name: file.name, done, total };
        emit('processing');
      });

      const id = newId();
      const meta = {
        id,
        uid: state.user.uid,
        name: file.name || 'Dokument.pdf',
        size: blob.size,
        pageCount: result.pageCount,
        addedAt: Date.now(),
      };
      const pages = result.pages.map((p) => ({
        key: db.pageKey(id, p.index),
        uid: state.user.uid,
        fileId: id,
        ...p,
      }));
      await db.saveFile(meta, blob, pages);
      state.files.push(meta);
      pages.forEach((p) => state.pages.set(p.key, p));
      reindexFileOrder();
      added.push(meta);
      emit('files');
    } catch (e) {
      console.error(e);
      if (e?.name === 'QuotaExceededError') toast(t('library.storageFull'), 'error');
      else if (e?.code === PdfError.ENCRYPTED) toast(t('library.encrypted', { name: file.name }), 'error');
      else toast(t('library.broken', { name: file.name }), 'error');
    }
  }
  state.processing = null;
  emit('processing');
  if (added.length) toast(t('library.imported', { n: added.length }), 'success');
  return added;
}

export async function addSample() {
  const { buildSamplePdf } = await import('./services/merge.js');
  const bytes = await buildSamplePdf(t);
  const file = new File([bytes], t('library.sampleName'), { type: 'application/pdf' });
  return importFiles([file]);
}

export async function removeFile(fileId) {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return;
  await db.deleteFile(fileId, file.pageCount);
  forgetDoc(fileId);
  dropThumbnails(fileId, file.pageCount);
  state.files = state.files.filter((f) => f.id !== fileId);
  for (let i = 0; i < file.pageCount; i++) state.pages.delete(db.pageKey(fileId, i));
  state.selection = state.selection.filter((s) => s.fileId !== fileId);
  state.expanded.delete(fileId);
  reindexFileOrder();
  emit('files');
  emit('selection');
  savePrefs();
}

// ---------- Auswahl ----------

function selectionChanged() {
  emit('selection');
  savePrefs();
}

export function togglePage(key) {
  const i = selectionIndex(key);
  if (i === -1) {
    const item = makeSelItem(key);
    if (item) state.selection.push(item);
  } else {
    state.selection.splice(i, 1);
  }
  selectionChanged();
}

export function selectKeys(keys) {
  let added = 0;
  for (const key of keys) {
    if (selectionIndex(key) !== -1) continue;
    const item = makeSelItem(key);
    if (item) {
      state.selection.push(item);
      added++;
    }
  }
  if (added) selectionChanged();
  return added;
}

export function isFileFullySelected(fileId) {
  const pages = pagesOfFile(fileId);
  return pages.length > 0 && pages.every((p) => selectionIndex(p.key) !== -1);
}

export function toggleFile(fileId) {
  if (isFileFullySelected(fileId)) {
    state.selection = state.selection.filter((s) => s.fileId !== fileId);
    selectionChanged();
  } else {
    selectKeys(pagesOfFile(fileId).map((p) => p.key));
  }
}

export function selectAll() {
  selectKeys(state.files.flatMap((f) => pagesOfFile(f.id).map((p) => p.key)));
}

export function clearSelection() {
  state.selection = [];
  selectionChanged();
}

export function removeSelItem(id) {
  state.selection = state.selection.filter((s) => s.id !== id);
  selectionChanged();
}

export function rotateSelItem(id) {
  const item = state.selection.find((s) => s.id === id);
  if (!item) return;
  item.rotation = (item.rotation + 90) % 360;
  selectionChanged();
}

export function reorderSelection(ids) {
  const byId = new Map(state.selection.map((s) => [s.id, s]));
  state.selection = ids.map((id) => byId.get(id)).filter(Boolean);
  selectionChanged();
}

// ---------- Ansicht & Suche ----------

export function setView(view) {
  if (state.view === view) return;
  state.view = view;
  savePrefs();
  emit('view');
}

export function setQuery(query) {
  state.query = query;
  emit('query');
}

export function toggleExpanded(fileId) {
  if (state.expanded.has(fileId)) state.expanded.delete(fileId);
  else state.expanded.add(fileId);
  emit('files');
}

// ---------- Texterkennung ----------

export function pagesWithoutText(fileId) {
  return pagesOfFile(fileId).filter((p) => !p.text?.trim() && !p.ocrDone);
}

export async function runOcr(fileId) {
  if (state.ocr.has(fileId)) return;
  const file = state.files.find((f) => f.id === fileId);
  const todo = pagesWithoutText(fileId);
  if (!file || !todo.length) return;
  state.ocr.set(fileId, { done: 0, total: todo.length });
  emit('files');
  try {
    const { recognizePage } = await import('./services/ocr.js');
    let done = 0;
    for (const page of todo) {
      const { text, heading } = await recognizePage(fileId, page.index);
      page.text = text;
      page.ocrDone = true;
      page.heading = heading;
      await db.updatePages([page]);
      state.ocr.set(fileId, { done: ++done, total: todo.length });
      emit('ocr', fileId);
    }
    toast(t('library.ocrDone', { name: file.name }), 'success');
  } catch (e) {
    console.error(e);
    toast(t('library.ocrFailed'), 'error');
  } finally {
    state.ocr.delete(fileId);
    emit('files');
    if (state.query) emit('query');
  }
}
