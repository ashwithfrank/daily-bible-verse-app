import { startApp } from './app.js';
import { checkConfig } from './config-check.js';
import { h } from './dom.js';

const root = document.getElementById('app');
const cfg = window.APP_CONFIG;
const problem = checkConfig(cfg);

if (problem) {
  root.replaceChildren(h('main', { class: 'login' }, h('h1', {}, 'Admin setup needed'), h('p', { class: 'error', role: 'alert' }, problem)));
} else {
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  startApp(client, root);
}
