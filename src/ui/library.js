import { h, icon, clear, highlighted, withTransition } from './dom.js';
import { t, tn, formatBytes, formatDate } from '../i18n/index.js';
import { state, on, pagesOfFile, selectionIndex, allPagesOrdered } from '../state.js';
import * as actions from '../actions.js';
import { getThumbnail, cachedThumbnail } from '../services/pdf.js';
import { searchPages, queryTokens, highlightRanges } from '../services/search.js';
import { confirmDialog } from './modal.js';
import { openViewer } from './viewer.js';
import { toast } from './toast.js';

let observer;

function thumbObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        loadThumb(entry.target);
      }
    },
    { rootMargin: '400px 0px' }
  );
  return observer;
}

function loadThumb(img) {
  const { file, index } = img.dataset;
  getThumbnail(file, Number(index))
    .then((url) => {
      img.src = url;
      img.decode?.().catch(() => {}).finally(() => img.closest('.thumb')?.classList.add('loaded'));
      if (!img.decode) img.closest('.thumb')?.classList.add('loaded');
    })
    .catch(() => img.closest('.thumb')?.classList.add('failed'));
}

/** Miniaturbild einer Seite; wird erst geladen, wenn es sichtbar ist. */
export function thumbImage(fileId, index, rotation = 0) {
  const img = h('img', { alt: '', draggable: false, dataset: { file: fileId, index: String(index) } });
  const wrap = h('div.thumb', { style: { '--rot': `${rotation}deg` } }, img);
  const cached = cachedThumbnail(fileId, index);
  if (cached) {
    img.src = cached;
    wrap.classList.add('loaded', 'instant');
  } else {
    thumbObserver().observe(img);
  }
  return wrap;
}

function pageCard(page, { query, result, stagger = 0 } = {}) {
  const thumb = thumbImage(page.fileId, page.index);
  thumb.append(
    h('span.sel-badge', { 'aria-hidden': 'true' }),
    h(
      'button.zoom-btn',
      {
        type: 'button',
        title: t('library.preview'),
        'aria-label': t('library.preview'),
        onclick: (e) => {
          e.stopPropagation();
          const keys = result ? currentResultKeys : pagesOfFile(page.fileId).map((p) => p.key);
          openViewer(keys, keys.indexOf(page.key), { query });
        },
      },
      icon('eye', 18)
    )
  );
  if (result?.headingMatch) thumb.append(h('span.heading-badge', {}, t('search.headingBadge')));

  const tokens = query ? queryTokens(query) : [];
  const headingText = page.heading || '';
  const headingEl = h(
    'span.page-heading',
    { title: headingText },
    headingText
      ? tokens.length
        ? highlighted(headingText, highlightRanges(headingText, tokens))
        : headingText
      : h('em', {}, t('library.noHeading'))
  );

  const card = h(
    'div.page-card',
    {
      role: 'button',
      tabindex: '0',
      dataset: { key: page.key },
      style: { '--i': Math.min(stagger, 24) },
      onclick: () => actions.togglePage(page.key),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          actions.togglePage(page.key);
        }
      },
    },
    thumb,
    h('div.page-meta', {}, h('span.page-no', {}, t('library.pageShort', { n: page.index + 1 })), headingEl)
  );
  if (result) {
    const file = state.files.find((f) => f.id === page.fileId);
    card.classList.add('result-card');
    card.append(
      h('div.result-file', {}, icon('file', 14), h('span', {}, file?.name ?? '')),
      result.snippet.text && h('p.snippet', {}, highlighted(result.snippet.text, result.snippet.ranges))
    );
  }
  return card;
}

// ---------- Ansichten ----------

