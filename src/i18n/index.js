import de from './de.js';
import fr from './fr.js';

const dictionaries = { de, fr };
export const LANGUAGES = ['de', 'fr'];
const STORAGE_KEY = 'pa_lang';
const listeners = new Set();

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {}
  const nav = (navigator.languages || [navigator.language || 'de']).join(',').toLowerCase();
  const fr = nav.indexOf('fr');
  const de = nav.indexOf('de');
  return fr !== -1 && (de === -1 || fr < de) ? 'fr' : 'de';
}

let current = detectLanguage();
document.documentElement.lang = current;

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  applyTranslations(document);
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, params) {
  let str = dictionaries[current][key] ?? dictionaries.de[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

/** Plural helper: picks key1 for n === 1, key0 for n === 0 (if given), otherwise key. */
export function tn(n, key, key1, key0, params = {}) {
  if (n === 0 && key0) return t(key0, { n, ...params });
  if (n === 1 && key1) return t(key1, { n, ...params });
  return t(key, { n, ...params });
}

/** Translates every element with data-i18n* attributes inside root. */
export function applyTranslations(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', t(el.dataset.i18nTitle));
  });
}

export function formatDate(ts) {
  return new Intl.DateTimeFormat(current === 'fr' ? 'fr-FR' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts));
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(current === 'fr' ? 'fr-FR' : 'de-DE', {
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(n)} ${units[i]}`;
}
