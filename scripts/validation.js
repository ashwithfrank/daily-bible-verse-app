// Pure validation and data-shaping helpers (no DOM, no network) so they can be unit-tested in Node.
// The database enforces the same rules (see supabase/migrations/0001); this gives friendly messages first.

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const clean = (v) => (blank(v) ? null : String(v).trim());

export function isValidIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parses a whole number from a form value. Returns {value, error}. Blank => value null, no error. */
function parseInteger(raw) {
  if (blank(raw)) return { value: null, error: null };
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) return { value: null, error: 'Enter a whole number.' };
  return { value: Number(text), error: null };
}

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------- sources / names
/** One source per line: "Title" or "Title | note" or "Title | note | https://url". */
export function parseSources(text) {
  const sources = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    if (blank(line)) return;
    const [title, note, url] = line.split('|').map((p) => p.trim());
    if (blank(title)) { errors.push(`Source line ${i + 1} has no title.`); return; }
    if (!blank(url) && !/^https:\/\//.test(url)) { errors.push(`Source line ${i + 1}: the link must start with https://`); return; }
    const entry = { title };
    if (!blank(note)) entry.note = note;
    if (!blank(url)) entry.url = url;
    sources.push(entry);
  });
  return { sources, errors };
}

export function formatSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((s) => [s.title, s.note ?? '', s.url ?? ''].join(' | ').replace(/( \| )+$/, '').trim())
    .join('\n');
}

