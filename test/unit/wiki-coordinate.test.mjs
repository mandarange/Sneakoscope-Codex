import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbaKey, rgbaToWikiCoord } from '../../src/core/wiki-coordinate.mjs';

test('rgba wiki coordinates are stable and bounded', () => {
  assert.equal(rgbaKey([58, 132, 210, 240]), '3a84d2f0');
  const coord = rgbaToWikiCoord([58, 132, 210, 240]);
  assert.equal(coord.xyzw.length, 4);
  assert.ok(coord.xyzw.every((value) => Number.isFinite(value)));
});
