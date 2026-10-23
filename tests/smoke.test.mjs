// End-to-end smoke test of the real dashboard code in jsdom, against an in-memory fake of supabase-js.
// It is NOT a real browser and NOT a real Supabase project (see docs/TEST_REPORT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://admin.test/#verses', pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
const { startApp } = await import('../scripts/app.js');

// ------------------------------------------------------------------ fake supabase
function makeFake() {
  const db = { translations: [], bible_verses: [], saints: [], saint_of_day_assignments: [] };
  const state = { signedIn: false, isAdmin: true, denyWrites: false, n: 0 };
  const unique = { translations: ['id'], bible_verses: ['id'], saints: ['id', 'slug'], saint_of_day_assignments: ['assigned_date'] };

  function from(table) {
    const q = { op: 'select', filters: [], payload: null, returning: false, single: false, order: null, range: null };
    const b = {
      select() { if (q.op !== 'select') q.returning = true; return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      update(p) { q.op = 'update'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(c, o) { q.order = [c, o?.ascending !== false]; return b; },
      range(a, z) { q.range = [a, z]; return b; },
      single() { q.single = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    const match = (r) => q.filters.every(([c, v]) => r[c] === v);
    function done(rows) {
      if (!q.single) return { data: rows, error: null };
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      return { data: rows[0], error: null };
    }
    function run() {
      const rows = db[table];
      if (q.op === 'select') {
        let out = rows.filter(match);
        if (q.order) out = [...out].sort((a, z) => (a[q.order[0]] > z[q.order[0]] ? 1 : -1) * (q.order[1] ? 1 : -1));
        if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
        return { data: out, error: null };
      }
      const rls = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      if (q.op === 'insert') {
        if (state.denyWrites) return rls;
        const row = { id: `id-${++state.n}`, status: 'draft', ...q.payload };
        for (const col of unique[table]) {
          if (rows.some((r) => r[col] !== undefined && r[col] === row[col])) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${col}` } };
        }
        if (table === 'bible_verses' && row.display_date && rows.some((r) => r.display_date === row.display_date && r.translation_id === row.translation_id)) return { data: null, error: { code: '23505', message: 'duplicate date' } };
        rows.push(row);
        return q.returning ? done([row]) : { data: null, error: null };
      }
      const hits = rows.filter(match);
      if (q.op === 'update') {
        if (state.denyWrites) return done([]); // RLS hides rows: zero rows affected
        hits.forEach((r) => Object.assign(r, q.payload));
        return q.returning ? done(hits) : { data: null, error: null };
      }
      if (q.op === 'delete') {
        if (state.denyWrites) return { data: [], error: null };
        db[table] = rows.filter((r) => !hits.includes(r));
        return { data: hits, error: null };
      }
    }
    return b;
  }

  const client = {
    from,
    rpc: async (name) => (name === 'is_admin' ? { data: state.isAdmin, error: null } : { data: null, error: { message: 'unknown' } }),
    auth: {
      getSession: async () => ({ data: { session: state.signedIn ? { user: { email: 'admin@example.com' } } : null } }),
      signInWithPassword: async ({ password }) => {
        if (password === 'right') { state.signedIn = true; return { error: null }; }
        return { error: { message: 'Invalid login credentials' } };
      },
      signOut: async () => { state.signedIn = false; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  return { client, db, state };
}

// ------------------------------------------------------------------ helpers
const doc = dom.window.document;
const root = () => doc.getElementById('app');
const settle = () => new Promise((r) => setTimeout(r, 25));
const text = () => root().textContent;
const button = (label) => [...root().querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const input = (name) => root().querySelector(`[name="${name}"]`);
const click = async (label) => { const b = button(label); assert.ok(b, `button "${label}" not found; page: ${text().slice(0, 200)}`); b.click(); await settle(); };
const type = (name, value) => { const el = input(name); assert.ok(el, `field ${name}`); if (el.type === 'checkbox') el.checked = value; else el.value = value; };
const submit = async () => { root().querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle(); };
const go = async (route) => { dom.window.location.hash = route; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await settle(); };

const { client, db, state } = makeFake();
await startApp(client, root(), { win: dom.window });
await settle();

test('login: wrong password gives a generic error', async () => {
  assert.ok(root().querySelector('.login-form'));
  root().querySelector('#email').value = 'someone@example.com';
  root().querySelector('#password').value = 'wrong';
  await submit();
  assert.match(text(), /Check your email and password/);
  assert.equal(state.signedIn, false);
});

test('login: a valid account that is not an admin is rejected and signed out', async () => {
  state.isAdmin = false;
  root().querySelector('#password').value = 'right';
  await submit();
  assert.match(text(), /not an administrator/);
  assert.equal(state.signedIn, false);
  state.isAdmin = true;
});

test('login: an administrator reaches the dashboard', async () => {
  root().querySelector('#email').value = 'admin@example.com';
  root().querySelector('#password').value = 'right';
  await submit();
  assert.ok(root().querySelector('nav'));
  assert.match(text(), /Daily Bible verses/);
  assert.match(text(), /No verses yet/);
});

test('translations: create a sample translation', async () => {
  await go('translations');
  await click('New translation');
  await submit(); // empty
  assert.match(text(), /An id is required/);
  assert.equal(db.translations.length, 0, 'nothing is sent when validation fails');
  type('id', 'SAMPLE'); type('name', 'Development sample'); type('is_sample', true); type('is_active', true);
  await submit();
  assert.equal(db.translations.length, 1);
  assert.match(text(), /Development sample/);
});

test('verses: validation, save, duplicate date, and sample-publish confirmation', async () => {
  await go('verses');
  await click('New verse');
  await submit();
  assert.match(text(), /Choose a translation/);
  assert.equal(db.bible_verses.length, 0);

  const fill = (over = {}) => {
    const v = { translation_id: 'SAMPLE', display_date: '2026-10-21', book: 'Sample', chapter: '1', verse_start: '1', verse_text: 'Placeholder, not Scripture.', status: 'draft', ...over };
    for (const [k, val] of Object.entries(v)) type(k, val);
  };
  fill();
  await submit();
  assert.equal(db.bible_verses.length, 1);
  assert.match(text(), /Verse saved/);

  // duplicate date + translation: the database refuses; the form stays open with a clear message
  await click('New verse');
  fill({ verse_start: '2' });
  await submit();
  assert.equal(db.bible_verses.length, 1);
  assert.match(text(), /already exists/);
  assert.ok(root().querySelector('form'), 'form is still open');
  await click('Cancel');

  // publishing a sample verse requires explicit confirmation
  await click('Publish');
  assert.match(text(), /SAMPLE translation/);
  await click('Cancel');
  assert.equal(db.bible_verses[0].status, 'draft');
  await click('Publish');
  await click('Publish anyway');
  assert.equal(db.bible_verses[0].status, 'published');
});

test('saints: validation, publish rules, save', async () => {
  await go('saints');
  await click('New saint');
  type('name', 'Test Saint'); type('status', 'published'); type('feast_month', '2'); type('feast_day', '30');
  await submit();
  assert.match(text(), /at most 29 days/);
  assert.match(text(), /needs a short introduction/);
  assert.equal(db.saints.length, 0);
  type('feast_day', '14'); type('summary', 'A short intro.'); type('sources_text', 'Book A | note');
  await submit();
  assert.equal(db.saints.length, 1);
  assert.equal(db.saints[0].slug, 'test-saint');
  assert.deepEqual(db.saints[0].sources, [{ title: 'Book A', note: 'note' }]);
});

test('saints: preview shows content and omits blank sections', async () => {
  await click('Edit');
  await click('Preview');
  const dlg = root().querySelector('.preview');
  assert.ok(dlg);
  assert.match(dlg.textContent, /Test Saint/);
  assert.match(dlg.textContent, /14 February/);
  assert.doesNotMatch(dlg.textContent, /Early life/);
  await click('Close');
  await click('Cancel');
});

test('assignments: assign, preview a date, and reject a draft saint', async () => {
  await go('assignments');
  assert.match(text(), /No explicit assignments/);
  const saintId = db.saints[0].id;
  type('assigned_date', '2026-12-25'); type('saint_id', saintId);
  await submit();
  assert.equal(db.saint_of_day_assignments.length, 1);
  assert.match(text(), /Test Saint/);

  const check = input('check_date');
  check.value = '2026-12-25'; check.dispatchEvent(new dom.window.Event('change'));
  assert.match(text(), /explicit assignment/);
  check.value = '2027-02-14'; check.dispatchEvent(new dom.window.Event('change'));
  assert.match(text(), /matching feast day/);
  check.value = '2027-06-06'; check.dispatchEvent(new dom.window.Event('change'));
  assert.match(text(), /No saint matches/);
});

test('honesty: a blocked update is reported as not saved', async () => {
  await go('saints');
  state.denyWrites = true;
  await click('Edit');
  type('name', 'Renamed Saint');
  await submit();
  assert.match(text(), /Nothing was saved/);
  assert.doesNotMatch(text(), /Saint saved/);
  assert.equal(db.saints[0].name, 'Test Saint', 'database unchanged');
  state.denyWrites = false;
  await click('Cancel');
});

test('safety: database content is rendered as text, never as markup', async () => {
  db.saints.push({ id: 'evil', slug: 'evil', name: '<img src=x onerror=alert(1)>', status: 'draft', alternate_names: [], sources: [] });
  await go('verses'); await go('saints');
  assert.equal(root().querySelectorAll('img').length, 0);
  assert.match(text(), /<img src=x onerror=alert\(1\)>/);
});

test('delete requires confirmation and only reports success if a row was removed', async () => {
  const before = db.saints.length;
  await click('Edit');
  await click('Delete');
  assert.match(text(), /cannot be undone/);
  await click('Cancel');
  assert.equal(db.saints.length, before);
});

test('sign out returns to the login screen', async () => {
  await click('Sign out');
  assert.ok(root().querySelector('.login-form'));
  assert.equal(state.signedIn, false);
});
