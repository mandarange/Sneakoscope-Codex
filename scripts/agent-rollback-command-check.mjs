#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';
import { writeReport } from './agent-patch-swarm-gate-lib.mjs';

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-rollback-command-'));
const file = path.join(project, 'a.txt');
fs.writeFileSync(file, 'after\n');
const mission = 'M-rollback-command';
const missionRoot = path.join(project, '.sneakoscope', 'missions', mission);
const agentRoot = path.join(missionRoot, 'agents');
fs.mkdirSync(agentRoot, { recursive: true });
fs.writeFileSync(path.join(missionRoot, 'mission.json'), `${JSON.stringify({
  id: mission,
  mode: 'agent',
  prompt: 'Rollback command fixture',
  created_at: new Date().toISOString(),
  phase: 'AGENT_PATCH_ROLLBACK_FIXTURE',
  questions_allowed: false,
  implementation_allowed: true
}, null, 2)}\n`);
fs.writeFileSync(path.join(missionRoot, 'events.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), type: 'mission.created', mission, mode: 'agent' })}\n`);
fs.writeFileSync(path.join(agentRoot, 'agent-patch-apply-results.json'), `${JSON.stringify({
  schema: 'sks.agent-patch-apply-results.v1',
  results: [{
    entry_id: 'entry-a',
    agent_id: 'agent-a',
    lease_id: 'lease-a',
    ok: true,
    changed_files: ['a.txt'],
    rollback_digest: 'digest-a',
    rollback: [{ path: 'a.txt', existed: true, sha256_after: sha256Text('after\n'), sha256_before: sha256Text('before\n'), content_before: 'before\n' }]
  }]
}, null, 2)}\n`);
fs.writeFileSync(path.join(agentRoot, 'agent-patch-queue.json'), `${JSON.stringify({
  schema: 'sks.agent-patch-queue.v1',
  entries: [{ id: 'entry-a', agent_id: 'agent-a', write_paths: ['a.txt'], status: 'verified', violations: [] }],
  events: [],
  ownership_ledger: []
}, null, 2)}\n`);
const currentPath = path.join(project, '.sneakoscope', 'current.json');
fs.mkdirSync(path.dirname(currentPath), { recursive: true });
fs.writeFileSync(currentPath, `${JSON.stringify({ mission_id: mission }, null, 2)}\n`);
const statePath = path.join(project, '.sneakoscope', 'state', 'current.json');
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, `${JSON.stringify({ mission_id: mission, mode: 'AGENT', phase: 'AGENT_PATCH_ROLLBACK_FIXTURE' }, null, 2)}\n`);
const env = { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' };
const dry = spawnSync(process.execPath, [path.join(root, 'dist', 'bin', 'sks.js'), 'agent', 'rollback-patches', 'latest', '--patch-entry-id', 'entry-a', '--dry-run', '--json'], { cwd: project, encoding: 'utf8', env });
const apply = spawnSync(process.execPath, [path.join(root, 'dist', 'bin', 'sks.js'), 'agent', 'rollback-patches', mission, '--patch-entry-id', 'entry-a', '--apply', '--json'], { cwd: project, encoding: 'utf8', env });
const dryJson = parseProcessJson('dry-run', dry);
const applyJson = parseProcessJson('apply', apply);
const queue = JSON.parse(fs.readFileSync(path.join(agentRoot, 'agent-patch-queue.json'), 'utf8'));
const report = { schema: 'sks.agent-rollback-command-check.v1', ok: dry.status === 0 && apply.status === 0 && applyJson.data?.ok === true, dryJson, applyJson, queue, restored: fs.readFileSync(file, 'utf8') };
writeReport('agent-rollback-command', report);

assertGate(dryJson.data?.dry_run === true, 'rollback command must support dry-run', report);
assertGate(applyJson.data?.apply === true, 'rollback command must support apply', report);
assertGate(applyJson.data?.restored_files?.includes('a.txt'), 'rollback command summary must show restored files', report);
assertGate(queue.entries?.[0]?.status === 'rolled_back', 'rollback apply must update patch queue status', report);
assertGate(report.restored === 'before\n', 'rollback apply must restore file content', report);
emitGate('agent:rollback-command', { restored_files: applyJson.data.restored_files.length });

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function parseProcessJson(label, result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const report = {
      schema: 'sks.agent-rollback-command-check.v1',
      ok: false,
      label,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      parse_error: error instanceof Error ? error.message : String(error)
    };
    writeReport('agent-rollback-command', report);
    assertGate(false, `rollback command ${label} must emit JSON`, report);
  }
}
