import { h, icon } from './dom.js';
import { t } from '../i18n/index.js';
import { state } from '../state.js';
import { downloadBytes, canShareFiles, shareBytes } from '../services/share.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';

function defaultName() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return t('export.defaultName', { date });
}

function safeName(name) {
  const base = (name || '').trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) || defaultName();
  return `${base}.pdf`;
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
      h('label.field', { for: 'export-name' }, h('span.field-label', {}, t('export.filename')), h('div.input-wrap.suffix', {}, input, h('span.input-suffix', {}, '.pdf'))),
      working,
      success,
      actionsRow,
    ],
  });

  let bytes = null;
  async function run(mode) {
    const filename = safeName(input.value);
    downloadBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;
    try {
      if (!bytes) {
        working.hidden = false;
        status.textContent = t('export.working');
        const { buildPdf } = await import('../services/merge.js');
        bytes = await buildPdf(items, {
          title: filename.replace(/\.pdf$/, ''),
          onProgress: (done, total) => {
            progress.firstChild.style.width = `${(done / total) * 100}%`;
          },
        });
        working.hidden = true;
      }
      if (mode === 'share') {
        try {
          await shareBytes(bytes, filename);
        } catch (e) {
          if (e?.name !== 'AbortError') downloadBytes(bytes, filename);
        }
      } else {
        downloadBytes(bytes, filename);
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