function emptyState() {
  return h(
    'div.empty-state',
    { id: 'dropzone' },
    h(
      'div.empty-art',
      { 'aria-hidden': 'true' },
      h('div.empty-sheet.s1'),
      h('div.empty-sheet.s2'),
      h('div.empty-sheet.s3', {}, icon('upload', 34))
    ),
    h('h2', {}, t('library.emptyTitle')),
    h('p.muted', {}, t('library.emptyText')),
    h(
      'div.empty-actions',
      {},
      h('button.btn.primary.lg', { type: 'button', onclick: () => document.getElementById('file-input').click() }, icon('upload', 20), t('library.emptyCta')),
      h(
        'button.btn.secondary.lg',
        {
          type: 'button',
          id: 'btn-sample',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            await actions.addSample();
          },
        },
        icon('sparkles', 20),
        t('library.sample')
      )
    )
  );
}

function fileActions(file, { compact = false } = {}) {
  const missing = actions.pagesWithoutText(file.id).length;
  const ocrState = state.ocr.get(file.id);
  const full = actions.isFileFullySelected(file.id);
  return h(
    'div.file-actions',
    {},
    missing > 0 &&
      !ocrState &&
      h(
        'button.btn.ghost.sm.ocr-btn',
        { type: 'button', title: t('library.ocrHint', { n: missing }), onclick: () => actions.runOcr(file.id) },
        icon('ocr', 16),
        h('span.hide-sm', {}, t('library.ocr'))
      ),
    h(
      `button.btn.sm.select-file${full ? '.active' : ''}`,
      { type: 'button', dataset: { file: file.id }, onclick: () => actions.toggleFile(file.id) },
      icon(full ? 'check' : 'plus', 16),
      h('span', {}, t(full ? 'library.deselectFile' : 'library.selectFile'))
    ),
    !compact &&
      h(
        'button.icon-btn.ghost.danger-hover',
        { type: 'button', title: t('library.delete'), 'aria-label': t('library.delete'), onclick: () => askDelete(file) },
        icon('trash', 18)
      )
  );
}

function ocrProgress(file) {
  const s = state.ocr.get(file.id);
  if (!s) return null;
  return h(
    'div.inline-progress',
    { dataset: { ocr: file.id } },
    h('span.spinner.dark'),
    h('span.label', {}, t('library.ocrRunning', { done: s.done, total: s.total })),
    h('div.progress', {}, h('i', { style: { width: `${(s.done / s.total) * 100}%` } }))
  );
}

async function askDelete(file) {
  const ok = await confirmDialog({
    title: t('library.deleteTitle'),
    text: t('library.deleteText', { name: file.name }),
    confirmLabel: t('common.delete'),
    danger: true,
  });
  if (ok) {
    await actions.removeFile(file.id);
    toast(t('library.deleted', { name: file.name }), 'info');
  }
}

function fileMeta(file) {
  return `${tn(file.pageCount, 'library.pages', 'library.page')} · ${formatBytes(file.size)} · ${t('library.added', { date: formatDate(file.addedAt) })}`;
}

/** Waagerechte Seitenleiste (Dokumentreihenfolge von links nach rechts) mit Blätter-Pfeilen. */
function pageStrip(strip) {
  const scrollBy = (dir) => strip.scrollBy({ left: dir * strip.clientWidth * 0.8, behavior: 'smooth' });
  const prev = h('button.strip-nav.prev', { type: 'button', 'aria-label': t('viewer.prev'), onclick: () => scrollBy(-1) }, icon('chevronLeft', 22));
  const next = h('button.strip-nav.next', { type: 'button', 'aria-label': t('viewer.next'), onclick: () => scrollBy(1) }, icon('chevronRight', 22));
  const wrap = h('div.strip-wrap', {}, prev, strip, next);
  const update = () => {
    const max = strip.scrollWidth - strip.clientWidth;
    wrap.classList.toggle('can-prev', strip.scrollLeft > 4);
    wrap.classList.toggle('can-next', strip.scrollLeft < max - 4);
  };
  strip.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(strip);
  return wrap;
}

