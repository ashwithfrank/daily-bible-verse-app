import { h, badge, table } from '../dom.js';
import { makeField, collect, showErrors } from '../forms.js';
import { validateVerse } from '../validation.js';
import { loadError, withSaving, formatDate } from './shared.js';

const reference = (v) => `${v.book} ${v.chapter}:${v.verse_end && v.verse_end !== v.verse_start ? `${v.verse_start}\u2013${v.verse_end}` : v.verse_start}`;

export async function renderVerses(ctx) {
  const [vr, tr] = await Promise.all([
    ctx.api.list('bible_verses', { orderBy: 'display_date', ascending: false }),
    ctx.api.list('translations', { orderBy: 'id' }),
  ]);
  if (!ctx.isCurrent()) return;
  if (!vr.ok || !tr.ok) return loadError(ctx, (vr.ok ? tr : vr).message, ctx.reload);

  const rows = vr.rows;
  const translations = tr.rows;
  const tById = Object.fromEntries(translations.map((t) => [t.id, t]));
  const filters = { q: '', status: '', translation: '' };
  const listBox = h('div');

  function drawList() {
    const q = filters.q.trim().toLowerCase();
    const shown = rows.filter((v) =>
      (!filters.status || v.status === filters.status) &&
      (!filters.translation || v.translation_id === filters.translation) &&
      (!q || [reference(v), v.verse_text, v.reflection ?? '', v.display_date ?? ''].some((s) => s.toLowerCase().includes(q))));
    listBox.replaceChildren(table(['Date', 'Reference', 'Translation', 'Status', ''],
      shown.map((v) => [formatDate(v.display_date), reference(v), v.translation_id, badge(v.status),
        h('span', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => form(v) }, 'Edit'),
          h('button', { type: 'button', class: 'btn', onclick: () => toggle(v) }, v.status === 'published' ? 'Unpublish' : 'Publish'))]),
      rows.length ? 'No verses match these filters.' : 'No verses yet. Add a translation first, then create your first verse.'));
  }

  async function toggle(v) {
    const publishing = v.status !== 'published';
    if (publishing && tById[v.translation_id]?.is_sample &&
      !(await ctx.confirm('This verse uses a SAMPLE translation (placeholder text, not Scripture). Publishing it shows placeholder text to every app user. Publish anyway?', 'Publish anyway'))) return;
    const result = await ctx.api.save('bible_verses', { mode: 'update', key: v.id, payload: { status: publishing ? 'published' : 'draft' } });
    if (!result.ok) { ctx.toast(result.message, 'error'); return; }
    ctx.toast(publishing ? 'Published.' : 'Unpublished.');
    ctx.reload();
  }

  const search = h('input', { type: 'search', placeholder: 'Search reference, text, date\u2026', 'aria-label': 'Search verses', oninput: (e) => { filters.q = e.target.value; drawList(); } });
  const status = h('select', { 'aria-label': 'Filter by status', onchange: (e) => { filters.status = e.target.value; drawList(); } },
    h('option', { value: '' }, 'All statuses'), h('option', { value: 'draft' }, 'Draft'), h('option', { value: 'published' }, 'Published'));
  const trSel = h('select', { 'aria-label': 'Filter by translation', onchange: (e) => { filters.translation = e.target.value; drawList(); } },
    h('option', { value: '' }, 'All translations'), translations.map((t) => h('option', { value: t.id }, t.id)));

  ctx.main.replaceChildren(
    h('h1', {}, 'Daily Bible verses'),
    h('div', { class: 'toolbar' }, search, status, trSel,
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => form(null) }, 'New verse')),
    listBox);
  drawList();

  function form(row) {
    const fields = [
      makeField({ name: 'translation_id', label: 'Translation', type: 'select', required: true,
        options: [{ value: '', label: 'Choose\u2026' }, ...translations.map((t) => ({ value: t.id, label: `${t.id} \u2013 ${t.name}${t.is_sample ? ' (sample, not Scripture)' : ''}` }))] }),
      makeField({ name: 'display_date', label: 'Display date', type: 'date', hint: 'The day the app shows this verse (Asia/Kolkata). Leave empty if unscheduled. Only one verse per date per translation.' }),
      makeField({ name: 'book', label: 'Bible book', required: true }),
      makeField({ name: 'chapter', label: 'Chapter', type: 'number', required: true }),
      makeField({ name: 'verse_start', label: 'Starting verse', type: 'number', required: true }),
      makeField({ name: 'verse_end', label: 'Ending verse (optional)', type: 'number' }),
      makeField({ name: 'verse_text', label: 'Verse text', type: 'textarea', rows: 5, required: true, hint: 'Only text you are licensed to publish.' }),
      makeField({ name: 'reflection', label: 'Reflection', type: 'textarea', rows: 5 }),
      makeField({ name: 'source_notes', label: 'Source / licence notes (admin only)', type: 'textarea', rows: 2 }),
      makeField({ name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft (hidden)' }, { value: 'published', label: 'Published (visible)' }] }),
    ];
    if (row) for (const f of fields) f.set(row[f.name]); else fields.find((f) => f.name === 'status').set('draft');

    const err = h('div', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save');
    const del = row ? h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
      if (!(await ctx.confirm(`Delete ${reference(row)}? This cannot be undone. (To hide it instead, set it to Draft.)`, 'Delete'))) return;
      const result = await withSaving(del, err, 'Deleting\u2026', () => ctx.api.remove('bible_verses', row.id));
      if (!result.ok) { err.textContent = result.message; return; }
      ctx.toast('Verse deleted.');
      ctx.reload();
    } }, 'Delete') : null;

    const f = h('form', { class: 'form', novalidate: true }, fields.map((x) => x.el), err,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: ctx.reload }, 'Cancel'), del, save));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = validateVerse(collect(fields));
      if (!showErrors(fields, v.errors)) return;
      if (v.value.status === 'published' && tById[v.value.translation_id]?.is_sample &&
        !(await ctx.confirm('This translation is a SAMPLE (placeholder text, not Scripture). Publishing shows it to every app user. Continue?', 'Publish anyway'))) return;
      const result = await withSaving(save, err, 'Saving\u2026', () => ctx.api.save('bible_verses',
        row ? { mode: 'update', key: row.id, payload: v.value } : { mode: 'insert', payload: v.value }));
      if (!result.ok) { err.textContent = result.message; return; }
      ctx.toast('Verse saved.');
      ctx.reload();
    });
    ctx.main.replaceChildren(h('h1', {}, row ? `Edit ${reference(row)}` : 'New verse'), f);
  }
}
