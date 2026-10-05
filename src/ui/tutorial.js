import { h, icon, prefersReducedMotion } from './dom.js';
import { t, onLangChange } from '../i18n/index.js';

const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

function buildSteps() {
  return [
    { key: 'welcome' },
    { key: 'upload', target: '#btn-upload' },
    { key: 'sample', target: '#btn-sample' },
    { key: 'view', target: '#view-toggle' },
    { key: 'library', target: '#library' },
    { key: 'search', target: '#search-form' },
    { key: 'tray', target: () => (isMobile() ? '.tray-bar-wrap' : '#tray') },
    { key: 'lang', target: '#lang-switch' },
    { key: 'download', target: '#download-tab' },
    { key: 'menu', target: '#user-menu-btn' },
    { key: 'done' },
  ].filter((s) => !s.target || findTarget(s));
}

function findTarget(step) {
  const sel = typeof step.target === 'function' ? step.target() : step.target;
  const el = sel && document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function confetti() {
  if (prefersReducedMotion()) return;
  const colors = ['#6D5BFF', '#B14CF0', '#FF5E7A', '#FFB547', '#22C3A6', '#4CC3FF'];
  const host = h('div.confetti', { 'aria-hidden': 'true' });
  for (let i = 0; i < 90; i++) {
    host.append(
      h('i', {
        style: {
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          '--d': `${1.8 + Math.random() * 1.8}s`,
          '--delay': `${Math.random() * 0.5}s`,
          '--x': `${(Math.random() - 0.5) * 240}px`,
          '--r': `${Math.random() * 720 - 360}deg`,
        },
      })
    );
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 4200);
}

/**
 * Interaktive Einführung mit Spotlight auf die jeweiligen Bedienelemente.
 * @param {{ onDone: Function }} options
 */
export function startTutorial({ onDone } = {}) {
  document.querySelector('.tutorial')?.remove();
  const steps = buildSteps();
  let index = 0;

  const spot = h('div.tut-spot');
  const card = h('div.tut-card', { role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' });
  const root = h('div.tutorial', {}, h('div.tut-blocker'), spot, card);
  document.body.append(root);
  document.body.classList.add('tutorial-open');
  requestAnimationFrame(() => root.classList.add('visible'));

  function finish(completed) {
    root.classList.remove('visible');
    document.body.classList.remove('tutorial-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    offLang();
    setTimeout(() => root.remove(), 350);
    if (completed) confetti();
    onDone?.(completed);
  }

  function render() {
    const step = steps[index];
    const total = steps.length;
    const centered = !step.target;
    card.className = `tut-card${centered ? ' centered' : ''}`;
    const children = [
      centered &&
        h(
          'div.tut-hero',
          { 'aria-hidden': 'true' },
          h('img', { src: '/icons/icon.svg', alt: '', width: 72, height: 72 }),
          step.key === 'done' && h('span.tut-hero-badge', {}, icon('check', 22))
        ),
      h('div.tut-step', {}, t('tut.step', { n: index + 1, total })),
      h('h3.tut-title', {}, t(`tut.${step.key}.title`)),
      h('p.tut-text', {}, t(`tut.${step.key}.text`)),
      h(
        'div.tut-dots',
        { 'aria-hidden': 'true' },
        steps.map((_, i) => h(`span${i === index ? '.active' : i < index ? '.done' : ''}`))
      ),
      h(
        'div.tut-actions',
        {},
        index < total - 1
          ? h('button.btn.ghost.sm.tut-skip', { type: 'button', onclick: () => finish(false) }, t('tut.skip'))
          : h('span'),
        h(
          'div.tut-nav',
          {},
          index > 0 && h('button.btn.secondary.sm', { type: 'button', onclick: () => go(-1) }, t('tut.back')),
          h(
            'button.btn.primary.sm.tut-next',
            { type: 'button', onclick: () => (index === total - 1 ? finish(true) : go(1)) },
            index === total - 1 ? t('tut.finish') : t('tut.next'),
            index < total - 1 && icon('chevronRight', 16)
          )
        )
      ),
    ];
    card.replaceChildren(...children.filter(Boolean));
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');

    const target = step.target ? findTarget(step) : null;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      setTimeout(place, 280);
    }
    place();
    card.querySelector('.tut-next')?.focus({ preventScroll: true });
  }

  function place() {
    const step = steps[index];
    const target = step.target ? findTarget(step) : null;
    if (!target) {
      spot.classList.add('hidden');
      card.style.left = '';
      card.style.top = '';
      card.dataset.side = 'center';
      return;
    }
    spot.classList.remove('hidden');
    const r = target.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(4, r.top - pad);
    const left = Math.max(4, r.left - pad);
    const width = Math.min(vw - 8, r.width + pad * 2);
    const height = Math.min(vh - top - 4, r.height + pad * 2);
    Object.assign(spot.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` });

    const cw = Math.min(360, vw - 24);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight;
    const below = vh - (top + height);
    const above = top;
    let side;
    let y;
    if (below >= ch + 20) {
      side = 'bottom';
      y = top + height + 14;
    } else if (above >= ch + 20) {
      side = 'top';
      y = top - ch - 14;
    } else {
      side = 'overlay';
      y = Math.max(12, vh - ch - 16);
    }
    const x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    card.dataset.side = side;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.setProperty('--arrow-x', `${Math.min(Math.max(20, r.left + r.width / 2 - x), cw - 20)}px`);
  }

  function go(delta) {
    index = Math.max(0, Math.min(steps.length - 1, index + delta));
    render();
  }

  const onKey = (e) => {
    if (e.key === 'Escape') finish(false);
    else if (e.key === 'ArrowRight') index === steps.length - 1 ? finish(true) : go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  const offLang = onLangChange(render);
  render();
}
