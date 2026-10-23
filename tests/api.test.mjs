import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, describeError, isAuthExpired } from '../scripts/api.js';

// Minimal fake of the supabase-js query builder: every call returns the builder, awaiting resolves `result`.
function fakeClient(result, record = []) {
  const builder = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      return (...args) => { record.push([prop, ...args]); return builder; };
    },
  });
  return { from: (t) => { record.push(['from', t]); return builder; }, auth: {}, rpc: async () => result };
}

test('save reports success only when the row comes back', async () => {
  const api = createApi(fakeClient({ data: { id: '1', name: 'x' }, error: null }));
  const r = await api.save('saints', { mode: 'insert', payload: { name: 'x' } });
  assert.equal(r.ok, true);
  assert.equal(r.row.id, '1');
});

test('save never claims success on a database error', async () => {
  const api = createApi(fakeClient({ data: null, error: { code: '23505', message: 'duplicate key' } }));
  const r = await api.save('bible_verses', { mode: 'insert', payload: {} });
  assert.equal(r.ok, false);
  assert.match(r.message, /already exists/);
});

test('an update blocked by RLS (0 rows) is a failure, not a success', async () => {
  const api = createApi(fakeClient({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }));
  const r = await api.save('saints', { mode: 'update', key: 'x', payload: { name: 'y' } });
  assert.equal(r.ok, false);
  assert.match(r.message, /Nothing was saved/);
});

test('save with no data and no error is still a failure', async () => {
  const r = await createApi(fakeClient({ data: null, error: null })).save('saints', { mode: 'insert', payload: {} });
  assert.equal(r.ok, false);
});

test('update targets the right row', async () => {
  const calls = [];
  await createApi(fakeClient({ data: { id: 'k' }, error: null }, calls)).save('assignments', { mode: 'update', key: '2026-10-21', keyColumn: 'assigned_date', payload: { saint_id: 's' } });
  assert.deepEqual(calls.find((c) => c[0] === 'eq'), ['eq', 'assigned_date', '2026-10-21']);
});

test('remove succeeds only if a row was deleted', async () => {
  assert.equal((await createApi(fakeClient({ data: [{ id: 1 }], error: null })).remove('saints', '1')).ok, true);
  const none = await createApi(fakeClient({ data: [], error: null })).remove('saints', '1');
  assert.equal(none.ok, false);
  assert.match(none.message, /Nothing was deleted/);
});

test('list pages through results', async () => {
  let page = 0;
  const client = { from: () => new Proxy({}, { get(_, p) {
    if (p === 'then') return (res) => { page++; return Promise.resolve({ data: page === 1 ? Array(1000).fill({}) : Array(5).fill({}), error: null }).then(res); };
    return () => client.from();
  } }) };
  const r = await createApi(client).list('saints');
  assert.equal(r.rows.length, 1005);
});

test('auth expiry triggers the callback and a clear message', async () => {
  let expired = 0;
  const api = createApi(fakeClient({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }), { onAuthExpired: () => expired++ });
  const r = await api.list('saints');
  assert.equal(r.ok, false);
  assert.equal(expired, 1);
  assert.match(r.message, /session has expired/);
});

test('isAdmin is true only for a literal true', async () => {
  assert.equal(await createApi(fakeClient({ data: true, error: null })).isAdmin(), true);
  assert.equal(await createApi(fakeClient({ data: false, error: null })).isAdmin(), false);
  assert.equal(await createApi(fakeClient({ data: null, error: { message: 'x' } })).isAdmin(), false);
});

test('sign-in failure message does not reveal whether the account exists', async () => {
  const client = { auth: { signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }) } };
  const r = await createApi(client).signIn('a@b.c', 'pw');
  assert.equal(r.ok, false);
  assert.match(r.message, /Check your email and password/);
});

test('describeError covers permission and network cases', () => {
  assert.match(describeError({ code: '42501', message: 'x' }), /permission/);
  assert.match(describeError({ message: 'Failed to fetch' }), /Could not reach the server/);
  assert.match(describeError({ code: '23514', message: 'violates check constraint' }), /database rule/);
  assert.equal(isAuthExpired({ message: 'JWT expired' }), true);
  assert.equal(isAuthExpired({ message: 'other' }), false);
});
