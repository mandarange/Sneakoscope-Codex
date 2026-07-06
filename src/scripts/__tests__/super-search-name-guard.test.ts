import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPER_SEARCH_LEGACY_NAME_DENYLIST } from '../super-search-name-guard-check.js';

test('Super-Search name guard tracks the legacy search names', () => {
  assert.ok(SUPER_SEARCH_LEGACY_NAME_DENYLIST.includes(['insane', 'search'].join('-') as any));
  assert.ok(SUPER_SEARCH_LEGACY_NAME_DENYLIST.includes(['Ultra', 'Search'].join('') as any));
  assert.ok(SUPER_SEARCH_LEGACY_NAME_DENYLIST.includes(['sks', ['ultra', 'search'].join('-')].join('.') as any));
});
