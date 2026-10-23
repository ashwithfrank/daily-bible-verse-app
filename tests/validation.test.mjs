import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIsoDate, slugify, parseSources, formatSources, parseNames,
  validateVerse, validateSaint, validateTranslation, validateAssignment, pickSaintOfDay,
} from '../scripts/validation.js';

const verse = (o = {}) => ({ translation_id: 'SAMPLE', book: 'Sample', chapter: '1', verse_start: '2', verse_text: 'text', ...o });

test('isValidIsoDate rejects impossible dates', () => {
  assert.equal(isValidIsoDate('2028-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('21-10-2026'), false);
  assert.equal(isValidIsoDate(''), false);
});

test('slugify strips accents and punctuation', () => {
  assert.equal(slugify('Thérèse of Lisieux'), 'therese-of-lisieux');
  assert.equal(slugify('  St. Francis -- of Assisi!  '), 'st-francis-of-assisi');
});

test('verse: minimal valid record and normalisation', () => {
  const r = validateVerse(verse({ reflection: '   ', display_date: '2026-10-21' }));
  assert.equal(r.ok, true);
  assert.equal(r.value.chapter, 1);
  assert.equal(r.value.reflection, null);
  assert.equal(r.value.status, 'draft');
  assert.equal(r.value.verse_end, null);
});

test('verse: required fields and bad numbers are reported per field', () => {
  const r = validateVerse({ chapter: 'x', verse_start: '0' });
  assert.equal(r.ok, false);
  for (const k of ['translation_id', 'book', 'verse_text', 'chapter', 'verse_start']) assert.ok(r.errors[k], k);
});

test('verse: range and date rules', () => {
  assert.ok(validateVerse(verse({ verse_start: '5', verse_end: '3' })).errors.verse_end);
  assert.equal(validateVerse(verse({ verse_start: '5', verse_end: '5' })).ok, true);
  assert.ok(validateVerse(verse({ display_date: '2026-02-30' })).errors.display_date);
  assert.ok(validateVerse(verse({ status: 'live' })).errors.status);
});

test('saint: slug is generated from the name and feast day is validated', () => {
  const r = validateSaint({ name: 'Thérèse of Lisieux', feast_month: '10', feast_day: '1' });
  assert.equal(r.ok, true);
  assert.equal(r.value.slug, 'therese-of-lisieux');
  assert.ok(validateSaint({ name: 'A', feast_month: '2', feast_day: '30' }).errors.feast_day);
  assert.ok(validateSaint({ name: 'A', feast_month: '3' }).errors.feast_day);
  assert.equal(validateSaint({ name: 'A', feast_month: '2', feast_day: '29' }).ok, true);
  assert.ok(validateSaint({ name: 'A', feast_month: '13', feast_day: '1' }).errors.feast_month);
});

test('saint: publishing needs a summary; drafts do not', () => {
  assert.ok(validateSaint({ name: 'A', status: 'published' }).errors.summary);
  assert.equal(validateSaint({ name: 'A', status: 'draft' }).ok, true);
  assert.equal(validateSaint({ name: 'A', status: 'published', summary: 's' }).ok, true);
});

test('saint: images need https plus credit and licence', () => {
  const r = validateSaint({ name: 'A', image_url: 'http://x.org/a.jpg' });
  assert.ok(r.errors.image_url && r.errors.image_credit && r.errors.image_license);
  assert.equal(validateSaint({ name: 'A', image_url: 'https://x.org/a.jpg', image_credit: 'c', image_license: 'CC0' }).ok, true);
});

test('saint: unknown dates stay as typed, blank becomes null', () => {
  const r = validateSaint({ name: 'Patrick', birth_date_text: 'unknown (5th century)', death_date_text: '  ' });
  assert.equal(r.value.birth_date_text, 'unknown (5th century)');
  assert.equal(r.value.death_date_text, null);
});

test('sources round-trip and bad lines are reported', () => {
  const { sources, errors } = parseSources('Book A\nBook B | a note\nBook C | n | https://example.org\n\nBad | n | http://insecure');
  assert.equal(sources.length, 3);
  assert.equal(errors.length, 1);
  assert.deepEqual(parseSources(formatSources(sources)).sources, sources);
  assert.ok(validateSaint({ name: 'A', sources_text: 'x | y | http://nope' }).errors.sources_text);
});

test('alternate names accept lines and semicolons', () => {
  assert.deepEqual(parseNames('Mother Teresa\n Anjezë ; Agnes '), ['Mother Teresa', 'Anjezë', 'Agnes']);
});

test('translation rules', () => {
  assert.equal(validateTranslation({ id: 'SAMPLE', name: 'Dev' }).ok, true);
  assert.ok(validateTranslation({ id: 'bad id', name: 'x' }).errors.id);
  assert.ok(validateTranslation({ id: 'X', name: ' ' }).errors.name);
});

test('assignment rules', () => {
  assert.equal(validateAssignment({ assigned_date: '2026-10-21', saint_id: 'abc' }).ok, true);
  const r = validateAssignment({ assigned_date: '2026-02-30', saint_id: '' });
  assert.ok(r.errors.assigned_date && r.errors.saint_id);
});

test('pickSaintOfDay mirrors the documented rule', () => {
  const saints = [
    { id: 'a', name: 'A', status: 'published', feast_month: 3, feast_day: 15, feast_rank: 5 },
    { id: 'b', name: 'B', status: 'published', feast_month: 3, feast_day: 15, feast_rank: 1 },
    { id: 'c', name: 'C', status: 'draft', feast_month: 4, feast_day: 1, feast_rank: 0 },
    { id: 'd', name: 'D', status: 'published', feast_month: 2, feast_day: 29, feast_rank: 0 },
  ];
  assert.equal(pickSaintOfDay(saints, [], '2026-03-15').saint.id, 'b');
  assert.equal(pickSaintOfDay(saints, [{ assigned_date: '2026-03-15', saint_id: 'a' }], '2026-03-15').reason, 'explicit');
  assert.equal(pickSaintOfDay(saints, [{ assigned_date: '2026-04-01', saint_id: 'c' }], '2026-04-01').saint, null);
  assert.equal(pickSaintOfDay(saints, [], '2026-06-06').saint, null);
  assert.equal(pickSaintOfDay(saints, [], '2028-02-29').saint.id, 'd');
  assert.equal(pickSaintOfDay(saints, [], '2026-02-28').saint, null);
});
