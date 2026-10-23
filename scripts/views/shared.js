import { h } from '../dom.js';

export function loadError(ctx, message, retry) {
  ctx.main.replaceChildren(
    h('p', { class: 'error', role: 'alert' }, `Could not load this page. ${message}`),
    h('button', { type: 'button', class: 'btn', onclick: retry }, 'Try again'));
}

/** Runs a save/delete with a disabled button and an inline error line. */
export async function withSaving(button, errorBox, label, action) {
  errorBox.textContent = '';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = label;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export function formatDate(iso) {
  return iso ?? '\u2014';
}
