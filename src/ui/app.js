import { h, icon, clear } from './dom.js';
import { t, onLangChange, applyTranslations, formatBytes } from '../i18n/index.js';
import { state, on } from '../state.js';
import * as actions from '../actions.js';
import { langSwitch } from './langSwitch.js';
import { mountLibrary, autoSelectFromSearch } from './library.js';
import { mountTray } from './tray.js';
import { promptInstall, canInstall } from './install.js';
import { downloadButton } from './download.js';
import { storageEstimate } from '../services/db.js';

/** Hauptansicht nach der Anmeldung. */
export function renderApp(root, { onLogout, onTutorial, onLangPicked }) {
  const fileInput = h('input', {
    id: 'file-input',
    type: 'file',
    accept: 'application/pdf,.pdf',
    multiple: true,
    hidden: true,
    onchange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) await actions.importFiles(files);
    },
  });

  // ---------- Kopfzeile ----------
  const userMenu = buildUserMenu({ onLogout, onTutorial });
  const header = h(
    'header.app-header',
    {},
    h('div.brand', {}, h('img', { src: '/icons/icon.svg', alt: '', width: 34, height: 34 }), h('span', { 'data-i18n': 'app.name' })),
    h('div.header-spacer'),
    downloadButton(),
    langSwitch({ onPick: onLangPicked }),
    userMenu.el
  );

  // ---------- Werkzeugleiste ----------
  const searchInput = h('input.search-input', {
    id: 'search-input',
    type: 'search',
    autocomplete: 'off',
    spellcheck: false,
    enterkeyhint: 'search',
    'data-i18n-ph': 'toolbar.searchPh',
    'aria-label': t('toolbar.search'),
  });
  const clearSearch = h(
    'button.icon-btn.ghost.sm.search-clear',
    {
      type: 'button',
      'data-i18n-title': 'toolbar.clearSearch',
      hidden: true,
      onclick: () => {
        searchInput.value = '';
        clearSearch.hidden = true;
        actions.setQuery('');
        searchInput.focus();
      },
    },
    icon('x', 18)
  );
  let debounce;
  searchInput.addEventListener('input', () => {
    clearSearch.hidden = !searchInput.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => actions.setQuery(searchInput.value), 160);
  });
  const searchForm = h(
    'form.search',
    {
      id: 'search-form',
      role: 'search',
      onsubmit: (e) => {
        e.preventDefault();
        clearTimeout(debounce);
        actions.setQuery(searchInput.value);
        autoSelectFromSearch();
        if (window.matchMedia('(pointer: coarse)').matches) searchInput.blur();
      },
    },
    icon('search', 20, { class: 'icon search-icon' }),
    searchInput,
    clearSearch,
    h('kbd.search-kbd', { 'aria-hidden': 'true' }, 'Ctrl K')
  );

  const viewToggle = h(
    'div.segmented.view-toggle',
    { id: 'view-toggle', role: 'radiogroup', 'data-i18n-title': 'toolbar.view' },
    h('span.segmented-thumb'),
    h('button', { type: 'button', role: 'radio', dataset: { view: 'list' }, onclick: () => actions.setView('list') }, icon('list', 18), h('span', { 'data-i18n': 'toolbar.viewList' })),
    h('button', { type: 'button', role: 'radio', dataset: { view: 'grid' }, onclick: () => actions.setView('grid') }, icon('grid', 18), h('span', { 'data-i18n': 'toolbar.viewGrid' }))
  );
  const syncView = () => {
    viewToggle.dataset.active = state.view === 'list' ? '0' : '1';
    viewToggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === state.view)));
  };

  const uploadBtn = h(
    'button.btn.primary.upload-btn',
    { type: 'button', id: 'btn-upload', onclick: () => fileInput.click() },
    icon('upload', 20),
    h('span.hide-xs', { 'data-i18n': 'toolbar.upload' }),
    h('span.show-xs', { 'data-i18n': 'toolbar.uploadShort' })
  );

  const toolbar = h('div.toolbar', {}, searchForm, h('div.toolbar-actions', {}, viewToggle, uploadBtn));

  // ---------- Bibliothek ----------
  const stats = h('span.lib-stats');
  const selectAllBtn = h(
    'button.btn.ghost.sm.select-all',
    { type: 'button', onclick: () => actions.selectAll() },
    icon('listChecks', 16),
    h('span', { 'data-i18n': 'toolbar.selectAll' })
  );
  const libHead = h('div.lib-head', {}, h('div', {}, h('h1.lib-title', { 'data-i18n': 'library.title' }), stats), selectAllBtn);
  const processing = h('div.processing-card', { hidden: true });
  const library = h('div.library', { id: 'library' });

  const tray = h('aside.tray', { id: 'tray' });
  const workspace = h('main.workspace', {}, toolbar, libHead, processing, library);
  const body = h('div.app-body', {}, workspace, tray);
  const dropOverlay = h(
    'div.drop-overlay',
    { 'aria-hidden': 'true' },
    h('div.drop-box', {}, h('div.drop-icon', {}, icon('upload', 40)), h('strong', { 'data-i18n': 'library.dropHere' }), h('span', { 'data-i18n': 'library.dropHint' }))
  );
  const shell = h('div.app-shell', {}, header, body, fileInput, dropOverlay);
  clear(root).append(shell);
  applyTranslations(shell);

  const lib = mountLibrary(library, stats);
  const trayCtl = mountTray(tray);
  syncView();

  const updateHead = () => {
    selectAllBtn.hidden = !state.files.length || !!state.query.trim();
    libHead.hidden = !!state.query.trim();
  };
  updateHead();

  function renderProcessing() {
    const p = state.processing;
    processing.hidden = !p;
    if (!p) return;
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 5;
    processing.replaceChildren(
      h('div.processing-icon', {}, h('span.spinner.dark')),
      h(
        'div.processing-text',
        {},
        h('strong', {}, t('library.processing')),
        h('span.muted.small', {}, p.total ? t('library.processingDetail', { name: p.name, done: p.done, total: p.total }) : p.name),
        h('div.progress', {}, h('i', { style: { width: `${pct}%` } }))
      )
    );
  }

  // ---------- Drag & Drop ----------
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    shell.classList.add('dragging');
  };
  const onDragOver = (e) => {
    if (hasFiles(e)) e.preventDefault();
  };
  const onDragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) shell.classList.remove('dragging');
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    shell.classList.remove('dragging');
    actions.importFiles(e.dataTransfer.files);
  };
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);

  // Tastenkürzel: Strg+K oder / fokussiert die Suche
  const onKey = (e) => {
    if (document.querySelector('.modal-backdrop, .tutorial')) return;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !/input|textarea/i.test(e.target.tagName))) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  };
  document.addEventListener('keydown', onKey);

  const offs = [
    on('view', syncView),
    on('files', updateHead),
    on('query', updateHead),
    on('processing', renderProcessing),
    onLangChange(() => {
      lib.render();
      trayCtl.renderTexts();
      userMenu.render();
      renderProcessing();
      searchInput.setAttribute('aria-label', t('toolbar.search'));
    }),
  ];

  return {
    destroy() {
      offs.forEach((off) => off());
      lib.destroy();
      trayCtl.destroy();
      userMenu.destroy();
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('keydown', onKey);
      shell.querySelectorAll('.dropdown-wrap').forEach((w) => w.destroy?.());
    },
  };
}

