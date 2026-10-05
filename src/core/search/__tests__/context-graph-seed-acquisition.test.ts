/**
 * Seed acquisition, in isolation.
 *
 * Seeding is the only place the context path is allowed to be lexical, so the
 * property that matters is that each channel's confidence survives: a symbol
 * definition is a definition, a path hit is a path hit, and a substring hit is
 * never promoted above `text_candidate`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contextGraphFocusPaths } from '../context-graph-seeds.js';

describe('context graph seed acquisition', () => {
  it('drops glob patterns and escaping paths from the focus list', () => {
    assert.deepEqual(contextGraphFocusPaths(['src/app', './src/other/', 'src/**/*.ts', '../outside', '/etc']), [
      'src/app',
      'src/other'
    ]);
    assert.deepEqual(contextGraphFocusPaths(undefined), []);
  });

});
