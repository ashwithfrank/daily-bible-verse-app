import { h, badge, table } from '../dom.js';
import { makeField, collect, showErrors } from '../forms.js';
import { validateTranslation } from '../validation.js';
import { loadError, withSaving } from './shared.js';

export async function renderTranslations(ctx) {
  const res = await ctx.api.list('translations', { orderBy: 'id' });
  if (!ctx.isCurrent()) return;
  if (!res.ok) return loadError(ctx, res.message, ctx.reload);

  const add = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => form(null) }, 'New translation');
  ctx.main.replaceChildren(
    h('h1', {}, 'Translations'),
    h('p', { class: 'muted' }, 'Every verse belongs to a translation. Mark development placeholders as "sample"; the app labels them "not Scripture". Only add real Bible text for a translation you are licensed to use.'),
    h('div', { class: 'toolbar' }, add),
    table(['Id', 'Name', 'Sample?', 'Active', ''],
      res.rows.map((t) => [t.id, t.name, t.is_sample ? 'Yes (not Scripture)' : 'No', badge(t.is_active ? 'active' : 'inactive'),
        h('button', { type: 'button', class: 'btn', onclick: () => form(t) }, 'Edit')]),
      'No translations yet. Add one before creating verses.'));

  function form(row) {
    const fields = [
      makeField({ name: 'id', label: 'Id', required: true, disabled: !!row, hint: 'Short code, e.g. SAMPLE. Cannot be changed later.' }),
      makeField({ name: 'name', label: 'Name', required: true }),
      makeField({ name: 'language_code', label: 'Language code', hint: 'e.g. en' }),
      makeField({ name: 'license_notes', label: 'Licence notes', type: 'textarea', hint: 'Who owns the text and what permission you have.' }),
      makeField({ name: 'is_sample', label: 'Development sample (NOT real Scripture)', type: 'checkbox' }),
      makeField({ name: 'is_active', label: 'Active (visible to the public)', type: 'checkbox' }),
    ];
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    if (row) for (const f of fields) f.set(row[f.name]); else { byName.language_code.set('en'); byName.is_active.set(true); }

    const err = h('div', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save');
    const f = h('form', { class: 'form', novalidate: true }, fields.map((x) => x.el), err,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: ctx.reload }, 'Cancel'), save));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = validateTranslation(collect(fields));
      if (!showErrors(fields, v.errors)) return;
      const result = await withSaving(save, err, 'Saving\u2026', () => ctx.api.save('translations',
        row ? { mode: 'update', key: row.id, payload: v.value } : { mode: 'insert', payload: v.value }));
      if (!result.ok) { err.textContent = result.message; return; }
      ctx.toast('Translation saved.');
      ctx.reload();
    });
    ctx.main.replaceChildren(h('h1', {}, row ? `Edit ${row.id}` : 'New translation'), f);
  }
}
