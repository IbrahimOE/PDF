import { registerSW } from 'virtual:pwa-register';
import { h, icon } from './dom.js';
import { t } from '../i18n/index.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';

let deferredPrompt = null;
const listeners = new Set();
const launchFiles = [];
let launchListener = null;

const notify = () => listeners.forEach((fn) => fn());

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  navigator.standalone === true;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = () => /android/i.test(navigator.userAgent);

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
    toast(t('install.installed'), 'success');
  });

  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        toast(t('install.update'), 'info', {
          duration: 0,
          action: { label: t('install.updateBtn'), onClick: () => updateSW(true) },
        });
      },
    });
  }

  // Windows: „Öffnen mit → PDF Atelier“ (File Handling API der installierten App)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      const files = await Promise.all(params.files.map((fh) => fh.getFile()));
      launchFiles.push(...files);
      launchListener?.();
    });
  }
}

/** Dateien, mit denen die App gestartet wurde, abholen (einmalig). */
export function onLaunchFiles(fn) {
  launchListener = () => {
    if (launchFiles.length) fn(launchFiles.splice(0));
  };
  launchListener();
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canInstall = () => !isStandalone();
export const hasNativePrompt = () => !!deferredPrompt;

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    notify();
    return;
  }
  showInstructions();
}

function steps(titleKey, iconName, keys, highlight) {
  return h(
    `section.install-block${highlight ? '.highlight' : ''}`,
    {},
    h('h3', {}, icon(iconName, 20), t(titleKey)),
    h('ol', {}, keys.map((k) => h('li', {}, t(k))))
  );
}

function showInstructions() {
  const ios = isIos();
  const android = isAndroid();
  const blocks = [
    steps('install.iosTitle', 'phone', ['install.ios1', 'install.ios2', 'install.ios3'], ios),
    steps('install.androidTitle', 'phone', ['install.android1', 'install.android2'], android),
    steps('install.desktopTitle', 'monitor', ['install.desktop1', 'install.desktop2', 'install.desktop3'], !ios && !android),
  ];
  blocks.sort((a, b) => b.classList.contains('highlight') - a.classList.contains('highlight'));
  openModal({
    title: t('install.title'),
    className: 'install-modal',
    content: [
      h('div.install-hero', {}, h('img', { src: '/icons/icon.svg', alt: '', width: 72, height: 72 }), h('p.muted', {}, t('install.text'))),
      ...blocks,
    ],
  });
}
