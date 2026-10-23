// Thin data-access layer over a supabase-js client. No DOM. Its job is honesty:
// a save is only reported as successful when the database returned the saved row.

/** Translate a Postgres / PostgREST error into a message an administrator can act on. */
export function describeError(error) {
  if (!error) return '';
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '');
  if (code === '23505') return 'A record with the same unique value already exists (for example, the same date, slug or passage). Edit the existing one instead.';
  if (code === '23514') return `One of the values breaks a database rule. ${msg}`.trim();
  if (code === '23503') return 'This record is linked to another record (for example a saint assigned to a date). Remove the link first.';
  if (code === '42501' || /row-level security/i.test(msg)) return 'You do not have permission to do that.';
  if (code === 'PGRST116') return 'Nothing was saved: the record no longer exists or you do not have permission to change it.';
  if (/jwt|token/i.test(msg) && /expired|invalid/i.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) return 'Could not reach the server. Check your internet connection and try again.';
  return msg || 'Something went wrong. Please try again.';
}

export function isAuthExpired(error) {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '');
  return code === 'PGRST301' || (/jwt/i.test(msg) && /expired/i.test(msg));
}

const PAGE = 1000;

export function createApi(client, { onAuthExpired = () => {} } = {}) {
  const fail = (error) => {
    if (isAuthExpired(error)) onAuthExpired();
    return { ok: false, message: describeError(error) };
  };

  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return data?.session ?? null;
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      // Deliberately generic: do not reveal whether the email exists.
      return error ? { ok: false, message: 'Sign-in failed. Check your email and password.' } : { ok: true };
    },

    async signOut() {
      await client.auth.signOut();
    },

    /** Authorization is enforced by RLS; this only decides what the UI shows. */
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      return !error && data === true;
    },

    /** Fetch every row (paged). Returns {ok, rows}. */
    async list(table, { select = '*', orderBy = 'id', ascending = true } = {}) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.from(table).select(select)
          .order(orderBy, { ascending }).range(from, from + PAGE - 1);
        if (error) return fail(error);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return { ok: true, rows };
    },

    /** mode 'insert' | 'update'. Success only if the saved row came back. */
    async save(table, { mode, key, keyColumn = 'id', payload }) {
      const base = client.from(table);
      const query = mode === 'update' ? base.update(payload).eq(keyColumn, key) : base.insert(payload);
      const { data, error } = await query.select().single();
      if (error) return fail(error);
      if (!data) return { ok: false, message: 'Nothing was saved. Please try again.' };
      return { ok: true, row: data };
    },

    /** Success only if a row was actually deleted. */
    async remove(table, key, keyColumn = 'id') {
      const { data, error } = await client.from(table).delete().eq(keyColumn, key).select();
      if (error) return fail(error);
      if (!data || data.length === 0) return { ok: false, message: 'Nothing was deleted: the record is already gone or you do not have permission.' };
      return { ok: true };
    },
  };
}
