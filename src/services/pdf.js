// PDF lesen, Text analysieren und Seiten rendern (pdf.js, läuft komplett im Browser).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { getBlob, getThumb, putThumb, pageKey } from './db.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const DOC_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
  isEvalSupported: false,
};

export const PdfError = { ENCRYPTED: 'encrypted', BROKEN: 'broken' };

export function openPdf(data) {
  return pdfjs.getDocument({ ...DOC_OPTIONS, data }).promise.catch((e) => {
    const err = new Error(e?.message || 'PDF error');
    err.code = e?.name === 'PasswordException' ? PdfError.ENCRYPTED : PdfError.BROKEN;
    throw err;
  });
}

// ---------- Dokument-Cache (begrenzt, damit der Speicher auf Smartphones reicht) ----------
const docCache = new Map();
const MAX_DOCS = 4;

export async function getDoc(fileId) {
  if (docCache.has(fileId)) {
    const p = docCache.get(fileId);
    docCache.delete(fileId);
    docCache.set(fileId, p);
    return p;
  }
  const promise = (async () => {
    const blob = await getBlob(fileId);
    if (!blob) throw new Error('missing blob');
    return openPdf(new Uint8Array(await blob.arrayBuffer()));
  })();
  docCache.set(fileId, promise);
  promise.catch(() => docCache.delete(fileId));
  while (docCache.size > MAX_DOCS) {
    const [oldId, oldPromise] = docCache.entries().next().value;
    docCache.delete(oldId);
    oldPromise.then((d) => d.loadingTask.destroy()).catch(() => {});
  }
  return promise;
}

export function forgetDoc(fileId) {
  const p = docCache.get(fileId);
  docCache.delete(fileId);
  p?.then((d) => d.loadingTask.destroy()).catch(() => {});
}

// ---------- Textanalyse ----------

/**
 * Gruppiert die Textelemente einer Seite in Zeilen und ermittelt die Überschrift:
 * die oberste Zeile mit der größten Schrift (oder die erste kurze Zeile, wenn alles gleich groß ist).
 */
/** Gruppiert die Textelemente einer Seite in Zeilen (von oben nach unten) mit Schriftgröße und Position. */
export function groupLines(items) {
  const parts = items
    .filter((it) => typeof it.str === 'string' && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
    }));
  const lines = [];
  for (const p of parts) {
    let line = lines.find((l) => Math.abs(l.y - p.y) < Math.max(2, Math.min(l.size, p.size) * 0.5));
    if (!line) {
      line = { y: p.y, size: 0, parts: [] };
      lines.push(line);
    }
    line.parts.push(p);
    line.size = Math.max(line.size, p.size);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.parts.sort((a, b) => a.x - b.x);
    let s = '';
    let prev = null;
    for (const p of l.parts) {
      if (prev) {
        const gap = p.x - (prev.x + prev.w);
        if (gap > prev.size * 0.15 && !s.endsWith(' ') && !p.str.startsWith(' ')) s += ' ';
      }
      s += p.str;
      prev = p;
    }
    l.text = s.replace(/\s+/g, ' ').trim();
    l.x = l.parts[0].x;
  }
  return lines.filter((l) => l.text);
}

export function analyzeText(items) {
  const lines = groupLines(items);
  if (!lines.length) return { text: '', heading: '' };
  const textLines = lines;
  const text = textLines.map((l) => l.text).join('\n');

  const candidates = textLines.filter((l) => /[\p{L}\p{N}]/u.test(l.text) && l.text.length <= 140);
  if (!candidates.length) return { text, heading: '' };
  const sizes = textLines.map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  const maxSize = Math.max(...candidates.map((l) => l.size));

  let heading = '';
  if (maxSize > median * 1.12) {
    const idx = textLines.findIndex((l) => candidates.includes(l) && l.size >= maxSize * 0.94);
    heading = textLines[idx].text;
    const next = textLines[idx + 1];
    // Zweizeilige Überschriften zusammenfassen
    if (next && Math.abs(next.size - textLines[idx].size) < 0.5 && heading.length < 80) {
      heading = `${heading} ${next.text}`;
    }
  } else {
    const first = candidates[0];
    heading = first.text.length <= 90 ? first.text : '';
  }
  return { text, heading: heading.slice(0, 160) };
}

/** Liest ein neues PDF ein und liefert Seitenzahl, Text und Überschriften aller Seiten. */
export async function analyzePdf(data, onProgress) {
  const doc = await openPdf(data);
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [w, h] = [page.view[2] - page.view[0], page.view[3] - page.view[1]];
      let structure = { text: '', heading: '' };
      try {
        const content = await page.getTextContent();
        structure = analyzeText(content.items);
      } catch {}
      pages.push({ index: i - 1, width: w, height: h, rotate: page.rotate || 0, ...structure });
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    doc.loadingTask.destroy();
  }
}

// ---------- Rendern ----------

export async function renderPage(fileId, index, canvas, cssWidth, { signal } = {}) {
  const doc = await getDoc(fileId);
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const scale = (cssWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvas, viewport, background: 'white' });
  signal?.addEventListener('abort', () => task.cancel(), { once: true });
  await task.promise;
  return { page, viewport, cssScale: scale / dpr };
}

/** Liefert die Rechtecke (in CSS-Pixeln) aller Textstellen, die einen Suchbegriff enthalten. */
export async function findTextRects(page, cssScale, matcher) {
  const viewport = page.getViewport({ scale: cssScale });
  const content = await page.getTextContent();
  const rects = [];
  for (const it of content.items) {
    if (!it.str || !matcher(it.str)) continue;
    const tx = pdfjs.Util.transform(viewport.transform, it.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    rects.push({
      left: tx[4],
      top: tx[5] - fontHeight,
      width: it.width * cssScale,
      height: fontHeight * 1.2,
    });
  }
  return rects;
}

// ---------- Miniaturbilder ----------
const thumbUrls = new Map();
const pending = new Map();
let active = 0;
const queue = [];
const THUMB_WIDTH = 220;

function runQueue() {
  while (active < 2 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      runQueue();
    });
  }
}

export function getThumbnail(fileId, index) {
  const key = pageKey(fileId, index);
  if (thumbUrls.has(key)) return Promise.resolve(thumbUrls.get(key));
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    let blob = await getThumb(key);
    if (!blob) {
      blob = await new Promise((resolve, reject) => {
        queue.push(async () => {
          try {
            const canvas = document.createElement('canvas');
            await renderPage(fileId, index, canvas, THUMB_WIDTH);
            const b = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
            if (b) resolve(b);
            else reject(new Error('thumb'));
          } catch (e) {
            reject(e);
          }
        });
        runQueue();
      });
      putThumb(key, blob).catch(() => {});
    }
    const url = URL.createObjectURL(blob);
    thumbUrls.set(key, url);
    return url;
  })();
  pending.set(key, promise);
  promise.finally(() => pending.delete(key));
  return promise;
}

export function cachedThumbnail(fileId, index) {
  return thumbUrls.get(pageKey(fileId, index)) ?? null;
}

export function dropThumbnails(fileId, pageCount) {
  for (let i = 0; i < pageCount; i++) {
    const key = pageKey(fileId, i);
    const url = thumbUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    thumbUrls.delete(key);
  }
}

/** Rendert eine Seite als Bild (für die Texterkennung). */
export async function renderPageImage(fileId, index, width = 1600) {
  const canvas = document.createElement('canvas');
  const doc = await getDoc(fileId);
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport, background: 'white' }).promise;
  return canvas;
}
