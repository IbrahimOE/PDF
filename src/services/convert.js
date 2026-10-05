// Datei-Umwandlung komplett im Browser (kostenlos, ohne Server, Dateien verlassen das Gerät nicht).
//
// Funktionsweise: Jede Eingabe wird in ein einfaches Dokument-Modell gelesen
// (Überschriften, Absätze, Listen, Bilder, Tabellen, Seitenumbrüche) und daraus
// in das Zielformat geschrieben. PDF → Bild/PowerPoint und Bild → Bild/PDF laufen direkt.
import { openPdf, groupLines } from './pdf.js';

// ---------- Formate ----------

export const FORMATS = {
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  docx: { label: 'Word (DOCX)', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pptx: { label: 'PowerPoint (PPTX)', ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  xlsx: { label: 'Excel (XLSX)', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { label: 'CSV', ext: 'csv', mime: 'text/csv' },
  txt: { label: 'Text (TXT)', ext: 'txt', mime: 'text/plain' },
  md: { label: 'Markdown (MD)', ext: 'md', mime: 'text/markdown' },
  html: { label: 'Webseite (HTML)', ext: 'html', mime: 'text/html' },
  png: { label: 'Bild (PNG)', ext: 'png', mime: 'image/png' },
  jpg: { label: 'Bild (JPG)', ext: 'jpg', mime: 'image/jpeg' },
  webp: { label: 'Bild (WEBP)', ext: 'webp', mime: 'image/webp' },
};

const TARGETS = {
  pdf: ['docx', 'pptx', 'png', 'jpg', 'txt', 'md', 'html'],
  docx: ['pdf', 'txt', 'md', 'html'],
  txt: ['pdf', 'docx', 'md', 'html'],
  md: ['pdf', 'docx', 'html', 'txt'],
  html: ['pdf', 'docx', 'md', 'txt'],
  csv: ['xlsx', 'pdf', 'docx', 'html', 'md'],
  xlsx: ['csv', 'pdf', 'docx', 'html', 'md'],
  image: ['pdf', 'png', 'jpg', 'webp', 'docx'],
};

/** Dateiendungen, die die Umwandlung annimmt (für den Dateiauswahl-Dialog). */
export const ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.bmp,' +
  'application/pdf,image/*,text/plain,text/csv,text/html,text/markdown';

const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

export function kindOf(file) {
  const ext = extOf(file.name || '');
  const type = file.type || '';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'csv' || type === 'text/csv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'html' || ext === 'htm' || type === 'text/html') return 'html';
  if (ext === 'txt' || type === 'text/plain') return 'txt';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) || type.startsWith('image/')) return 'image';
  return null;
}

export function targetsFor(file) {
  const kind = kindOf(file);
  if (!kind) return [];
  let list = TARGETS[kind];
  if (kind === 'image') {
    const ext = extOf(file.name) === 'jpeg' ? 'jpg' : extOf(file.name);
    list = list.filter((f) => f !== ext);
  }
  return list;
}

export const baseName = (name) => (name || 'Datei').replace(/\.[^.]+$/, '');

// ---------- Hilfsfunktionen ----------

async function canvasToBytes(canvas, mime = 'image/png', quality = 0.9) {
  const blob = await new Promise((r) => canvas.toBlob(r, mime, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Bringt beliebige Bilder (GIF, WEBP, BMP …) in PNG/JPG und liefert die Abmessungen. */
async function normalizeImage(blob) {
  const bmp = await createImageBitmap(blob);
  const { width, height } = bmp;
  const type = blob.type;
  if (type === 'image/png' || type === 'image/jpeg') {
    bmp.close?.();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: type, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  return { bytes: await canvasToBytes(canvas, 'image/png'), mime: 'image/png', width, height };
}

function dataUrlToBlob(url) {
  const [head, data] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Lesen: Datei → Dokument-Modell ----------

async function renderPdfPage(doc, n, scale = 2, mime = 'image/png') {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport, background: 'white' }).promise;
  page.cleanup();
  return { bytes: await canvasToBytes(canvas, mime, 0.88), mime, width: canvas.width, height: canvas.height };
}

async function readPdf(file, onProgress) {
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const blocks = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (n > 1) blocks.push({ type: 'break' });
      const page = await doc.getPage(n);
      const lines = groupLines((await page.getTextContent()).items);
      if (!lines.length) {
        // Gescannte Seite ohne Text → als Bild übernehmen
        blocks.push({ type: 'img', ...(await renderPdfPage(doc, n, 1.6, 'image/jpeg')) });
      } else {
        const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
        const body = sizes[Math.floor(sizes.length / 2)];
        const max = sizes[sizes.length - 1];
        let para = null;
        let prev = null;
        for (const l of lines) {
          const isHeading = l.size > body * 1.2 && l.text.length <= 140;
          if (isHeading) {
            para = null;
            const level = l.size >= max * 0.95 ? 1 : l.size > body * 1.5 ? 2 : 3;
            const last = blocks[blocks.length - 1];
            if (last?.type === 'h' && prev && Math.abs(prev.size - l.size) < 0.5) last.text += ` ${l.text}`;
            else blocks.push({ type: 'h', level, text: l.text });
          } else {
            const bullet = l.text.match(/^([•▪◦‣\-–*]|\d{1,3}[.)])\s+(.*)$/);
            const gap = prev ? prev.y - l.y : 0;
            if (bullet) {
              para = null;
              blocks.push({ type: 'li', ordered: /\d/.test(bullet[1]), text: bullet[2] });
            } else if (para && gap < l.size * 1.75 && Math.abs(prev.size - l.size) < 1) {
              para.text = para.text.endsWith('-') ? para.text.slice(0, -1) + l.text : `${para.text} ${l.text}`;
            } else {
              para = { type: 'p', text: l.text };
              blocks.push(para);
            }
          }
          prev = l;
        }
      }
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
  } finally {
    doc.loadingTask.destroy();
  }
  return { title: baseName(file.name), blocks };
}

async function htmlToBlocks(html) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  async function addImg(el) {
    const src = el.getAttribute('src') || '';
    if (!src.startsWith('data:')) return;
    try {
      blocks.push({ type: 'img', ...(await normalizeImage(dataUrlToBlob(src))) });
    } catch {
      /* nicht darstellbares Bildformat (z. B. EMF) überspringen */
    }
  }

  async function walk(node) {
    for (const el of node.children) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = text(el);
        if (t) blocks.push({ type: 'h', level: Math.min(3, Number(tag[1])), text: t });
      } else if (tag === 'p' || tag === 'pre' || tag === 'blockquote') {
        for (const img of el.querySelectorAll('img')) await addImg(img);
        const t = tag === 'pre' ? el.textContent.trim() : text(el);
        if (t) blocks.push({ type: 'p', text: t });
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of el.querySelectorAll(':scope > li')) {
          const t = text(li);
          if (t) blocks.push({ type: 'li', ordered: tag === 'ol', text: t });
        }
      } else if (tag === 'table') {
        const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => text(c)));
        if (rows.length) blocks.push({ type: 'table', rows });
      } else if (tag === 'img') {
        await addImg(el);
      } else if (tag === 'hr') {
        blocks.push({ type: 'p', text: '' });
      } else if (['script', 'style', 'head', 'noscript', 'template'].includes(tag)) {
        /* ignorieren */
      } else if (el.children.length) {
        await walk(el);
      } else {
        const t = text(el);
        if (t) blocks.push({ type: 'p', text: t });
      }
    }
  }
  await walk(dom.body);
  return blocks;
}

