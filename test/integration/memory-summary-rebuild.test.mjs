import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { rebuildMemorySummaries } from '../../dist/core/memory-summary.js';
import { tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('memory summary rebuild writes JSON and Markdown summaries', async () => {
  const { root } = await tempImageRoot('sks-memory-integration-');
  const summary = await rebuildMemorySummaries(root);
  assert.equal(summary.ok, true);
  await fs.access(path.join(root, '.sneakoscope/wiki/memory-summary.json'));
  await fs.access(path.join(root, '.sneakoscope/wiki/memory-summary.md'));
});
