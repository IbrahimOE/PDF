import { h, icon } from './dom.js';
import { t } from '../i18n/index.js';
import { state } from '../state.js';
import { downloadBlob, canShareFiles, shareBlob } from '../services/share.js';
import { FORMATS, convertFile } from '../services/convert.js';

// Zielformate beim Speichern der Auswahl
const EXPORT_FORMATS = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'txt', 'md', 'html'];
let lastFormat = 'pdf';
import { openModal } from './modal.js';
import { toast } from './toast.js';

function defaultName() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return t('export.defaultName', { date });
}

function safeBase(name) {
  return (name || '').trim().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) || defaultName();
}

export function openExport() {
  const items = state.selection.map((s) => ({ ...s }));
  if (!items.length) {
    toast(t('export.nothing'), 'warn');
    return;
  }

  const input = h('input.input', { id: 'export-name', type: 'text', value: defaultName(), autocomplete: 'off', spellcheck: false });
  const progress = h('div.progress.big', {}, h('i'));
  const status = h('p.export-status.muted.small', { 'aria-live': 'polite' });
  const working = h('div.export-working', { hidden: true }, progress, status);
  const success = h('div.export-success', { hidden: true }, h('div.success-check', {}, icon('check', 40)), h('p', {}, t('export.done')));
  const share = canShareFiles();
  const suffix = h('span.input-suffix', {}, `.${FORMATS[lastFormat].ext}`);
  const formatSelect = h(
    'select.input.select',
    {
      id: 'export-format',
      onchange: () => {
        lastFormat = formatSelect.value;
        suffix.textContent = `.${FORMATS[lastFormat].ext}`;
      },
    },
    EXPORT_FORMATS.map((f) => h('option', { value: f, selected: f === lastFormat }, FORMATS[f].label))
  );

  const downloadBtn = h('button.btn.primary.lg', { type: 'button', onclick: () => run('download') }, icon('download', 20), t('export.download'));
  const shareBtn = share && h('button.btn.secondary.lg', { type: 'button', onclick: () => run('share') }, icon('share', 20), t('export.share'));
  const actionsRow = h('div.modal-actions.export-actions', {}, shareBtn, downloadBtn);

  const modal = openModal({
    title: t('export.title'),
    className: 'export-modal',
    content: [
      h(
        'div.export-preview',
        { 'aria-hidden': 'true' },
        h('div.export-stack', {}, h('span'), h('span'), h('span', {}, icon('file', 28))),
        h('span.export-count', {}, String(items.length))
      ),
      h('p.muted', {}, t('export.text', { n: items.length })),
      h(
        'div.export-fields',
        {},
        h('label.field', { for: 'export-name' }, h('span.field-label', {}, t('export.filename')), h('div.input-wrap.suffix', {}, input, suffix)),
        h('label.field', { for: 'export-format' }, h('span.field-label', {}, t('export.format')), h('div.input-wrap', {}, formatSelect))
      ),
      h('p.muted.small.export-format-hint', {}, t('export.formatHint')),
      working,
      success,
      actionsRow,
    ],
  });

  let bytes = null;
  const results = new Map();
  async function run(mode) {
    const base = safeBase(input.value);
    const format = formatSelect.value;
    downloadBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
    try {
      const setProgress = (done, total) => {
        progress.firstChild.style.width = `${(done / total) * 100}%`;
      };
      if (!bytes) {
        working.hidden = false;
        status.textContent = t('export.working');
        const { buildPdf } = await import('../services/merge.js');
        bytes = await buildPdf(items, { title: base, onProgress: setProgress });
      }
      let result = results.get(`${format}:${base}`);
      if (!result) {
        if (format === 'pdf') {
          result = { blob: new Blob([bytes], { type: FORMATS.pdf.mime }), name: `${base}.pdf` };
        } else {
          working.hidden = false;
          status.textContent = t('export.converting', { format: FORMATS[format].label });
          progress.firstChild.style.width = '0%';
          const source = new File([bytes], `${base}.pdf`, { type: FORMATS.pdf.mime });
          result = await convertFile(source, format, { name: base, onProgress: setProgress });
        }
        results.set(`${format}:${base}`, result);
      }
      working.hidden = true;
      if (mode === 'share') {
        try {
          await shareBlob(result.blob, result.name);
        } catch (e) {
          if (e?.name !== 'AbortError') downloadBlob(result.blob, result.name);
        }
      } else {
        downloadBlob(result.blob, result.name);
      }
      success.hidden = false;
      toast(t('export.done'), 'success');
      setTimeout(() => modal.close(), 1600);
    } catch (e) {
      console.error(e);
      working.hidden = true;
      toast(t('export.failed'), 'error');
    } finally {
      downloadBtn.disabled = false;
      if (shareBtn) shareBtn.disabled = false;
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run('download');
  });
  requestAnimationFrame(() => input.select());
}
