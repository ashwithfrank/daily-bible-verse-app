import { h } from './dom.js';

/**
 * A labelled form field with its own error line.
 * spec: {name, label, type: text|number|date|textarea|select|checkbox, options, rows, hint, required, disabled}
 */
export function makeField(spec) {
  const id = `f-${spec.name}`;
  let input;
  if (spec.type === 'textarea') input = h('textarea', { id, name: spec.name, rows: spec.rows ?? 4 });
  else if (spec.type === 'select') {
    input = h('select', { id, name: spec.name },
      (spec.options ?? []).map((o) => h('option', { value: o.value }, o.label)));
  } else input = h('input', { id, name: spec.name, type: spec.type ?? 'text', inputmode: spec.type === 'number' ? 'numeric' : null });
  if (spec.disabled) input.disabled = true;

  const error = h('div', { class: 'error', id: `${id}-err`, role: 'alert' });
  input.setAttribute('aria-describedby', `${id}-err`);

  const isCheckbox = spec.type === 'checkbox';
  const label = h('label', { for: id }, spec.label, spec.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null);
  const el = h('div', { class: isCheckbox ? 'field field-check' : 'field' },
    isCheckbox ? [input, label] : [label, input],
    spec.hint ? h('div', { class: 'hint' }, spec.hint) : null,
    error);

  return {
    name: spec.name,
    el,
    input,
    get: () => (isCheckbox ? input.checked : input.value),
    set: (v) => { if (isCheckbox) input.checked = !!v; else input.value = v ?? ''; },
    setError: (msg) => {
      error.textContent = msg ?? '';
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    },
  };
}

/** Collect {name: value} from fields. */
export function collect(fields) {
  return Object.fromEntries(fields.map((f) => [f.name, f.get()]));
}

/** Show field errors, focus the first bad field. Returns true if there were none. */
export function showErrors(fields, errors) {
  let first = null;
  for (const f of fields) {
    f.setError(errors[f.name] ?? '');
    if (errors[f.name] && !first) first = f;
  }
  if (first) first.input.focus();
  return !first;
}

export function section(title, ...children) {
  return h('fieldset', { class: 'section' }, h('legend', {}, title), children);
}
