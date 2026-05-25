import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodexLbBaseUrl } from '../../dist/cli/install-helpers.js';

test('codex-lb base URL normalizer accepts host and full backend URL', () => {
  assert.equal(normalizeCodexLbBaseUrl('lb.example.com'), 'https://lb.example.com/backend-api/codex');
  assert.equal(normalizeCodexLbBaseUrl('https://lb.example.com'), 'https://lb.example.com/backend-api/codex');
  assert.equal(normalizeCodexLbBaseUrl('https://lb.example.com/backend-api/codex'), 'https://lb.example.com/backend-api/codex');
});
