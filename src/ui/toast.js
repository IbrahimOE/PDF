import { h, icon } from './dom.js';

let host;

/**
 * Kurze Hinweis-Meldung unten im Bild.
 * @param {'info'|'success'|'warn'|'error'} type
 * @param {{label: string, onClick: Function}} [action]
 */
export function toast(message, type = 'info', { action, duration = 4200 } = {}) {
  if (!host) {
    host = h('div.toast-host', { role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const close = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  const el = h(
    `div.toast.${type}`,
    {},
    h('span.toast-icon', {}, icon(type === 'info' ? 'info' : type, 20)),
    h('span.toast-text', {}, message),
    action &&
      h(
        'button.toast-action',
        {
          type: 'button',
          onclick: () => {
            action.onClick();
            close();
          },
        },
        action.label
      ),
    h('button.toast-close', { type: 'button', 'aria-label': '×', onclick: close }, icon('x', 16))
  );
  host.append(el);
  if (duration) setTimeout(close, duration);
  return close;
}
