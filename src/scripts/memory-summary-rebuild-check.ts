#!/usr/bin/env node
// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const wiki = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'wiki', 'rebuild-summary', '--json'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
  timeout: 60_000
});
assert.equal(wiki.status, 0, wiki.stderr || wiki.stdout);
const summary = JSON.parse(wiki.stdout);
assert.equal(summary.schema, 'sks.memory-summary.v2');
assert.equal(summary.summaries.triwiki.schema_version, 2);
assert.equal(summary.summaries.wrongness.schema_version, 2);
await fs.rm(path.join(root, '.sneakoscope/wiki/memory-summary.json'), { force: true });
await fs.rm(path.join(root, '.sneakoscope/wiki/memory-summary.md'), { force: true });

console.log(JSON.stringify({ schema: 'sks.memory-summary-rebuild-check.v1', ok: true, summary: summary.summaries }, null, 2));
