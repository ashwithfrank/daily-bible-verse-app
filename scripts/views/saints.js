import { h, badge, table } from '../dom.js';
import { makeField, collect, showErrors, section } from '../forms.js';
import { validateSaint, formatSources, MONTH_NAMES } from '../validation.js';
import { loadError, withSaving } from './shared.js';

const feast = (s) => (s.feast_month && s.feast_day ? `${s.feast_day} ${MONTH_NAMES[s.feast_month - 1]}` : '\u2014');

export async function renderSaints(ctx) {
  const res = await ctx.api.list('saints', { orderBy: 'name' });
  if (!ctx.isCurrent()) return;
  if (!res.ok) return loadError(ctx, res.message, ctx.reload);

  const rows = res.rows;
  const filters = { q: '', status: '' };
  const listBox = h('div');

  function drawList() {
    const q = filters.q.trim().toLowerCase();
    const shown = rows.filter((s) =>
      (!filters.status || s.status === filters.status) &&
      (!q || [s.name, ...(s.alternate_names ?? [])].some((n) => n.toLowerCase().includes(q))));
    listBox.replaceChildren(table(['Name', 'Feast day', 'Status', ''],
      shown.map((s) => [s.name, feast(s), badge(s.status),
        h('span', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => form(s) }, 'Edit'),
          h('button', { type: 'button', class: 'btn', onclick: () => toggle(s) }, s.status === 'published' ? 'Unpublish' : 'Publish'))]),
      rows.length ? 'No saints match these filters.' : 'No saints yet. Create one, or load supabase/seed/starter_saints.sql (see supabase/README.md).'));
  }

  async function toggle(s) {
    const publishing = s.status !== 'published';
    if (publishing && !(s.summary ?? '').trim()) { ctx.toast('Add a short introduction before publishing.', 'error'); return; }
    const result = await ctx.api.save('saints', { mode: 'update', key: s.id, payload: { status: publishing ? 'published' : 'draft' } });
    if (!result.ok) { ctx.toast(result.message, 'error'); return; }
    ctx.toast(publishing ? 'Published.' : 'Unpublished.');
    ctx.reload();
  }

  ctx.main.replaceChildren(
    h('h1', {}, 'Saints'),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Search by name\u2026', 'aria-label': 'Search saints', oninput: (e) => { filters.q = e.target.value; drawList(); } }),
      h('select', { 'aria-label': 'Filter by status', onchange: (e) => { filters.status = e.target.value; drawList(); } },
        h('option', { value: '' }, 'All statuses'), h('option', { value: 'draft' }, 'Draft'), h('option', { value: 'published' }, 'Published')),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => form(null) }, 'New saint')),
    listBox);
  drawList();

  function form(row) {
    const text = (name, label, extra = {}) => makeField({ name, label, ...extra });
    const area = (name, label, extra = {}) => makeField({ name, label, type: 'textarea', rows: 4, ...extra });
    const fields = [
      text('name', 'Name', { required: true }),
      text('slug', 'Slug', { hint: 'Lower-case web-safe id. Leave empty to generate from the name.' }),
      area('alternate_names_text', 'Alternate names', { rows: 2, hint: 'One per line.' }),
      makeField({ name: 'feast_month', label: 'Feast month', type: 'select', options: [{ value: '', label: '\u2014' }, ...MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))] }),
      text('feast_day', 'Feast day (1-31)', { type: 'number' }),
      text('feast_rank', 'Feast rank', { type: 'number', hint: 'Only matters if several saints share a feast day. Lower wins. Default 0.' }),
      text('feast_note', 'Feast day note'),
      text('birth_date_text', 'Birth date', { hint: 'Free text, e.g. "c. 480" or "unknown". Never guess.' }),
      text('birth_place', 'Birthplace'),
      text('death_date_text', 'Death date', { hint: 'Free text. Use "unknown" or "disputed" where true.' }),
      text('death_place', 'Place of death'),
      area('summary', 'Short introduction', { required: false, hint: 'Required to publish.' }),
      area('early_life', 'Early life'),
      area('vocation', 'Calling or vocation'),
      area('major_works', 'Major works and contributions'),
      area('struggles', 'Struggles, suffering or persecution'),
      area('death_legacy', 'Death and legacy'),
      text('scripture_reference', 'Related Scripture (reference only)', { hint: 'e.g. Matthew 25:40. The app labels it as related Scripture, never as the saint\u2019s words.' }),
      area('scripture_explanation', 'How the Scripture relates to their life', { rows: 3 }),
      area('reflection', 'Reflection or lesson'),
      area('historical_notes', 'What the historical record shows', { hint: 'Documented facts and the quality of the sources.' }),
      area('tradition_notes', 'Devotional tradition and disputed accounts', { hint: 'Keep legends and uncertain claims here, separate from documented history.' }),
      area('sources_text', 'Historical sources', { rows: 5, hint: 'One per line: Title | optional note | optional https link' }),
      text('image_url', 'Image link (optional)', { hint: 'https only. Never use an image you do not have the right to use.' }),
      text('image_credit', 'Image credit'),
      text('image_license', 'Image licence'),
      makeField({ name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft (hidden)' }, { value: 'published', label: 'Published (visible)' }] }),
    ];
    const by = Object.fromEntries(fields.map((f) => [f.name, f]));
    if (row) {
      for (const f of fields) f.set(row[f.name]);
      by.alternate_names_text.set((row.alternate_names ?? []).join('\n'));
      by.sources_text.set(formatSources(row.sources));
      by.feast_month.set(row.feast_month ? String(row.feast_month) : '');
    } else { by.status.set('draft'); by.feast_rank.set('0'); }

    const groups = (names) => names.map((n) => by[n].el);
    const err = h('div', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save');
    const preview = h('button', { type: 'button', class: 'btn', onclick: () => ctx.showModal('Preview', profile(validateSaint(collect(fields)).value)) }, 'Preview');
    const del = row ? h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
      if (!(await ctx.confirm(`Delete ${row.name}? Any Saint of the Day assignments for them are removed too. This cannot be undone. (To hide them instead, set Draft.)`, 'Delete'))) return;
      const result = await withSaving(del, err, 'Deleting\u2026', () => ctx.api.remove('saints', row.id));
      if (!result.ok) { err.textContent = result.message; return; }
      ctx.toast('Saint deleted.');
      ctx.reload();
    } }, 'Delete') : null;

    const f = h('form', { class: 'form', novalidate: true },
      section('Identity', groups(['name', 'slug', 'alternate_names_text'])),
      section('Feast day', groups(['feast_month', 'feast_day', 'feast_rank', 'feast_note'])),
      section('Life', groups(['birth_date_text', 'birth_place', 'death_date_text', 'death_place', 'summary', 'early_life', 'vocation', 'major_works', 'struggles', 'death_legacy'])),
      section('Scripture and reflection', groups(['scripture_reference', 'scripture_explanation', 'reflection'])),
      section('History, tradition and sources', groups(['historical_notes', 'tradition_notes', 'sources_text'])),
      section('Image (optional)', groups(['image_url', 'image_credit', 'image_license'])),
      section('Publishing', groups(['status'])),
      err,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: ctx.reload }, 'Cancel'), del, preview, save));

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = validateSaint(collect(fields));
      if (!showErrors(fields, v.errors)) return;
      const result = await withSaving(save, err, 'Saving\u2026', () => ctx.api.save('saints',
        row ? { mode: 'update', key: row.id, payload: v.value } : { mode: 'insert', payload: v.value }));
      if (!result.ok) { err.textContent = result.message; return; }
      ctx.toast('Saint saved.');
      ctx.reload();
    });
    ctx.main.replaceChildren(h('h1', {}, row ? `Edit ${row.name}` : 'New saint'), f);
  }
}

