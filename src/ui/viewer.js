import { h, icon, clear } from './dom.js';
import { t } from '../i18n/index.js';
import { state, on, selectionIndex } from '../state.js';
import * as actions from '../actions.js';
import { renderPage, findTextRects } from '../services/pdf.js';
import { makeMatcher } from '../services/search.js';
import { openModal } from './modal.js';

/** Großansicht einer Seite mit Blättern, Auswahl und Hervorhebung der Suchbegriffe. */
export function openViewer(keys, startIndex = 0, { query = '' } = {}) {
  if (!keys.length) return;
  let pos = Math.max(0, Math.min(startIndex, keys.length - 1));
  let controller = null;

  const title = h('div.viewer-file');
  const sub = h('div.viewer-sub');
  const selectBtn = h('button.btn.sm.viewer-select', { type: 'button', onclick: () => actions.togglePage(keys[pos]) });
  const canvas = h('canvas.viewer-canvas');
  const hlLayer = h('div.hl-layer');
  const pageBox = h('div.viewer-page', {}, canvas, hlLayer, h('span.spinner.dark.viewer-spinner'));
  const prev = h('button.nav-btn.prev', { type: 'button', 'aria-label': t('viewer.prev'), onclick: () => go(-1) }, icon('chevronLeft', 28));
  const next = h('button.nav-btn.next', { type: 'button', 'aria-label': t('viewer.next'), onclick: () => go(1) }, icon('chevronRight', 28));
  const stage = h('div.viewer-stage', {}, prev, pageBox, next);
  const counter = h('div.viewer-counter');

  const content = h(
    'div.viewer',
    {},
    h(
      'div.viewer-top',
      {},
      h('div.viewer-titles', {}, title, sub),
      selectBtn,
      h('button.icon-btn.ghost.on-dark', { type: 'button', 'aria-label': t('viewer.close'), onclick: () => modal.close() }, icon('x', 22))
    ),
    stage,
    counter
  );

  const modal = openModal({
    className: 'viewer-modal',
    content,
    onClose: () => {
      controller?.abort();
      offSel();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    },
  });

  function updateSelectBtn() {
    const selected = selectionIndex(keys[pos]) !== -1;
    selectBtn.classList.toggle('active', selected);
    clear(selectBtn).append(icon(selected ? 'check' : 'plus', 16), h('span', {}, t(selected ? 'viewer.selected' : 'viewer.select')));
  }

  async function show(direction = 0) {
    const page = state.pages.get(keys[pos]);
    if (!page) return;
    const file = state.files.find((f) => f.id === page.fileId);
    title.textContent = file?.name ?? '';
    sub.textContent = `${t('viewer.page', { n: page.index + 1, total: file?.pageCount ?? '?' })}${page.heading ? ` · ${page.heading}` : ''}`;
    counter.textContent = keys.length > 1 ? `${pos + 1} / ${keys.length}` : '';
    prev.disabled = pos === 0;
    next.disabled = pos === keys.length - 1;
    updateSelectBtn();

    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    const rotated = (page.rotate || 0) % 180 !== 0;
    const ratio = rotated ? page.width / page.height : page.height / page.width;
    const maxW = Math.max(200, stage.clientWidth - (window.innerWidth < 640 ? 16 : 140));
    const maxH = Math.max(200, stage.clientHeight - 16);
    const cssWidth = Math.floor(Math.min(maxW, maxH / ratio, 1100));

    pageBox.classList.add('loading');
    pageBox.classList.remove('slide-left', 'slide-right');
    pageBox.style.width = `${cssWidth}px`;
    pageBox.style.height = `${Math.floor(cssWidth * ratio)}px`;
    clear(hlLayer);
    try {
      const off = document.createElement('canvas');
      const { page: pdfPage, cssScale } = await renderPage(page.fileId, page.index, off, cssWidth, { signal });
      if (signal.aborted) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext('2d').drawImage(off, 0, 0);
      canvas.style.width = `${cssWidth}px`;
      pageBox.style.height = `${(off.height / off.width) * cssWidth}px`;
      if (direction) {
        void pageBox.offsetWidth;
        pageBox.classList.add(direction > 0 ? 'slide-left' : 'slide-right');
      }
      if (query) {
        const rects = await findTextRects(pdfPage, cssScale, makeMatcher(query));
        if (signal.aborted) return;
        rects.forEach((r, i) =>
          hlLayer.append(
            h('span.hl', {
              style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, '--i': i },
            })
          )
        );
      }
    } catch (e) {
      if (!signal.aborted) console.error(e);
    } finally {
      if (!signal.aborted) pageBox.classList.remove('loading');
    }
  }

  function go(delta) {
    const n = pos + delta;
    if (n < 0 || n >= keys.length) return;
    pos = n;
    show(delta);
  }

  const onKey = (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      actions.togglePage(keys[pos]);
    }
  };
  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => show(), 200);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  const offSel = on('selection', updateSelectBtn);

  // Wischen auf dem Smartphone
  let startX = null;
  let startY = null;
  stage.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    startX = null;
  });

  requestAnimationFrame(() => show());
  return modal;
}