async function readDocx(file) {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return { title: baseName(file.name), blocks: await htmlToBlocks(value) };
}

async function readText(file) {
  const raw = (await file.text()).replace(/\r\n?/g, '\n');
  const blocks = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'p', text: p }));
  return { title: baseName(file.name), blocks };
}

async function readMarkdown(file) {
  const { marked } = await import('marked');
  return { title: baseName(file.name), blocks: await htmlToBlocks(marked.parse(await file.text(), { async: false })) };
}

async function readHtml(file) {
  return { title: baseName(file.name), blocks: await htmlToBlocks(await file.text()) };
}

function parseCsv(textIn) {
  const text = textIn.replace(/^﻿/, '');
  const firstLine = text.split('\n')[0] || '';
  const delim = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

async function readCsv(file) {
  return { title: baseName(file.name), blocks: [{ type: 'table', rows: parseCsv(await file.text()) }] };
}

async function loadExcel() {
  const mod = await import('exceljs/dist/exceljs.min.js');
  return mod.default || mod;
}

async function readXlsx(file) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const blocks = [];
  wb.worksheets.forEach((ws, i) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text ?? '');
      rows.push(cells);
    });
    if (!rows.length) return;
    if (i > 0) blocks.push({ type: 'break' });
    if (wb.worksheets.length > 1) blocks.push({ type: 'h', level: 2, text: ws.name });
    blocks.push({ type: 'table', rows, name: ws.name });
  });
  return { title: baseName(file.name), blocks };
}

