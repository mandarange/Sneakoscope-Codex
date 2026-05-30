#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-lane-renderer.js')).href);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-lane-'));
await fs.writeFile(path.join(tmp, 'agent-scheduler-state.json'), `${JSON.stringify({ target_active_slots: 1, active_slot_count: 1, pending_count: 2, completed_count: 3 }, null, 2)}\n`);
await fs.writeFile(path.join(tmp, 'agent-patch-queue.json'), `${JSON.stringify({ queue: [{ slot_id: 'slot-001', target_file: 'src/core/example.ts' }] }, null, 2)}\n`);
await fs.writeFile(path.join(tmp, 'agent-proof-evidence.json'), `${JSON.stringify({ ok: false, blockers: ['fixture_blocker_visible'] }, null, 2)}\n`);
const frame = await mod.renderZellijLaneFrame({ missionId: 'M-lane', slot: 'slot-001', ledgerRoot: tmp, once: true, color: false });
const required = ['SKS Lane', 'Mission', 'Mode', 'Workers', 'Current', 'Queue', 'Safety', 'Blockers', 'Reports', 'Keys:', 'src/core/example.ts', 'fixture_blocker_visible'];
const ok = required.every((item) => frame.frame.includes(item)) && frame.report.stdout_only === true;
const report = { schema: 'sks.zellij-lane-renderer-check.v1', ok, frame: frame.report };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'zellij-lane-renderer.json'), `${JSON.stringify(report, null, 2)}\n`);
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-lane-renderer-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
