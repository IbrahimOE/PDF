import { h, icon, clear } from './dom.js';
import { t, formatBytes, onLangChange } from '../i18n/index.js';
import { state, on } from '../state.js';
import * as actions from '../actions.js';
import { FORMATS, ACCEPT, kindOf, targetsFor, convertFile, baseName } from '../services/convert.js';
import { downloadBlob } from '../services/share.js';
import { getBlob } from '../services/db.js';
import { toast } from './toast.js';

const jobs = []; // { id, file, target, status: 'ready'|'working'|'done'|'error', progress, result }
let listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

const extBadge = (file) => {
  const kind = kindOf(file);
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || kind || '?').toUpperCase().slice(0, 4);
  return h(`span.ext-badge.kind-${kind || 'none'}`, {}, ext);
};

/** Dateien zur Umwandlung hinzufügen (auch von außerhalb, z. B. per Drag & Drop). */
export function addConvertFiles(fileList) {
  let added = 0;
  for (const file of fileList) {
    const targets = targetsFor(file);
    if (!targets.length) {
      toast(t('convert.unsupported', { name: file.name }), 'warn');
      continue;
    }
    jobs.push({ id: crypto.randomUUID?.() || String(Math.random()), file, target: targets[0], status: 'ready', progress: 0 });
    added++;
  }
  if (added) changed();
  return added;
}

async function runJob(job) {
  if (job.status === 'working') return;
  job.status = 'working';
  job.progress = 0;
  changed();
  try {
    job.result = await convertFile(job.file, job.target, {
      onProgress: (done, total) => {
        job.progress = done / total;
        changed();
      },
    });
    job.status = 'done';
  } catch (e) {
    console.error(e);
    job.status = 'error';
  }
  changed();
}

function jobRow(job) {
  const targets = targetsFor(job.file);
  const select = h(
    'select.input.select.sm',
    {
      'aria-label': t('convert.to'),
      disabled: job.status === 'working',
      onchange: (e) => {
        job.target = e.target.value;
        job.status = 'ready';
        job.result = null;
        changed();
      },
    },
    targets.map((f) => h('option', { value: f, selected: f === job.target }, FORMATS[f].label))
  );

  let action;
  if (job.status === 'working') {
    action = h('div.job-working', {}, h('span.spinner.dark'), h('div.progress', {}, h('i', { style: { width: `${Math.max(6, job.progress * 100)}%` } })));
  } else if (job.status === 'done') {
    action = h(
      'div.job-actions',
      {},
      h('button.btn.primary.sm', { type: 'button', onclick: () => downloadBlob(job.result.blob, job.result.name) }, icon('download', 16), h('span', {}, t('export.download'))),
      job.target === 'pdf' &&
        h(
          'button.btn.secondary.sm',
          {
            type: 'button',
            title: t('convert.toLibrary'),
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              await actions.importFiles([new File([job.result.blob], job.result.name, { type: 'application/pdf' })]);
            },
          },
          icon('plus', 16),
          h('span.hide-sm', {}, t('convert.toLibrary'))
        )
    );
  } else {
    action = h(
      'div.job-actions',
      {},
      job.status === 'error' && h('span.job-error', {}, icon('warn', 16), t('convert.failed')),
      h('button.btn.secondary.sm', { type: 'button', onclick: () => runJob(job) }, icon('magic', 16), h('span', {}, t('convert.run')))
    );
  }

  return h(
    `div.job-row.status-${job.status}`,
    { dataset: { id: job.id } },
    extBadge(job.file),
    h('div.job-info', {}, h('strong.job-name', { title: job.file.name }, job.file.name), h('span.muted.small', {}, formatBytes(job.file.size))),
    h('div.job-target', {}, icon('chevronRight', 18, { class: 'icon job-arrow' }), select),
    action,
    h(
      'button.icon-btn.ghost.sm.danger-hover',
      {
        type: 'button',
        'aria-label': t('tray.remove'),
        title: t('tray.remove'),
        disabled: job.status === 'working',
        onclick: () => {
          jobs.splice(jobs.indexOf(job), 1);
          changed();
        },
      },
      icon('x', 16)
    )
  );
}