async function readImage(file) {
  return { title: baseName(file.name), blocks: [{ type: 'img', ...(await normalizeImage(file)) }] };
}

const READERS = { pdf: readPdf, docx: readDocx, txt: readText, md: readMarkdown, html: readHtml, csv: readCsv, xlsx: readXlsx, image: readImage };

// ---------- Schreiben: Dokument-Modell → Zielformat ----------

async function writePdf(doc) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const clean = (s) =>
    [...String(s).replace(/\t/g, '    ')].map((ch) => (ch === '\n' || supported.has(ch.codePointAt(0)) ? ch : '?')).join('');

  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const CW = W - 2 * M;
  let page = null;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h) => {
    if (!page || y - h < M) newPage();
  };

  const wrap = (text, font, size, width) => {
    const out = [];
    for (const rawLine of clean(text).split('\n')) {
      let line = '';
      for (const word of rawLine.split(/ +/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) {
          line = test;
          continue;
        }
        if (line) out.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      out.push(line);
    }
    return out;
  };

  const drawLines = (lines, { font = regular, size = 11, x = M, leading = size * 1.38, color = rgb(0.12, 0.12, 0.16) } = {}) => {
    for (const l of lines) {
      ensure(leading);
      y -= leading;
      if (l) page.drawText(l, { x, y: y + leading * 0.25, size, font, color });
    }
  };

  let listCounter = 0;
  for (const b of doc.blocks) {
    if (b.type !== 'li' || !b.ordered) listCounter = b.type === 'li' ? listCounter : 0;
    if (b.type === 'break') {
      if (page && y < H - M - 1) newPage();
    } else if (b.type === 'h') {
      const size = [0, 22, 17, 14][b.level] || 14;
      ensure(size * 3);
      y -= size * 0.6;
      drawLines(wrap(b.text, bold, size, CW), { font: bold, size, leading: size * 1.3 });
      y -= size * 0.35;
    } else if (b.type === 'p') {
      drawLines(wrap(b.text, regular, 11, CW));
      y -= 7;
    } else if (b.type === 'li') {
      const marker = b.ordered ? `${++listCounter}.` : '•';
      const lines = wrap(b.text, regular, 11, CW - 18);
      ensure(16);
      page.drawText(clean(marker), { x: M + 2, y: y - 15 + 3.8, size: 11, font: regular });
      drawLines(lines, { x: M + 18 });
      y -= 3;
    } else if (b.type === 'img') {
      const img = b.mime === 'image/png' ? await pdf.embedPng(b.bytes) : await pdf.embedJpg(b.bytes);
      let w = Math.min(CW, b.width * 0.75);
      let h = (w * b.height) / b.width;
      const maxH = H - 2 * M;
      if (h > maxH) {
        h = maxH;
        w = (h * b.width) / b.height;
      }
      ensure(h + 8);
      y -= h;
      page.drawImage(img, { x: M + (CW - w) / 2, y, width: w, height: h });
      y -= 10;
    } else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.length));
      if (!cols) continue;
      const size = cols > 8 ? 7 : 9;
      const cw = CW / cols;
      b.rows.forEach((row, ri) => {
        const font = ri === 0 ? bold : regular;
        const cells = Array.from({ length: cols }, (_, c) => wrap(row[c] ?? '', font, size, cw - 8).slice(0, 6));
        const rh = Math.max(...cells.map((c) => c.length)) * size * 1.3 + 8;
        ensure(rh);
        if (ri === 0) page.drawRectangle({ x: M, y: y - rh, width: CW, height: rh, color: rgb(0.93, 0.92, 0.99) });
        cells.forEach((lines, c) => {
          lines.forEach((l, li) =>
            page.drawText(l, { x: M + c * cw + 4, y: y - 4 - size - li * size * 1.3 + 1, size, font, color: rgb(0.12, 0.12, 0.16) })
          );
          page.drawRectangle({ x: M + c * cw, y: y - rh, width: cw, height: rh, borderColor: rgb(0.78, 0.77, 0.86), borderWidth: 0.6 });
        });
        y -= rh;
      });
      y -= 12;
    }
  }
  if (!page) newPage();
  pdf.setTitle(doc.title || '');
  pdf.setProducer('PDF Atelier');
  return new Blob([await pdf.save()], { type: FORMATS.pdf.mime });
}

