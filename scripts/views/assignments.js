import { h, table } from '../dom.js';
import { makeField, collect, showErrors } from '../forms.js';
import { validateAssignment, pickSaintOfDay, isValidIsoDate } from '../validation.js';
import { loadError, withSaving } from './shared.js';

export async function renderAssignments(ctx) {
  const [ar, sr] = await Promise.all([
    ctx.api.list('saint_of_day_assignments', { orderBy: 'assigned_date', ascending: false }),
    ctx.api.list('saints', { orderBy: 'name' }),
  ]);
  if (!ctx.isCurrent()) return;
  if (!ar.ok || !sr.ok) return loadError(ctx, (ar.ok ? sr : ar).message, ctx.reload);

  const saints = sr.rows;
  const published = saints.filter((s) => s.status === 'published');
  const nameOf = (id) => saints.find((s) => s.id === id)?.name ?? '(deleted saint)';

  // ---- add / replace form
  const fields = [
    makeField({ name: 'assigned_date', label: 'Date', type: 'date', required: true }),
    makeField({ name: 'saint_id', label: 'Saint', type: 'select', required: true,
      options: [{ value: '', label: 'Choose\u2026' }, ...published.map((s) => ({ value: s.id, label: s.name }))],
      hint: 'Only published saints can be assigned.' }),
  ];
  const err = h('div', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Assign');
  const form = h('form', { class: 'form inline', novalidate: true }, fields.map((f) => f.el), err, save);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = validateAssignment(collect(fields));
    if (!showErrors(fields, v.errors)) return;
    const existing = ar.rows.find((a) => a.assigned_date === v.value.assigned_date);
    if (existing && !(await ctx.confirm(`${v.value.assigned_date} is already assigned to ${nameOf(existing.saint_id)}. Replace it?`, 'Replace'))) return;
    const result = await withSaving(save, err, 'Saving\u2026', () => ctx.api.save('saint_of_day_assignments',
      existing ? { mode: 'update', key: existing.assigned_date, keyColumn: 'assigned_date', payload: { saint_id: v.value.saint_id } }
        : { mode: 'insert', payload: v.value }));
    if (!result.ok) { err.textContent = result.message; return; }
    ctx.toast('Assignment saved.');
    ctx.reload();
  });

  // ---- what will the app show on a date?
  const result = h('p', { 'aria-live': 'polite' });
  const checkDate = makeField({ name: 'check_date', label: 'Check a date', type: 'date' });
  const explain = () => {
    const iso = checkDate.get();
    if (!isValidIsoDate(iso)) { result.textContent = ''; return; }
    const r = pickSaintOfDay(saints, ar.rows, iso);
    result.textContent = r.saint
      ? `The app will show ${r.saint.name} (${r.reason === 'explicit' ? 'explicit assignment' : 'matching feast day'}).`
      : 'No saint matches this date. The app will show its "no saint for today" message.';
  };
  checkDate.input.addEventListener('change', explain);

  const rows = ar.rows.map((a) => [a.assigned_date, nameOf(a.saint_id),
    h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
      if (!(await ctx.confirm(`Remove the assignment for ${a.assigned_date}? The app will fall back to the feast-day rule for that date.`, 'Remove'))) return;
      const r = await ctx.api.remove('saint_of_day_assignments', a.assigned_date, 'assigned_date');
      if (!r.ok) { ctx.toast(r.message, 'error'); return; }
      ctx.toast('Assignment removed.');
      ctx.reload();
    } }, 'Remove')]);

  ctx.main.replaceChildren(
    h('h1', {}, 'Saint of the Day'),
    h('p', { class: 'muted' }, 'Rule: an explicit assignment for a date wins. Otherwise the app uses the published saint whose feast day matches (lowest feast rank, then name). If neither exists, nothing is shown.'),
    h('h2', {}, 'Assign a saint to a date'), form,
    h('h2', {}, 'Preview'), h('div', { class: 'form inline' }, checkDate.el), result,
    h('h2', {}, 'Explicit assignments'),
    table(['Date', 'Saint', ''], rows, 'No explicit assignments. Feast days are used automatically.'));
}
