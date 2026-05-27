#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const mergeMod = await importDist('core/agents/agent-merge-coordinator.js');
const applyMod = await importDist('core/agents/agent-patch-apply-worker.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-team-patch-'));
fs.writeFileSync(path.join(tmp, 'team-a.txt'), 'lane-a\n');
fs.writeFileSync(path.join(tmp, 'team-b.txt'), 'lane-b\n');
const envelopes = [
  { schema: 'sks.agent-patch-envelope.v1', agent_id: 'reviewer-a', operations: [{ op: 'replace', path: 'team-a.txt', search: 'lane-a', replace: 'lane-a-done' }] },
  { schema: 'sks.agent-patch-envelope.v1', agent_id: 'reviewer-b', operations: [{ op: 'replace', path: 'team-b.txt', search: 'lane-b', replace: 'lane-b-done' }] }
];
const merge = mergeMod.coordinateAgentPatchMerge(envelopes);
const applyResults = [];
for (const envelope of envelopes) applyResults.push(await applyMod.applyAgentPatchEnvelope(tmp, envelope));
const teamRun = spawnSync(process.execPath, [
  'dist/bin/sks.js',
  'team',
  'team parallel write blackbox route fixture',
  'executor:1',
  'reviewer:5',
  '--mock',
  '--write-mode',
  'parallel',
  '--apply-patches',
  '--dry-run-patches',
  '--max-write-agents',
  '1',
  '--json'
], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
const teamJson = parseJson(teamRun.stdout);
const routePolicy = teamJson?.native_agent_run?.parallel_write_policy || null;
const report = { schema: 'sks.team-parallel-write-blackbox.v1', ok: merge.ok && applyResults.every((item) => item.ok) && teamRun.status === 0 && routePolicy?.route_level_flags_wired === true, merge, applyResults, route_command: { status: teamRun.status, stderr_tail: teamRun.stderr.slice(-2000), mission_id: teamJson?.mission_id || null, route_policy: routePolicy } };
const out = path.join(root, '.sneakoscope', 'reports', 'team-parallel-write-blackbox.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(report.ok === true, 'Team parallel write blackbox must pass', report);
assertGate(routePolicy?.write_mode === 'parallel', 'Team route must carry --write-mode parallel into native agent policy', report);
assertGate(routePolicy?.apply_patches === true, 'Team route must carry --apply-patches into native agent policy', report);
assertGate(routePolicy?.dry_run_patches === true, 'Team route must carry --dry-run-patches into native agent policy', report);
emitGate('team:parallel-write-blackbox', { changed_files: applyResults.flatMap((item) => item.changed_files).length });

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
