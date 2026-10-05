import Sortable from 'sortablejs';
import { h, icon, clear } from './dom.js';
import { t, tn } from '../i18n/index.js';
import { state, on } from '../state.js';
import * as actions from '../actions.js';
import { thumbImage } from './library.js';
import { openExport } from './export.js';
import { openViewer } from './viewer.js';

const mobileQuery = window.matchMedia('(max-width: 899px)');

function countText(n) {
  if (n === 0) return t('tray.count0');
  if (n === 1) return t('tray.count1');
  return t('tray.count', { n });
}

/** Auswahl-Leiste: Desktop rechts als Spalte, Smartphone als ausklappbares Bottom-Sheet. */
export function mountTray(tray) {
  const countEl = h('span.tray-count');
  const barCount = h('span.bar-count');
  const barStack = h('div.bar-stack', { 'aria-hidden': 'true' });
  const barExport = h('button.btn.primary.sm.bar-export', { type: 'button', onclick: (e) => { e.stopPropagation(); exportNow(); } });
  const bar = h(
    'button.tray-bar',
    { type: 'button', 'aria-expanded': 'false', onclick: () => toggleSheet() },
    h('span.bar-handle', { 'aria-hidden': 'true' }),
    barStack,
    h('span.bar-text', {}, barCount),
    icon('chevronDown', 20, { class: 'icon bar-chevron' })
  );
  const barWrap = h('div.tray-bar-wrap', {}, bar, barExport);

  const list = h('ol.tray-list');
  const empty = h(
    'div.tray-empty',
    {},
    h('div.tray-empty-art', { 'aria-hidden': 'true' }, icon('layers', 30)),
    h('p', {})
  );
  const clearBtn = h('button.btn.ghost.sm', { type: 'button', onclick: () => actions.clearSelection() });
  const exportBtn = h('button.btn.primary.block.lg.export-btn', { type: 'button', onclick: () => exportNow() });
  const title = h('h2.tray-title');
  const hint = h('p.tray-hint.muted.small');

  const panel = h(
    'div.tray-panel',
    {},
    h('div.tray-head', {}, h('div', {}, title, countEl), clearBtn),
    hint,
    empty,
    list,
    h('div.tray-foot', {}, exportBtn)
  );
  const backdrop = h('div.tray-backdrop', { onclick: () => toggleSheet(false) });
  clear(tray).append(backdrop, barWrap, panel);

  function exportNow() {
    toggleSheet(false);
    openExport();
  }

  function toggleSheet(force) {
    const open = force ?? !tray.classList.contains('open');
    tray.classList.toggle('open', open && mobileQuery.matches);
    bar.setAttribute('aria-expanded', String(open));
    bar.setAttribute('aria-label', t(open ? 'tray.close' : 'tray.open'));
    document.body.classList.toggle('sheet-open', open && mobileQuery.matches);
  }
  const onMedia = () => toggleSheet(false);
  mobileQuery.addEventListener('change', onMedia);

  Sortable.create(list, {
    animation: 200,
    handle: '.tray-item',
    filter: '.no-drag',
    preventOnFilter: false,
    delayOnTouchOnly: true,
    delay: 160,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    dragClass: 'drag-active',
    onEnd: () => actions.reorderSelection([...list.children].map((li) => li.dataset.id)),
  });

  function renderTexts() {
    const n = state.selection.length;
    title.textContent = t('tray.title');
    countEl.textContent = countText(n);
    barCount.textContent = tn(n, 'tray.bar', 'tray.bar1', 'tray.bar0');
    clearBtn.textContent = t('tray.clear');
    clearBtn.hidden = n === 0;
    exportBtn.replaceChildren(icon('download', 20), h('span', {}, t('tray.export')));
    barExport.replaceChildren(icon('download', 16), h('span', {}, t('tray.exportShort')));
    empty.querySelector('p').textContent = t('tray.emptyText');
    hint.textContent = n > 1 ? t('tray.dragHint') : '';
  }

  function render() {
    const n = state.selection.length;
    tray.classList.toggle('has-items', n > 0);
    exportBtn.disabled = n === 0;
    barExport.disabled = n === 0;
    empty.hidden = n > 0;
    renderTexts();

    // Liste aktualisieren, bestehende Elemente wiederverwenden (keine flackernden Bilder)
    const existing = new Map([...list.children].map((li) => [li.dataset.id, li]));
    const items = state.selection.map((item, i) => {
      let li = existing.get(item.id);
      if (!li) {
        li = itemEl(item);
        li.classList.add('enter');
      }
      li.querySelector('.tray-pos').textContent = String(i + 1);
      li.querySelector('.thumb').style.setProperty('--rot', `${item.rotation}deg`);
      existing.delete(item.id);
      return li;
    });
    existing.forEach((li) => li.remove());
    items.forEach((li, i) => {
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
    });

    clear(barStack).append(
      ...state.selection.slice(-3).map((item) => h('span.stack-thumb', {}, thumbImage(item.fileId, item.index, item.rotation)))
    );
    bar.classList.remove('bump');
    void bar.offsetWidth;
    if (n) bar.classList.add('bump');
  }

  function itemEl(item) {
    const file = state.files.find((f) => f.id === item.fileId);
    const page = state.pages.get(item.key);
    return h(
      'li.tray-item',
      { dataset: { id: item.id } },
      h('span.tray-grip', { 'aria-hidden': 'true' }, icon('grip', 18)),
      h('span.tray-pos'),
      h(
        'button.tray-thumb.no-drag',
        {
          type: 'button',
          'aria-label': t('library.preview'),
          onclick: () => {
            const keys = state.selection.map((s) => s.key);
            openViewer(keys, keys.indexOf(item.key));
          },
        },
        thumbImage(item.fileId, item.index, item.rotation)
      ),
      h(
        'div.tray-label',
        {},
        h('span.tray-heading', {}, page?.heading || t('library.pageShort', { n: item.index + 1 })),
        h('span.tray-file', {}, `${file?.name ?? ''} · ${t('library.pageShort', { n: item.index + 1 })}`)
      ),
      h(
        'button.icon-btn.ghost.sm.no-drag',
        { type: 'button', title: t('tray.rotate'), 'aria-label': t('tray.rotate'), onclick: () => actions.rotateSelItem(item.id) },
        icon('rotate', 16)
      ),
      h(
        'button.icon-btn.ghost.sm.danger-hover.no-drag',
        {
          type: 'button',
          title: t('tray.remove'),
          'aria-label': t('tray.remove'),
          onclick: (e) => {
            const li = e.currentTarget.closest('li');
            li.classList.add('leave');
            setTimeout(() => actions.removeSelItem(item.id), 180);
          },
        },
        icon('x', 16)
      )
    );
  }

  const offs = [on('selection', render), on('files', render)];
  render();
  toggleSheet(false);
  return {
    renderTexts: () => {
      renderTexts();
      list.replaceChildren();
      render();
    },
    open: () => toggleSheet(true),
    close: () => toggleSheet(false),
    destroy: () => {
      offs.forEach((o) => o());
      mobileQuery.removeEventListener('change', onMedia);
      document.body.classList.remove('sheet-open');
    },
  };
}
