import {
  createElement,
  Upload,
  Search,
  X,
  List,
  LayoutGrid,
  FileText,
  Trash2,
  RotateCw,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  GraduationCap,
  Download,
  Share2,
  Sparkles,
  ScanText,
  GripVertical,
  MonitorDown,
  HardDrive,
  Plus,
  Mail,
  Lock,
  ArrowLeft,
  Layers,
  ShieldCheck,
  Combine,
  FileStack,
  CircleCheck,
  TriangleAlert,
  Info,
  CircleX,
  Smartphone,
  Monitor,
  Share,
  SquarePlus,
  ListChecks,
  WandSparkles,
  Files,
} from 'lucide';

const ICONS = {
  upload: Upload,
  search: Search,
  x: X,
  list: List,
  grid: LayoutGrid,
  file: FileText,
  trash: Trash2,
  rotate: RotateCw,
  eye: Eye,
  eyeOff: EyeOff,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  logout: LogOut,
  tutorial: GraduationCap,
  download: Download,
  share: Share2,
  shareIos: Share,
  sparkles: Sparkles,
  ocr: ScanText,
  grip: GripVertical,
  install: MonitorDown,
  storage: HardDrive,
  plus: Plus,
  plusSquare: SquarePlus,
  mail: Mail,
  lock: Lock,
  back: ArrowLeft,
  layers: Layers,
  shield: ShieldCheck,
  merge: Combine,
  stack: FileStack,
  success: CircleCheck,
  warn: TriangleAlert,
  info: Info,
  error: CircleX,
  phone: Smartphone,
  monitor: Monitor,
  listChecks: ListChecks,
  magic: WandSparkles,
  files: Files,
};

export function icon(name, size = 20, extra = {}) {
  const svg = createElement(ICONS[name] || Info, {
    width: size,
    height: size,
    'aria-hidden': 'true',
    focusable: 'false',
    ...extra,
  });
  svg.classList.add('icon');
  return svg;
}

/**
 * Kleiner DOM-Helfer: h('button.btn.primary', { onclick, attrs }, children)
 * Texte werden immer als Textknoten eingefügt (kein innerHTML → sicher bei PDF-Inhalten).
 */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += ` ${v}`;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && k !== 'form' && !k.includes('-')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Text mit hervorgehobenen Bereichen (<mark>) – sicher ohne innerHTML. */
export function highlighted(text, ranges) {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) frag.append(text.slice(pos, s));
    frag.append(h('mark', {}, text.slice(s, e)));
    pos = e;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Nutzt die View-Transition-API (sanfte Überblendung), sofern verfügbar. */
export function withTransition(fn) {
  if (document.startViewTransition && !prefersReducedMotion()) document.startViewTransition(fn);
  else fn();
}

export function flagSvg(lang) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 30 20');
  svg.setAttribute('class', 'flag');
  svg.setAttribute('aria-hidden', 'true');
  const stripes =
    lang === 'fr'
      ? [['#002654', 0], ['#FFFFFF', 10], ['#CE1126', 20]].map(([c, x]) => ({ x, y: 0, w: 10, h: 20, c }))
      : [['#000000', 0], ['#DD0000', 6.67], ['#FFCE00', 13.33]].map(([c, y]) => ({ x: 0, y, w: 30, h: 6.67, c }));
  for (const s of stripes) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', s.x);
    r.setAttribute('y', s.y);
    r.setAttribute('width', s.w);
    r.setAttribute('height', s.h + 0.1);
    r.setAttribute('fill', s.c);
    svg.append(r);
  }
  return svg;
}
