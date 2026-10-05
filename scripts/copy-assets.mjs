// Kopiert Laufzeit-Dateien aus node_modules nach public/, damit die App sie selbst ausliefert
// (keine externen CDNs → zuverlässig, offline-fähig und datenschutzfreundlich):
//  - pdf.js: Schriften, CMaps, WASM-Decoder
//  - Tesseract.js (Texterkennung): Worker, WASM-Kern und Sprachdaten Deutsch + Französisch
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const pub = (p) => path.join(root, 'public', p);

const copies = [
  ['pdfjs-dist/cmaps', 'pdfjs/cmaps'],
  ['pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts'],
  ['pdfjs-dist/wasm', 'pdfjs/wasm'],
  ['pdfjs-dist/iccs', 'pdfjs/iccs'],
  ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz', 'ocr/lang/deu.traineddata.gz'],
  ['@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz', 'ocr/lang/fra.traineddata.gz'],
];

for (const [from, to] of copies) {
  await mkdir(path.dirname(pub(to)), { recursive: true });
  await cp(nm(from), pub(to), { recursive: true });
}
console.log('Laufzeit-Dateien nach public/pdfjs und public/ocr kopiert');