async function writeDocx(doc) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, PageBreak } = d;
  const headings = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const children = [];
  let counter = 0;
  for (const b of doc.blocks) {
    if (b.type !== 'li' || !b.ordered) counter = b.type === 'li' ? counter : 0;
    if (b.type === 'h') children.push(new Paragraph({ heading: headings[b.level] || HeadingLevel.HEADING_3, children: [new TextRun(b.text)] }));
    else if (b.type === 'p') {
      const lines = b.text.split('\n');
      children.push(
        new Paragraph({ spacing: { after: 160 }, children: lines.map((l, i) => new TextRun({ text: l, break: i > 0 ? 1 : 0 })) })
      );
    } else if (b.type === 'li') {
      children.push(
        b.ordered
          ? new Paragraph({ indent: { left: 360 }, children: [new TextRun(`${++counter}. ${b.text}`)] })
          : new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] })
      );
    } else if (b.type === 'img') {
      const w = Math.min(600, b.width);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: b.mime === 'image/png' ? 'png' : 'jpg',
              data: b.bytes,
              transformation: { width: w, height: Math.round((w * b.height) / b.width) },
            }),
          ],
        })
      );
    } else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.length));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map(
            (r, ri) =>
              new TableRow({
                tableHeader: ri === 0,
                children: Array.from(
                  { length: cols },
                  (_, c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r[c] ?? '', bold: ri === 0 })] })] })
                ),
              })
          ),
        })
      );
      children.push(new Paragraph(''));
    } else if (b.type === 'break') children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  const file = new Document({
    creator: 'PDF Atelier',
    title: doc.title || '',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: children.length ? children : [new Paragraph('')] }],
  });
  return Packer.toBlob(file);
}

