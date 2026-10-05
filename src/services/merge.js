// PDF-Export (Zusammenführen ausgewählter Seiten) mit pdf-lib – komplett im Browser.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { getBlob } from './db.js';

/**
 * @param {Array<{fileId: string, index: number, rotation: number}>} items in Zielreihenfolge
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(items, { title, onProgress } = {}) {
  const out = await PDFDocument.create();
  const sources = new Map();
  let done = 0;

  for (const item of items) {
    let src = sources.get(item.fileId);
    if (!src) {
      const blob = await getBlob(item.fileId);
      src = await PDFDocument.load(await blob.arrayBuffer(), {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      sources.set(item.fileId, src);
    }
    const [page] = await out.copyPages(src, [item.index]);
    if (item.rotation) {
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees((current + item.rotation) % 360));
    }
    out.addPage(page);
    onProgress?.(++done, items.length);
  }

  if (title) out.setTitle(title);
  out.setProducer('PDF Atelier');
  out.setCreator('PDF Atelier');
  return out.save();
}

/** Erzeugt ein mehrseitiges Beispiel-PDF mit Überschriften zum Ausprobieren der Suche. */
export async function buildSamplePdf(t) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const colors = [
    [0.43, 0.36, 1],
    [0.13, 0.69, 0.53],
    [1, 0.48, 0.42],
    [0.96, 0.62, 0.14],
    [0.69, 0.3, 0.94],
  ];

  for (let i = 1; i <= 5; i++) {
    const page = doc.addPage([595, 842]);
    const [r, g, b] = colors[i - 1];
    page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(r, g, b) });
    page.drawText(t('sample.subtitle'), { x: 48, y: 790, size: 11, font: regular, color: rgb(1, 1, 1) });
    page.drawText(t(`sample.p${i}.title`), { x: 48, y: 670, size: 40, font: bold, color: rgb(0.1, 0.1, 0.18) });
    page.drawRectangle({ x: 48, y: 650, width: 64, height: 5, color: rgb(r, g, b) });

    const words = t(`sample.p${i}.body`).split(' ');
    let line = '';
    let y = 610;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (regular.widthOfTextAtSize(test, 14) > 499) {
        page.drawText(line, { x: 48, y, size: 14, font: regular, color: rgb(0.25, 0.25, 0.32) });
        y -= 22;
        line = w;
      } else line = test;
    }
    if (line) page.drawText(line, { x: 48, y, size: 14, font: regular, color: rgb(0.25, 0.25, 0.32) });

    for (let k = 0; k < 9; k++) {
      page.drawRectangle({
        x: 48,
        y: y - 50 - k * 34,
        width: 499 - ((k * 53) % 180),
        height: 10,
        color: rgb(0.9, 0.9, 0.94),
      });
    }
    page.drawText(String(i), { x: 290, y: 40, size: 11, font: regular, color: rgb(0.55, 0.55, 0.6) });
  }
  doc.setTitle(t('sample.subtitle'));
  return doc.save();
}