function gridView() {
  let stagger = 0;
  return h(
    'div.grid-view',
    {},
    state.files.map((file) =>
      h(
        'section.file-section',
        { dataset: { file: file.id } },
        h(
          'div.file-head',
          {},
          h('span.file-badge', {}, 'PDF'),
          h('div.file-info', {}, h('h3.file-name', { title: file.name }, file.name), h('span.file-meta', {}, fileMeta(file))),
          fileActions(file)
        ),
        ocrProgress(file),
        pageStrip(h('div.page-strip', {}, pagesOfFile(file.id).map((p) => pageCard(p, { stagger: stagger++ }))))
      )
    )
  );
}

function listView() {
  return h(
    'div.list-view',
    {},
    state.files.map((file, i) => {
      const expanded = state.expanded.has(file.id);
      const row = h(
        'div.file-row',
        { dataset: { file: file.id }, style: { '--i': i } },
        h(
          'button.file-check',
          { type: 'button', dataset: { file: file.id }, 'aria-label': t('library.selectFile'), onclick: () => actions.toggleFile(file.id) },
          icon('check', 16)
        ),
        h('div.row-thumb', {}, thumbImage(file.id, 0)),
        h(
          'div.file-info',
          {},
          h('h3.file-name', { title: file.name }, file.name),
          h('span.file-meta', {}, fileMeta(file))
        ),
        h(
          'div.row-actions',
          {},
          fileActions(file, { compact: true }),
          h(
            `button.icon-btn.ghost.expand${expanded ? '.open' : ''}`,
            {
              type: 'button',
              title: t(expanded ? 'library.hidePages' : 'library.showPages'),
              'aria-label': t(expanded ? 'library.hidePages' : 'library.showPages'),
              'aria-expanded': String(expanded),
              onclick: () => actions.toggleExpanded(file.id),
            },
            icon('chevronDown', 20)
          ),
          h(
            'button.icon-btn.ghost.danger-hover',
            { type: 'button', title: t('library.delete'), 'aria-label': t('library.delete'), onclick: () => askDelete(file) },
            icon('trash', 18)
          )
        )
      );
      const pages =
        expanded &&
        pageStrip(
        h(
          'div.row-pages.page-strip',
          {},
          pagesOfFile(file.id).map((p) =>
            h(
              'div.page-line',
              {
                role: 'button',
                tabindex: '0',
                dataset: { key: p.key },
                onclick: () => actions.togglePage(p.key),
                onkeydown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    actions.togglePage(p.key);
                  }
                },
              },
              h('span.line-check', {}, icon('check', 14)),
              h('div.line-thumb', {}, thumbImage(p.fileId, p.index)),
              h('span.page-no', {}, t('library.pageShort', { n: p.index + 1 })),
              h('span.page-heading', { title: p.heading }, p.heading || h('em', {}, t('library.noHeading'))),
              h('span.sel-badge'),
              h(
                'button.icon-btn.ghost.sm',
                {
                  type: 'button',
                  'aria-label': t('library.preview'),
                  title: t('library.preview'),
                  onclick: (e) => {
                    e.stopPropagation();
                    const keys = pagesOfFile(file.id).map((x) => x.key);
                    openViewer(keys, p.index);
                  },
                },
                icon('eye', 16)
              )
            )
          )
        ));
      return h('div.file-block', {}, row, ocrProgress(file), pages);
    })
  );
}

let currentResults = [];
let currentResultKeys = [];

function runSearch() {
  currentResults = searchPages(allPagesOrdered(), state.query);
  currentResultKeys = currentResults.map((r) => r.page.key);
  return currentResults;
}

