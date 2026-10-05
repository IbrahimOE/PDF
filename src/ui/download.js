import { h, icon } from './dom.js';
import { t } from '../i18n/index.js';
import { openModal } from './modal.js';
import { promptInstall, canInstall, isIos, isAndroid, isDesktopApp } from './install.js';

// Adresse der Windows-Installationsdatei (wird von GitHub Actions gebaut, siehe README).
export const DESKTOP_DOWNLOAD_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL ||
  'https://github.com/IbrahimOE/PDF/releases/latest/download/PDF-Atelier-Setup.exe';

const isWindows = () => /windows/i.test(navigator.userAgent);

/** Reiter-Button „Download“ (Kopfzeile und Anmeldeseite). In der Windows-App selbst ausgeblendet. */
export function downloadButton(extraClass = '') {
  if (isDesktopApp()) return null;
  return h(
    `button.btn.ghost.sm.download-tab${extraClass}`,
    { type: 'button', id: 'download-tab', onclick: () => openDownload() },
    icon('download', 18),
    h('span.download-label', { 'data-i18n': 'download.tab' }, t('download.tab'))
  );
}

function card({ iconName, title, text, action, highlight, children }) {
  return h(
    `section.download-card${highlight ? '.highlight' : ''}`,
    {},
    h('div.download-card-icon', {}, icon(iconName, 26)),
    h('div.download-card-body', {}, h('h3', {}, title), h('p.muted', {}, text), children, action)
  );
}

export function openDownload() {
  const mobile = isIos() || isAndroid();

  const windows = card({
    iconName: 'monitor',
    title: t('download.winTitle'),
    text: t('download.winText'),
    highlight: isWindows(),
    action: h(
      'div.download-actions',
      {},
      h(
        'a.btn.primary',
        { href: DESKTOP_DOWNLOAD_URL, download: 'PDF-Atelier-Setup.exe', rel: 'noopener' },
        icon('download', 18),
        t('download.winBtn')
      ),
      h('p.download-hint.small.muted', {}, icon('info', 14), h('span', {}, t('download.winHint')))
    ),
  });

  const browser =
    canInstall() &&
    card({
      iconName: 'install',
      title: t('download.pwaTitle'),
      text: t('download.pwaText'),
      action: h(
        'div.download-actions',
        {},
        h('button.btn.secondary', { type: 'button', onclick: () => promptInstall() }, icon('install', 18), t('download.pwaBtn'))
      ),
    });

  const phone = card({
    iconName: 'phone',
    title: t('download.mobileTitle'),
    text: t('download.mobileText'),
    highlight: mobile,
    children: h(
      'div.download-steps',
      {},
      h('strong', {}, 'iPhone / iPad'),
      h('ol', {}, ['install.ios1', 'install.ios2', 'install.ios3'].map((k) => h('li', {}, t(k)))),
      h('strong', {}, 'Android'),
      h('ol', {}, ['install.android1', 'install.android2'].map((k) => h('li', {}, t(k))))
    ),
  });

  const cards = mobile ? [phone, browser, windows] : [windows, browser, phone];
  openModal({
    title: t('download.title'),
    className: 'download-modal',
    content: [h('p.muted', {}, t('download.text')), ...cards.filter(Boolean)],
  });
}
