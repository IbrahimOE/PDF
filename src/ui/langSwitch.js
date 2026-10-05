import { h, icon, flagSvg, clear } from './dom.js';
import { t, getLang, setLang, LANGUAGES, onLangChange } from '../i18n/index.js';

/** Sprach-Dropdown (oben rechts). onPick wird nach dem Wechsel aufgerufen. */
export function langSwitch({ onPick } = {}) {
  const label = h('span.lang-code');
  const flagHost = h('span.flag-host');
  const btn = h(
    'button.lang-btn',
    { type: 'button', id: 'lang-switch', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    flagHost,
    label,
    icon('chevronDown', 16)
  );
  const menu = h('div.dropdown.lang-menu', { role: 'listbox', hidden: true });
  const wrap = h('div.dropdown-wrap', {}, btn, menu);

  function render() {
    const lang = getLang();
    clear(flagHost).append(flagSvg(lang));
    label.textContent = lang.toUpperCase();
    btn.setAttribute('aria-label', `${t('lang.label')}: ${t(`lang.${lang}`)}`);
    btn.title = t('lang.label');
    clear(menu);
    for (const l of LANGUAGES) {
      menu.append(
        h(
          'button.dropdown-item',
          {
            type: 'button',
            role: 'option',
            'aria-selected': String(l === lang),
            class: l === lang ? 'active' : '',
            onclick: () => {
              close();
              setLang(l);
              onPick?.(l);
            },
          },
          flagSvg(l),
          h('span', {}, t(`lang.${l}`)),
          l === lang && icon('check', 16, { class: 'icon check' })
        )
      );
    }
  }

  function open() {
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
    if (!wrap.contains(e.target)) close();
  };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      btn.focus();
    }
  });

  render();
  const off = onLangChange(render);
  wrap.destroy = off;
  return wrap;
}
