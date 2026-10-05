import { h, icon } from './dom.js';
import { t } from '../i18n/index.js';

/**
 * Öffnet ein Dialogfenster mit Ein-/Ausblend-Animation.
 * @returns {{ el: HTMLElement, body: HTMLElement, close: Function }}
 */
export function openModal({ title, content, className = '', onClose, dismissible = true } = {}) {
  const previouslyFocused = document.activeElement;
  const body = h('div.modal-body', {}, content);
  const titleId = `m-${Math.random().toString(36).slice(2)}`;
  const dialog = h(
    `div.modal.${className || 'default'}`,
    { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title ? titleId : null },
    title &&
      h(
        'div.modal-head',
        {},
        h('h2.modal-title', { id: titleId }, title),
        dismissible &&
          h('button.icon-btn.ghost', { type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, icon('x'))
      ),
    body
  );
  const backdrop = h('div.modal-backdrop', {
    onclick: (e) => {
      if (e.target === backdrop && dismissible) close();
    },
  }, dialog);

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
    if (e.key === 'Tab') trapFocus(e, dialog);
  };

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('leaving');
    const done = () => {
      backdrop.remove();
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
    };
    backdrop.addEventListener('animationend', done, { once: true });
    setTimeout(done, 350);
    previouslyFocused?.focus?.({ preventScroll: true });
    onClose?.(result);
  }

  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    const focusable = dialog.querySelector('[autofocus], input, button.primary, button');
    focusable?.focus({ preventScroll: true });
  });
  return { el: dialog, body, close };
}

function trapFocus(e, root) {
  const items = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

export function confirmDialog({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      className: 'small',
      onClose: (r) => resolve(!!r),
      content: [
        h('p.muted', {}, text),
        h(
          'div.modal-actions',
          {},
          h('button.btn.secondary', { type: 'button', onclick: () => m.close(false) }, t('common.cancel')),
          h(
            `button.btn.${danger ? 'danger' : 'primary'}`,
            { type: 'button', onclick: () => m.close(true) },
            confirmLabel || t('common.ok')
          )
        ),
      ],
    });
  });
}
