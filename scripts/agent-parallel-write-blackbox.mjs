#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const schemaMod = await importDist('core/agents/agent-patch-schema.js');
const applyMod = await importDist('core/agents/agent-patch-apply-worker.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-agent-blackbox-'));
fs.writeFileSync(path.join(tmp, 'fixture.txt'), 'before\n');
const envelope = schemaMod.normalizeAgentPatchEnvelope({
  agent_id: 'blackbox-agent',
  session_id: 'blackbox-session',
  slot_id: 'blackbox-slot',
  generation_index: 1,
  lease_id: 'lease:blackbox-agent:fixture.txt',
  operations: [{ op: 'replace', path: 'fixture.txt', search: 'before', replace: 'after' }]
});
const dry = await applyMod.applyAgentPatchEnvelope(tmp, envelope, { dryRun: true });
const applied = await applyMod.applyAgentPatchEnvelope(tmp, envelope);
const agentRun = spawnSync(process.execPath, [
  'dist/bin/sks.js',
  'agent',
  'run',
  'agent parallel write blackbox route fixture',
  '--mock',
  '--write-mode',
  'parallel',
  '--apply-patches',
  '--dry-run-patches',
  '--max-write-agents',
  '1',
  '--json'
], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
const agentJson = parseJson(agentRun.stdout);
const routePolicy = agentJson?.parallel_write_policy || null;
const report = { schema: 'sks.agent-parallel-write-blackbox.v1', ok: dry.ok && applied.ok && agentRun.status === 0 && routePolicy?.route_level_flags_wired === true, dry, applied, route_command: { status: agentRun.status, mission_id: agentJson?.mission_id || null, route_policy: routePolicy, stderr_tail: agentRun.stderr.slice(-2000) } };
const out = path.join(root, '.sneakoscope', 'reports', 'agent-parallel-write-blackbox.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(dry.status === 'dry_run', 'agent parallel write blackbox dry-run status mismatch', report);
assertGate(applied.ok === true, 'agent parallel write blackbox apply failed', report);
assertGate(fs.readFileSync(path.join(tmp, 'fixture.txt'), 'utf8') === 'after\n', 'agent parallel write blackbox content mismatch', report);
assertGate(routePolicy?.write_mode === 'parallel', 'Agent route must carry --write-mode parallel into native agent policy', report);
assertGate(routePolicy?.apply_patches === true, 'Agent route must carry --apply-patches into native agent policy', report);
emitGate('agent:parallel-write-blackbox', { changed_files: applied.changed_files.length });

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