function buildUserMenu({ onLogout, onTutorial }) {
  const initial = (state.user?.email || '?').trim()[0].toUpperCase();
  const btn = h(
    'button.avatar-btn',
    { type: 'button', id: 'user-menu-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    h('span.avatar', {}, initial)
  );
  const menu = h('div.dropdown.user-menu', { role: 'menu', hidden: true });
  const el = h('div.dropdown-wrap', {}, btn, menu);

  async function render() {
    btn.setAttribute('aria-label', t('header.account'));
    btn.title = t('header.account');
    const usage = await storageEstimate();
    menu.replaceChildren(
      ...[
        h(
          'div.menu-user',
          {},
          h('span.avatar.lg', {}, initial),
          h('div', {}, h('span.muted.small', {}, t('menu.signedInAs')), h('strong.menu-email', {}, state.user?.email ?? '')),
          state.backendMode === 'demo' && h('span.pill', {}, t('menu.demo'))
        ),
        h('div.menu-sep'),
        item('tutorial', t('menu.tutorial'), () => onTutorial()),
        canInstall() && item('install', t('menu.install'), () => promptInstall()),
        h('div.menu-info', {}, icon('storage', 16), h('span', {}, t('menu.storage', { used: formatBytes(usage) }))),
        h('div.menu-sep'),
        item('logout', t('menu.logout'), () => onLogout(), 'danger'),
      ].filter(Boolean)
    );
  }

  function item(ic, label, fn, cls = '') {
    return h(
      `button.dropdown-item${cls ? `.${cls}` : ''}`,
      {
        type: 'button',
        role: 'menuitem',
        onclick: () => {
          close();
          fn();
        },
      },
      icon(ic, 18),
      h('span', {}, label)
    );
  }

  function open() {
    render();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('open'));
    setTimeout(() => document.addEventListener('click', outside), 0);
  }
  function close() {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside);
    setTimeout(() => {
      if (!menu.classList.contains('open')) menu.hidden = true;
    }, 180);
  }
  const outside = (e) => {
    if (!el.contains(e.target)) close();
  };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      btn.focus();
    }
  });
  render();
  return { el, render, destroy: () => document.removeEventListener('click', outside) };
}

