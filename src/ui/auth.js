import { h, icon, clear } from './dom.js';
import { t, getLang, onLangChange, applyTranslations } from '../i18n/index.js';
import { langSwitch } from './langSwitch.js';
import { downloadButton } from './download.js';
import { getBackend } from '../services/backend.js';

export const authFlags = { langPicked: false, justRegistered: false };

function passwordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, Math.max(pw.length >= 6 ? 1 : 0, s - (pw.length < 8 ? 1 : 0)));
}

function errorMessage(e) {
  const key = `err.${e?.code}`;
  const msg = t(key);
  return msg === key ? t('err.generic') : msg;
}

export function renderAuth(root) {
  const backend = getBackend();
  let mode = 'login';
  const values = { email: '', password: '', password2: '' };

  const card = h('section.auth-card');
  const hero = h(
    'section.auth-hero',
    {},
    h(
      'div.hero-inner',
      {},
      h('div.brand.big', {}, h('img', { src: '/icons/icon.svg', alt: '', width: 56, height: 56 }), h('span', { 'data-i18n': 'app.name' })),
      h('p.hero-tagline', { 'data-i18n': 'app.tagline' }),
      h(
        'ul.feature-list',
        {},
        [
          ['merge', 'auth.feature1'],
          ['listChecks', 'auth.feature2'],
          ['search', 'auth.feature3'],
          ['shield', 'auth.feature4'],
        ].map(([ic, key], i) =>
          h('li', { style: { '--i': i } }, h('span.feature-icon', {}, icon(ic, 20)), h('span', { 'data-i18n': key }))
        )
      ),
      h(
        'div.hero-art',
        { 'aria-hidden': 'true' },
        h('div.float-page.p1', {}, h('i'), h('i'), h('i')),
        h('div.float-page.p2', {}, h('i'), h('i'), h('i')),
        h('div.float-page.p3', {}, h('i'), h('i'), h('i')),
        h('div.float-badge', {}, icon('plus', 28))
      )
    )
  );

  const top = h(
    'header.auth-top',
    {},
    h('div.brand.small', {}, h('img', { src: '/icons/icon.svg', alt: '', width: 32, height: 32 }), h('span', { 'data-i18n': 'app.name' })),
    h('div.auth-top-actions', {}, downloadButton(), langSwitch({ onPick: () => (authFlags.langPicked = true) }))
  );

  const screen = h('div.auth-screen', {}, top, hero, h('div.auth-card-wrap', {}, card));
  clear(root).append(screen);
  applyTranslations(screen);

  function field({ id, type, labelKey, phKey, value, autocomplete, iconName, toggle }) {
    const input = h('input.input', {
      id,
      name: id,
      type,
      value,
      autocomplete,
      placeholder: phKey ? t(phKey) : '',
      required: true,
      spellcheck: false,
      autocapitalize: 'off',
      oninput: (e) => {
        values[id] = e.target.value;
        if (id === 'password' && mode === 'register') updateStrength();
      },
    });
    const wrap = h('div.input-wrap', {}, icon(iconName, 18, { class: 'icon input-icon' }), input);
    if (toggle) {
      const btn = h('button.icon-btn.ghost.pw-toggle', {
        type: 'button',
        'aria-label': t('auth.showPassword'),
        onclick: () => {
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.setAttribute('aria-label', t(show ? 'auth.hidePassword' : 'auth.showPassword'));
          clear(btn).append(icon(show ? 'eyeOff' : 'eye', 18));
        },
      }, icon('eye', 18));
      wrap.append(btn);
    }
    return h('label.field', { for: id }, h('span.field-label', {}, t(labelKey)), wrap);
  }

  let strengthEl;
  function updateStrength() {
    if (!strengthEl) return;
    const score = values.password ? passwordScore(values.password) : -1;
    strengthEl.dataset.score = score;
    strengthEl.querySelector('.strength-text').textContent = score >= 0 ? t(`auth.strength.${score}`) : '';
  }

  function render(animate = true) {
    const titles = {
      login: ['auth.welcome', 'auth.welcomeSub'],
      register: ['auth.createTitle', 'auth.createSub'],
      reset: ['auth.resetTitle', 'auth.resetSub'],
    }[mode];

    const errorBox = h('div.form-error', { role: 'alert', hidden: true });
    const successBox = h('div.form-success', { role: 'status', hidden: true });
    const submit = h(
      'button.btn.primary.block.submit',
      { type: 'submit' },
      h('span.btn-label', {}, t(mode === 'login' ? 'auth.login' : mode === 'register' ? 'auth.register' : 'auth.sendReset')),
      h('span.spinner', { 'aria-hidden': 'true' })
    );

    const fields = [
      field({ id: 'email', type: 'email', labelKey: 'auth.email', phKey: 'auth.emailPh', value: values.email, autocomplete: 'email', iconName: 'mail' }),
    ];
    if (mode !== 'reset') {
      fields.push(
        field({
          id: 'password',
          type: 'password',
          labelKey: 'auth.password',
          phKey: mode === 'register' ? 'auth.passwordPh' : null,
          value: values.password,
          autocomplete: mode === 'register' ? 'new-password' : 'current-password',
          iconName: 'lock',
          toggle: true,
        })
      );
    }
    if (mode === 'register') {
      strengthEl = h('div.strength', { 'data-score': '-1' }, h('div.strength-bar', {}, h('i'), h('i'), h('i'), h('i'), h('i')), h('span.strength-text'));
      fields.push(strengthEl);
      fields.push(
        field({ id: 'password2', type: 'password', labelKey: 'auth.passwordRepeat', value: values.password2, autocomplete: 'new-password', iconName: 'lock', toggle: true })
      );
    } else strengthEl = null;

    const form = h(
      'form.auth-form',
      {
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          errorBox.hidden = true;
          successBox.hidden = true;
          if (mode === 'register' && values.password !== values.password2) {
            showError(errorBox, t('auth.mismatch'));
            return;
          }
          submit.classList.add('loading');
          submit.disabled = true;
          try {
            if (mode === 'login') {
              await backend.login(values.email.trim(), values.password, getLang());
            } else if (mode === 'register') {
              authFlags.justRegistered = true;
              await backend.register(values.email.trim(), values.password, getLang());
            } else {
              await backend.resetPassword(values.email.trim(), getLang());
              successBox.textContent = backend.mode === 'demo' ? `${t('auth.resetSent')} ${t('auth.resetSentDemo')}` : t('auth.resetSent');
              successBox.hidden = false;
            }
          } catch (err) {
            authFlags.justRegistered = false;
            showError(errorBox, errorMessage(err));
          } finally {
            submit.classList.remove('loading');
            submit.disabled = false;
          }
        },
      },
      fields,
      mode === 'login' &&
        h('div.form-row.end', {}, h('button.link', { type: 'button', onclick: () => go('reset') }, t('auth.forgot'))),
      errorBox,
      successBox,
      submit
    );

    const switcher =
      mode === 'reset'
        ? h('p.auth-switch', {}, h('button.link.with-icon', { type: 'button', onclick: () => go('login') }, icon('back', 16), t('auth.backToLogin')))
        : h(
            'p.auth-switch',
            {},
            t(mode === 'login' ? 'auth.noAccount' : 'auth.hasAccount'),
            ' ',
            h('button.link', { type: 'button', onclick: () => go(mode === 'login' ? 'register' : 'login') }, t(mode === 'login' ? 'auth.tabRegister' : 'auth.tabLogin'))
          );

    const tabs =
      mode !== 'reset' &&
      h(
        'div.segmented.auth-tabs',
        { role: 'tablist', 'data-active': mode === 'login' ? '0' : '1' },
        h('span.segmented-thumb'),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === 'login'), onclick: () => go('login') }, t('auth.tabLogin')),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === 'register'), onclick: () => go('register') }, t('auth.tabRegister'))
      );

    const inner = h(
      `div.auth-card-inner${animate ? '.swap' : ''}`,
      {},
      backend.mode === 'demo' && h('div.demo-banner', {}, icon('info', 18), h('span', {}, t('auth.demoBanner'))),
      tabs,
      h('h1.auth-title', {}, t(titles[0])),
      h('p.auth-sub', {}, t(titles[1])),
      form,
      switcher
    );
    clear(card).append(inner);
    updateStrength();
  }

  function showError(box, msg) {
    box.textContent = msg;
    box.hidden = false;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function go(next) {
    if (next === mode) return;
    mode = next;
    render(true);
    card.querySelector('input')?.focus({ preventScroll: true });
  }

  render(false);
  const offLang = onLangChange(() => render(false));
  return () => {
    offLang();
    screen.querySelectorAll('.dropdown-wrap').forEach((w) => w.destroy?.());
  };
}
