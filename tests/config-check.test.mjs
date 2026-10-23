import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig, looksLikeSecretKey } from '../scripts/config-check.js';

const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

test('a service_role JWT and sb_secret_ keys are refused', () => {
  assert.equal(looksLikeSecretKey(jwt({ role: 'service_role' })), true);
  assert.equal(looksLikeSecretKey('sb_secret_abc123'), true);
  assert.equal(looksLikeSecretKey(jwt({ role: 'anon' })), false);
  assert.equal(looksLikeSecretKey('sb_publishable_abc'), false);
  assert.equal(looksLikeSecretKey('garbage'), false);
});

test('checkConfig messages', () => {
  assert.match(checkConfig(undefined), /Missing configuration/);
  assert.match(checkConfig({ SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co', SUPABASE_ANON_KEY: 'x' }), /placeholder/);
  assert.match(checkConfig({ SUPABASE_URL: 'http://a.supabase.co', SUPABASE_ANON_KEY: 'x' }), /https/);
  assert.match(checkConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }), /STOP/);
  assert.equal(checkConfig({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }), null);
});