function searchView() {
  const results = runSearch();
  const q = state.query.trim();
  if (!results.length) {
    return h(
      'div.search-empty',
      {},
      h('div.search-empty-icon', {}, icon('search', 36)),
      h('h2', {}, t('search.none', { q })),
      h('p.muted', {}, t('search.noneHint'))
    );
  }
  return h(
    'div.search-view',
    {},
    h(
      'div.search-head',
      {},
      h('div', {}, h('h2', {}, results.length === 1 ? t('search.result1', { q }) : t('search.results', { n: results.length, q })), h('p.muted.small', {}, t('search.hint'))),
      h(
        'button.btn.secondary.sm',
        { type: 'button', onclick: () => actions.selectKeys(currentResultKeys) },
        icon('listChecks', 16),
        t('search.selectAll')
      )
    ),
    h('div.page-grid.results', {}, results.map((r, i) => pageCard(r.page, { query: q, result: r, stagger: i })))
  );
}

/** Enter in der Suche: passende Seiten automatisch auswählen und die beste anzeigen. */
export function autoSelectFromSearch() {
  const q = state.query.trim();
  if (!q) return;
  const results = runSearch();
  if (!results.length) return;
  const headingHits = results.filter((r) => r.headingMatch);
  const picks = (headingHits.length ? headingHits : [results[0]]).map((r) => r.page.key);
  actions.selectKeys(picks);
  toast(t('search.autoSelected', { n: picks.length, q }), 'success');
  openViewer(currentResultKeys, currentResultKeys.indexOf(picks[0]), { query: q });
}

// ---------- Rendern & Synchronisieren ----------

export function syncSelection(root = document) {
  root.querySelectorAll('[data-key]').forEach((el) => {
    const i = selectionIndex(el.dataset.key);
    el.classList.toggle('selected', i !== -1);
    el.setAttribute('aria-pressed', String(i !== -1));
    const badge = el.querySelector('.sel-badge');
    if (badge) badge.textContent = i !== -1 ? String(i + 1) : '';
  });
  root.querySelectorAll('.file-check[data-file]').forEach((el) => {
    const pages = pagesOfFile(el.dataset.file);
    const n = pages.filter((p) => selectionIndex(p.key) !== -1).length;
    el.classList.toggle('full', n > 0 && n === pages.length);
    el.classList.toggle('partial', n > 0 && n < pages.length);
  });
  root.querySelectorAll('.select-file[data-file]').forEach((el) => {
    const full = actions.isFileFullySelected(el.dataset.file);
    if (el.classList.contains('active') === full) return;
    el.classList.toggle('active', full);
    clear(el).append(icon(full ? 'check' : 'plus', 16), h('span', {}, t(full ? 'library.deselectFile' : 'library.selectFile')));
  });
}

export function mountLibrary(container, statsEl) {
  function render({ transition = false } = {}) {
    const draw = () => {
      let view;
      if (state.query.trim()) view = searchView();
      else if (!state.files.length) view = emptyState();
      else view = state.view === 'list' ? listView() : gridView();
      clear(container).append(view);
      container.dataset.view = state.query.trim() ? 'search' : state.files.length ? state.view : 'empty';
      syncSelection(container);
      const pages = state.files.reduce((s, f) => s + f.pageCount, 0);
      statsEl.textContent = state.files.length
        ? `${tn(state.files.length, 'library.fileCount', 'library.fileCount1')} · ${tn(pages, 'library.pages', 'library.page')}`
        : '';
    };
    transition ? withTransition(draw) : draw();
  }

  const offs = [
    on('files', () => render()),
    on('view', () => render({ transition: true })),
    on('query', () => render()),
    on('selection', () => syncSelection(container)),
    on('ocr', (fileId) => {
      const s = state.ocr.get(fileId);
      const bar = container.querySelector(`[data-ocr="${fileId}"]`);
      if (s && bar) {
        bar.querySelector('.label').textContent = t('library.ocrRunning', { done: s.done, total: s.total });
        bar.querySelector('.progress i').style.width = `${(s.done / s.total) * 100}%`;
      }
    }),
  ];
  render();
  return { render, destroy: () => offs.forEach((off) => off()) };
}
