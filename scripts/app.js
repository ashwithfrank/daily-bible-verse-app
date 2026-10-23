import { h } from './dom.js';
import { createApi } from './api.js';
import { renderVerses } from './views/verses.js';
import { renderSaints } from './views/saints.js';
import { renderAssignments } from './views/assignments.js';
import { renderTranslations } from './views/translations.js';

const ROUTES = {
  verses: { label: 'Daily verses', render: renderVerses },
  saints: { label: 'Saints', render: renderSaints },
  assignments: { label: 'Saint of the Day', render: renderAssignments },
  translations: { label: 'Translations', render: renderTranslations },
};

export function startApp(client, root, { win = window } = {}) {
  let renderToken = 0;
  let toastTimer = null;
  let toastBox = null;

  const api = createApi(client, {
    onAuthExpired: () => { showLogin('Your session has expired. Please sign in again.'); },
  });

  function toast(message, type = 'ok') {
    const box = toastBox;
    if (!box) return;
    box.className = `toast toast-${type}`;
    box.textContent = message;
    win.clearTimeout(toastTimer);
    // Use the captured box: the dashboard may have been replaced by the login screen by then.
    toastTimer = win.setTimeout(() => { box.textContent = ''; box.className = 'toast'; }, 5000);
  }

  function confirmDialog(message, okLabel = 'Confirm') {
    return new Promise((resolve) => {
      const done = (value) => { overlay.remove(); resolve(value); };
      const cancel = h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, 'Cancel');
      const ok = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => done(true) }, okLabel);
      const overlay = h('div', { class: 'overlay' },
        h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirmation' },
          h('p', {}, message), h('div', { class: 'actions' }, cancel, ok)));
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
      root.append(overlay);
      cancel.focus();
    });
  }

  function showModal(title, content) {
    const close = () => overlay.remove();
    const closeBtn = h('button', { type: 'button', class: 'btn', onclick: close }, 'Close');
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'dialog dialog-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), content, h('div', { class: 'actions' }, closeBtn)));
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    root.append(overlay);
    closeBtn.focus();
  }

  function showLogin(message = '') {
    renderToken++;
    toastBox = null;
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', required: true });
    const password = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const error = h('div', { class: 'error', role: 'alert' }, message);
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Sign in');
    const form = h('form', { class: 'login-form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), password),
      error, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      if (!email.value.trim() || !password.value) { error.textContent = 'Enter your email and password.'; return; }
      submit.disabled = true; submit.textContent = 'Signing in\u2026';
      const result = await api.signIn(email.value.trim(), password.value);
      if (!result.ok) { error.textContent = result.message; submit.disabled = false; submit.textContent = 'Sign in'; return; }
      password.value = '';
      await boot();
    });
    root.replaceChildren(h('main', { class: 'login' }, h('h1', {}, 'Daily Bible Verse'), h('p', { class: 'muted' }, 'Administrator sign-in \u2013 AlphaOmega Studio'), form));
    email.focus();
  }

  async function renderRoute(main) {
    const key = (win.location.hash || '').replace(/^#/, '') || 'verses';
    const route = ROUTES[key] ?? ROUTES.verses;
    for (const link of root.querySelectorAll('nav a')) {
      if (link.dataset.route === (ROUTES[key] ? key : 'verses')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const token = ++renderToken;
    const ctx = {
      api, main, toast, confirm: confirmDialog, showModal,
      isCurrent: () => token === renderToken,
      reload: () => renderRoute(main),
    };
    main.replaceChildren(h('p', { class: 'muted' }, 'Loading\u2026'));
    try {
      await route.render(ctx);
    } catch (err) {
      if (token === renderToken) main.replaceChildren(h('p', { class: 'error', role: 'alert' }, 'Something went wrong showing this page. Please reload.'));
    }
  }

  function showShell(user) {
    const main = h('main', { id: 'main', tabindex: '-1' });
    toastBox = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    const nav = h('nav', { 'aria-label': 'Sections' },
      Object.entries(ROUTES).map(([key, r]) => h('a', { href: `#${key}`, 'data-route': key }, r.label)));
    const signOut = h('button', { type: 'button', class: 'btn', onclick: async () => { await api.signOut(); showLogin('You have been signed out.'); } }, 'Sign out');
    root.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('strong', {}, 'Daily Bible Verse'), h('span', { class: 'muted' }, ' \u00B7 Admin')),
        nav,
        h('div', { class: 'who' }, h('span', { class: 'muted' }, user?.email ?? ''), signOut)),
      main, toastBox);
    win.addEventListener('hashchange', () => { if (root.contains(main)) renderRoute(main); });
    renderRoute(main);
  }

  async function boot() {
    const session = await api.getSession();
    if (!session) { showLogin(); return; }
    // The UI check only decides what to show. Real authorization is enforced by database RLS.
    if (!(await api.isAdmin())) {
      await api.signOut();
      showLogin('This account is not an administrator.');
      return;
    }
    showShell(session.user);
  }

  client.auth.onAuthStateChange?.((event) => { if (event === 'SIGNED_OUT' && !root.querySelector('.login')) showLogin('You have been signed out.'); });
  return boot();
}
