// Refuses to run with a privileged Supabase key. Only the public anon / publishable key may be used in a browser.
export function looksLikeSecretKey(key) {
  const k = String(key ?? '').trim();
  if (k.startsWith('sb_secret_')) return true;
  const parts = k.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
      return JSON.parse(json).role === 'service_role';
    } catch { return false; }
  }
  return false;
}

/** Returns an error message, or null if the configuration looks usable. */
export function checkConfig(cfg) {
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return 'Missing configuration. Copy config.example.js to config.js and fill in your Supabase project URL and public anon key.';
  if (/YOUR-/i.test(cfg.SUPABASE_URL) || /YOUR-/i.test(cfg.SUPABASE_ANON_KEY)) return 'config.js still contains placeholder values.';
  if (!/^https:\/\//.test(cfg.SUPABASE_URL)) return 'SUPABASE_URL must start with https://';
  if (looksLikeSecretKey(cfg.SUPABASE_ANON_KEY)) return 'STOP: this looks like a secret / service_role key. Never use it in a browser. Use the public anon (publishable) key.';
  return null;
}
