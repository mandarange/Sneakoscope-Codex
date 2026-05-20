#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const mod = await import(pathToFileURL(path.join(root, 'dist/core/loop-blocker.js')));
const report = mod.detectRepeatedBlocker([
  { reason: 'imagegen_capability_missing', detail: 'Codex App tool unavailable' },
  { reason: 'imagegen_capability_missing', detail: 'Codex App tool unavailable' }
], 2);
assert.equal(report.stop_required, true);
assert.equal(report.repeated[0].count, 2);

console.log(JSON.stringify({ schema: 'sks.loop-blocker-check.v1', ok: true, report }, null, 2));