function writeHtml(doc) {
  const parts = [];
  let list = null;
  const closeList = () => {
    if (list) parts.push(`</${list}>`);
    list = null;
  };
  for (const b of doc.blocks) {
    if (b.type === 'li') {
      const tag = b.ordered ? 'ol' : 'ul';
      if (list !== tag) {
        closeList();
        parts.push(`<${tag}>`);
        list = tag;
      }
      parts.push(`<li>${escapeHtml(b.text)}</li>`);
      continue;
    }
    closeList();
    if (b.type === 'h') parts.push(`<h${b.level}>${escapeHtml(b.text)}</h${b.level}>`);
    else if (b.type === 'p') parts.push(`<p>${escapeHtml(b.text).replace(/\n/g, '<br>')}</p>`);
    else if (b.type === 'img') parts.push(`<p><img alt="" src="data:${b.mime};base64,${bytesToBase64(b.bytes)}"></p>`);
    else if (b.type === 'table')
      parts.push(
        `<table>${b.rows
          .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join('')}</tr>`)
          .join('')}</table>`
      );
    else if (b.type === 'break') parts.push('<hr class="page-break">');
  }
  closeList();
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title || '')}</title>
<style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1d1b2c}
img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #d4d1ea;padding:6px 8px;text-align:left}
th{background:#eeebff}hr.page-break{border:0;border-top:1px dashed #ccc;margin:32px 0}</style></head>
<body>
${parts.join('\n')}
</body></html>`;
  return new Blob([html], { type: FORMATS.html.mime });
}

function writeMarkdown(doc) {
  const out = [];
  let counter = 0;
  for (const b of doc.blocks) {
    if (b.type !== 'li' || !b.ordered) counter = b.type === 'li' ? counter : 0;
    if (b.type === 'h') out.push(`${'#'.repeat(b.level)} ${b.text}`, '');
    else if (b.type === 'p') out.push(b.text, '');
    else if (b.type === 'li') out.push(b.ordered ? `${++counter}. ${b.text}` : `- ${b.text}`);
    else if (b.type === 'img') out.push(`![](data:${b.mime};base64,${bytesToBase64(b.bytes)})`, '');
    else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.length));
      const row = (r) => `| ${Array.from({ length: cols }, (_, c) => String(r[c] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
      out.push('', row(b.rows[0] || []), `|${' --- |'.repeat(cols)}`, ...b.rows.slice(1).map(row), '');
    } else if (b.type === 'break') out.push('', '---', '');
  }
  return new Blob([out.join('\n').replace(/\n{3,}/g, '\n\n')], { type: FORMATS.md.mime });
}

function writeText(doc) {
  const out = [];
  let counter = 0;
  for (const b of doc.blocks) {
    if (b.type !== 'li' || !b.ordered) counter = b.type === 'li' ? counter : 0;
    if (b.type === 'h') out.push(b.level === 1 ? b.text.toUpperCase() : b.text, '');
    else if (b.type === 'p') out.push(b.text, '');
    else if (b.type === 'li') out.push(b.ordered ? `${++counter}. ${b.text}` : `• ${b.text}`);
    else if (b.type === 'table') out.push(...b.rows.map((r) => r.join('\t')), '');
    else if (b.type === 'break') out.push('', '\f');
  }
  return new Blob([out.join('\n').replace(/\n{3,}/g, '\n\n')], { type: 'text/plain;charset=utf-8' });
}

function tablesOf(doc) {
  const tables = doc.blocks.filter((b) => b.type === 'table');
  if (tables.length) return tables;
  const rows = doc.blocks.filter((b) => b.text).map((b) => [b.text]);
  return [{ rows, name: 'Text' }];
}

async function writeXlsx(doc) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PDF Atelier';
  tablesOf(doc).forEach((t, i) => {
    const ws = wb.addWorksheet((t.name || `Tabelle ${i + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    ws.addRows(t.rows);
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col) => {
      let max = 8;
      col.eachCell?.({ includeEmpty: false }, (c) => (max = Math.max(max, String(c.value ?? '').length + 2)));
      col.width = Math.min(60, max);
    });
  });
  return new Blob([await wb.xlsx.writeBuffer()], { type: FORMATS.xlsx.mime });
}

