// Texterkennung (OCR) für eingescannte Seiten ohne Textebene – kostenlos mit Tesseract.js.
// Engine und Sprachdaten (Deutsch + Französisch) liefert die App selbst aus (public/ocr),
// sie werden erst beim ersten Gebrauch geladen und danach offline zwischengespeichert.
import { renderPageImage } from './pdf.js';

let workerPromise = null;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OCR timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL('/ocr/', window.location.origin).href;
      let failed;
      const failure = new Promise((_, reject) => (failed = reject));
      const worker = createWorker(['deu', 'fra'], 1, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        workerBlobURL: false,
        errorHandler: (e) => failed(e instanceof Error ? e : new Error(String(e))),
      });
      // Ein Worker, der nicht lädt (z. B. offline beim ersten Mal), meldet sich sonst nie zurück.
      return withTimeout(Promise.race([worker, failure]), 90_000);
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

function headingFromBlocks(blocks, fallbackText) {
  const lines = [];
  for (const b of blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const text = (l.text || '').replace(/\s+/g, ' ').trim();
        if (text && /[\p{L}\p{N}]/u.test(text) && l.confidence > 40) {
          lines.push({ text, height: l.bbox.y1 - l.bbox.y0, top: l.bbox.y0 });
        }
      }
    }
  }
  if (!lines.length) return (fallbackText || '').split('\n').find((s) => s.trim())?.trim().slice(0, 90) || '';
  lines.sort((a, b) => a.top - b.top);
  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const max = Math.max(...lines.map((l) => l.height));
  if (max > median * 1.2) return lines.find((l) => l.height >= max * 0.9).text.slice(0, 160);
  return lines[0].text.length <= 90 ? lines[0].text : '';
}

/** Erkennt den Text einer Seite. */
export async function recognizePage(fileId, index) {
  const worker = await getWorker();
  const canvas = await renderPageImage(fileId, index);
  try {
    const { data } = await withTimeout(worker.recognize(canvas, {}, { text: true, blocks: true }), 180_000);
    const text = (data.text || '').replace(/[ \t]+/g, ' ').trim();
    return { text, heading: headingFromBlocks(data.blocks, text) };
  } catch (e) {
    terminateOcr();
    throw e;
  }
}

export async function terminateOcr() {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  const w = await p.catch(() => null);
  await w?.terminate().catch(() => {});
}