export function parseNames(text) {
  return String(text ?? '').split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- validators
function finish(errors, value) {
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function validateTranslation(input) {
  const errors = {};
  const id = clean(input.id);
  if (!id) errors.id = 'An id is required (e.g. SAMPLE or WEB).';
  else if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) errors.id = 'Use 1-32 letters, numbers, - or _ only.';
  const name = clean(input.name);
  if (!name) errors.name = 'A name is required.';
  return finish(errors, {
    id, name,
    language_code: clean(input.language_code) ?? 'en',
    license_notes: clean(input.license_notes),
    is_sample: !!input.is_sample,
    is_active: input.is_active === undefined ? true : !!input.is_active,
  });
}

export function validateVerse(input) {
  const errors = {};
  if (blank(input.translation_id)) errors.translation_id = 'Choose a translation.';
  if (blank(input.book)) errors.book = 'The Bible book is required.';
  if (blank(input.verse_text)) errors.verse_text = 'The verse text is required.';

  const ch = parseInteger(input.chapter);
  if (ch.error || ch.value === null) errors.chapter = ch.error ?? 'The chapter is required.';
  else if (ch.value < 1) errors.chapter = 'The chapter must be 1 or more.';

  const vs = parseInteger(input.verse_start);
  if (vs.error || vs.value === null) errors.verse_start = vs.error ?? 'The starting verse is required.';
  else if (vs.value < 1) errors.verse_start = 'The verse must be 1 or more.';

  const ve = parseInteger(input.verse_end);
  if (ve.error) errors.verse_end = ve.error;
  else if (ve.value !== null && vs.value !== null && ve.value < vs.value) errors.verse_end = 'The ending verse cannot be before the starting verse.';

  const date = clean(input.display_date);
  if (date && !isValidIsoDate(date)) errors.display_date = 'Enter a real date (YYYY-MM-DD).';

  const status = clean(input.status) ?? 'draft';
  if (!['draft', 'published'].includes(status)) errors.status = 'Status must be draft or published.';

  return finish(errors, {
    translation_id: clean(input.translation_id),
    display_date: date,
    book: clean(input.book),
    chapter: ch.value,
    verse_start: vs.value,
    verse_end: ve.value,
    verse_text: clean(input.verse_text),
    reflection: clean(input.reflection),
    source_notes: clean(input.source_notes),
    status,
  });
}

export function validateSaint(input) {
  const errors = {};
  const name = clean(input.name);
  if (!name) errors.name = 'The name is required.';

  const slug = clean(input.slug) ?? slugify(name);
  if (!slug) errors.slug = 'A slug is required.';
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.slug = 'Use lower-case letters, numbers and single hyphens only.';

  const fm = parseInteger(input.feast_month);
  const fd = parseInteger(input.feast_day);
  if (fm.error) errors.feast_month = fm.error;
  if (fd.error) errors.feast_day = fd.error;
  if (!fm.error && !fd.error) {
    if ((fm.value === null) !== (fd.value === null)) {
      errors.feast_day = 'Set both the feast month and day, or leave both empty.';
    } else if (fm.value !== null) {
      if (fm.value < 1 || fm.value > 12) errors.feast_month = 'Month must be 1-12.';
      else if (fd.value < 1 || fd.value > MONTH_DAYS[fm.value - 1]) errors.feast_day = `${MONTH_NAMES[fm.value - 1]} has at most ${MONTH_DAYS[fm.value - 1]} days.`;
    }
  }

  const rank = parseInteger(input.feast_rank);
  if (rank.error) errors.feast_rank = rank.error;

  const status = clean(input.status) ?? 'draft';
  if (!['draft', 'published'].includes(status)) errors.status = 'Status must be draft or published.';
  const summary = clean(input.summary);
  if (status === 'published' && !summary) errors.summary = 'A published saint needs a short introduction.';

  const imageUrl = clean(input.image_url);
  const credit = clean(input.image_credit);
  const license = clean(input.image_license);
  if (imageUrl) {
    if (!/^https:\/\//.test(imageUrl)) errors.image_url = 'The image link must start with https://';
    if (!credit) errors.image_credit = 'Image credit is required when an image is set.';
    if (!license) errors.image_license = 'Image licence is required when an image is set.';
  }

  const src = parseSources(input.sources_text);
  if (src.errors.length) errors.sources_text = src.errors.join(' ');

  return finish(errors, {
    slug, name,
    alternate_names: parseNames(input.alternate_names_text),
    feast_month: fm.value, feast_day: fd.value,
    feast_rank: rank.value ?? 0,
    feast_note: clean(input.feast_note),
    birth_date_text: clean(input.birth_date_text), birth_place: clean(input.birth_place),
    death_date_text: clean(input.death_date_text), death_place: clean(input.death_place),
    summary,
    early_life: clean(input.early_life), vocation: clean(input.vocation),
    major_works: clean(input.major_works), struggles: clean(input.struggles),
    death_legacy: clean(input.death_legacy),
    scripture_reference: clean(input.scripture_reference),
    scripture_explanation: clean(input.scripture_explanation),
    reflection: clean(input.reflection),
    historical_notes: clean(input.historical_notes),
    tradition_notes: clean(input.tradition_notes),
    sources: src.sources,
    image_url: imageUrl, image_credit: credit, image_license: license,
    status,
  });
}

export function validateAssignment(input) {
  const errors = {};
  const date = clean(input.assigned_date);
  if (!date) errors.assigned_date = 'Choose a date.';
  else if (!isValidIsoDate(date)) errors.assigned_date = 'Enter a real date (YYYY-MM-DD).';
  if (blank(input.saint_id)) errors.saint_id = 'Choose a saint.';
  return finish(errors, { assigned_date: date, saint_id: clean(input.saint_id) });
}

// ---------------------------------------------------------------- Saint of the Day preview
/**
 * Mirrors the database function get_saint_of_the_day and the app's selectSaintOfDay:
 *  1. explicit assignment for the date (published saint), 2. feast month/day match
 *  (lowest feast_rank, then name, then id), 3. nothing.
 * Only PUBLISHED saints are considered, because that is what the public sees.
 */
export function pickSaintOfDay(saints, assignments, isoDate) {
  const published = saints.filter((s) => s.status === 'published');
  const assigned = assignments.find((a) => a.assigned_date === isoDate);
  if (assigned) {
    const s = published.find((p) => p.id === assigned.saint_id);
    if (s) return { saint: s, reason: 'explicit' };
  }
  if (!isValidIsoDate(isoDate)) return { saint: null, reason: 'none' };
  const [, m, d] = isoDate.split('-').map(Number);
  const matches = published
    .filter((s) => s.feast_month === m && s.feast_day === d)
    .sort((a, b) => (a.feast_rank - b.feast_rank) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : 1));
  return matches.length ? { saint: matches[0], reason: 'feast' } : { saint: null, reason: 'none' };
}