function writeCsv(doc) {
  const [t] = tablesOf(doc);
  const csv = t.rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
  return new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
}

const WRITERS = { pdf: writePdf, docx: writeDocx, html: writeHtml, md: writeMarkdown, txt: writeText, xlsx: writeXlsx, csv: writeCsv };

// ---------- Direkte Wege (ohne Dokument-Modell) ----------

async function pdfToImages(file, target, onProgress) {
  const { zipSync } = await import('fflate');
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const mime = FORMATS[target].mime;
  const files = {};
  const name = baseName(file.name);
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const img = await renderPdfPage(doc, n, 2, mime);
      files[`${name}-${String(n).padStart(3, '0')}.${FORMATS[target].ext}`] = img.bytes;
      onProgress?.(n, doc.numPages);
    }
  } finally {
    doc.loadingTask.destroy();
  }
  const entries = Object.entries(files);
  if (entries.length === 1) return { blob: new Blob([entries[0][1]], { type: mime }), name: entries[0][0] };
  return { blob: new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), name: `${name}-${target}.zip` };
}

async function pdfToPptx(file, onProgress) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const pptx = new PptxGenJS();
  try {
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });
    const w = 10;
    const h = Math.round((w * first.height * 1000) / first.width) / 1000;
    pptx.defineLayout({ name: 'PDF', width: w, height: h });
    pptx.layout = 'PDF';
    for (let n = 1; n <= doc.numPages; n++) {
      const img = await renderPdfPage(doc, n, 2, 'image/jpeg');
      const slide = pptx.addSlide();
      const ratio = Math.min(w / img.width, h / img.height);
      const iw = img.width * ratio;
      const ih = img.height * ratio;
      slide.addImage({ data: `data:image/jpeg;base64,${bytesToBase64(img.bytes)}`, x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih });
      onProgress?.(n, doc.numPages);
    }
  } finally {
    doc.loadingTask.destroy();
  }
  return pptx.write({ outputType: 'blob' });
}

async function imageToImage(file, target) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (target === 'jpg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, FORMATS[target].mime, 0.92));
  if (!blob || (target === 'webp' && blob.type !== 'image/webp')) throw new Error('unsupported');
  return blob;
}

async function imageToPdf(file) {
  const { PDFDocument } = await import('pdf-lib');
  const img = await normalizeImage(file);
  const pdf = await PDFDocument.create();
  const embedded = img.mime === 'image/png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
  const w = img.width * 0.75;
  const h = img.height * 0.75;
  const page = pdf.addPage([w, h]);
  page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
  pdf.setProducer('PDF Atelier');
  return new Blob([await pdf.save()], { type: FORMATS.pdf.mime });
}

// ---------- Öffentliche API ----------

/**
 * Wandelt eine Datei in das Zielformat um.
 * @returns {Promise<{ blob: Blob, name: string }>}
 */
export async function convertFile(file, target, { onProgress, name } = {}) {
  const kind = kindOf(file);
  if (!kind || !FORMATS[target]) throw new Error('unsupported');
  const outName = `${name || baseName(file.name)}.${FORMATS[target].ext}`;

  if (kind === 'pdf' && (target === 'png' || target === 'jpg' || target === 'webp')) {
    const res = await pdfToImages(file, target, onProgress);
    return name ? { ...res, name: res.name.replace(baseName(file.name), name) } : res;
  }
  if (kind === 'pdf' && target === 'pptx') return { blob: await pdfToPptx(file, onProgress), name: outName };
  if (kind === 'image' && ['png', 'jpg', 'webp'].includes(target)) return { blob: await imageToImage(file, target), name: outName };
  if (kind === 'image' && target === 'pdf') return { blob: await imageToPdf(file), name: outName };

  const writer = WRITERS[target];
  if (!writer) throw new Error('unsupported');
  const doc = await READERS[kind](file, onProgress);
  const blob = await writer(doc);
  return { blob, name: outName };
}