const FORMAT_GROUPS = [
  ['PDF', 'Word · PowerPoint · PNG · JPG · TXT · Markdown · HTML'],
  ['Word (DOCX)', 'PDF · TXT · Markdown · HTML'],
  ['Excel · CSV', 'PDF · Word · Excel ↔ CSV · HTML'],
  [t('convert.images'), 'PDF · PNG ↔ JPG ↔ WEBP · Word'],
  ['TXT · Markdown · HTML', 'PDF · Word · …'],
];

/** Reiter „Umwandeln“. */
export function mountConvert(container) {
  const input = h('input', {
    type: 'file',
    multiple: true,
    accept: ACCEPT,
    hidden: true,
    onchange: (e) => {
      addConvertFiles([...e.target.files]);
      e.target.value = '';
    },
  });

  function render() {
    const libraryPicker =
      state.files.length > 0 &&
      h(
        'select.input.select.library-pick',
        {
          'aria-label': t('convert.fromLibrary'),
          onchange: async (e) => {
            const file = state.files.find((f) => f.id === e.target.value);
            e.target.value = '';
            if (!file) return;
            const blob = await getBlob(file.id);
            if (blob) addConvertFiles([new File([blob], file.name, { type: 'application/pdf' })]);
          },
        },
        h('option', { value: '' }, t('convert.fromLibrary')),
        state.files.map((f) => h('option', { value: f.id }, f.name))
      );

    const drop = h(
      'div.convert-drop',
      {
        role: 'button',
        tabindex: '0',
        id: 'convert-drop',
        onclick: (e) => {
          if (e.target.closest('select')) return;
          input.click();
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
          }
        },
      },
      h('div.convert-drop-icon', {}, icon('files', 30)),
      h('strong', {}, t('convert.dropTitle')),
      h('span.muted.small', {}, t('convert.dropText')),
      h('div.convert-drop-actions', {}, h('span.btn.primary', {}, icon('upload', 18), t('convert.choose')), libraryPicker)
    );

    const ready = jobs.filter((j) => j.status === 'ready' || j.status === 'error');
    const list = jobs.length
      ? h(
          'div.job-list',
          {},
          h(
            'div.job-list-head',
            {},
            h('strong', {}, t('convert.queue', { n: jobs.length })),
            h(
              'div.job-list-actions',
              {},
              h(
                'button.btn.ghost.sm',
                {
                  type: 'button',
                  disabled: jobs.some((j) => j.status === 'working'),
                  onclick: () => {
                    jobs.length = 0;
                    changed();
                  },
                },
                t('tray.clear')
              ),
              h(
                'button.btn.primary.sm',
                {
                  type: 'button',
                  disabled: !ready.length,
                  onclick: async () => {
                    for (const job of ready) await runJob(job);
                  },
                },
                icon('magic', 16),
                t('convert.runAll')
              )
            )
          ),
          jobs.map(jobRow)
        )
      : null;

    const info = h(
      'div.convert-info',
      {},
      h('h3', {}, t('convert.supported')),
      h(
        'ul',
        {},
        FORMAT_GROUPS.map(([from, to], i) =>
          h('li', {}, h('strong', {}, i === 3 ? t('convert.images') : from), h('span', {}, '→'), h('span.muted', {}, to))
        )
      ),
      h('p.muted.small', {}, icon('shield', 14), h('span', {}, t('convert.privacy')))
    );

    clear(container).append(
      h(
        'div.convert-view',
        {},
        h('div.convert-head', {}, h('h1.lib-title', {}, t('convert.title')), h('p.muted', {}, t('convert.subtitle'))),
        drop,
        list,
        info,
        input
      )
    );
  }

  listeners.add(render);
  const offs = [on('files', render), onLangChange(render)];
  render();
  return {
    destroy() {
      listeners.delete(render);
      offs.forEach((o) => o());
    },
    pick: () => input.click(),
  };
}

export { baseName };