/** Read-only profile, close to what the app shows. Blank sections are omitted. */
function profile(s) {
  const block = (title, body) => (body ? h('section', {}, h('h3', {}, title), h('p', {}, body)) : null);
  const born = [s.birth_date_text, s.birth_place].filter(Boolean).join(', ');
  const died = [s.death_date_text, s.death_place].filter(Boolean).join(', ');
  return h('article', { class: 'preview' },
    h('h2', {}, s.name || '(no name)'), badge(s.status),
    s.alternate_names?.length ? h('p', { class: 'muted' }, `Also known as ${s.alternate_names.join(', ')}`) : null,
    h('p', {}, [s.feast_month && s.feast_day ? `Feast day: ${s.feast_day} ${MONTH_NAMES[s.feast_month - 1]}` : null, born ? `Born: ${born}` : null, died ? `Died: ${died}` : null].filter(Boolean).map((x) => h('div', {}, x))),
    block('Introduction', s.summary), block('Early life', s.early_life), block('Calling', s.vocation),
    block('Works and contributions', s.major_works), block('Struggles and suffering', s.struggles), block('Death and legacy', s.death_legacy),
    s.scripture_reference ? h('section', {}, h('h3', {}, 'Related Scripture'), h('p', {}, h('strong', {}, s.scripture_reference)), s.scripture_explanation ? h('p', {}, s.scripture_explanation) : null) : null,
    block('Reflection', s.reflection),
    block('What the historical record shows', s.historical_notes),
    block('Devotional tradition and disputed accounts', s.tradition_notes),
    s.sources?.length ? h('section', {}, h('h3', {}, 'Sources'), h('ul', {}, s.sources.map((x) => h('li', {}, x.title + (x.note ? ` \u2013 ${x.note}` : ''))))) : null,
    s.image_url ? h('p', { class: 'muted' }, `Image: ${s.image_credit ?? '?'} (${s.image_license ?? '?'})`) : null,
    s.status === 'draft' ? h('p', { class: 'muted' }, 'Draft: not visible in the app until published.') : null);
}
