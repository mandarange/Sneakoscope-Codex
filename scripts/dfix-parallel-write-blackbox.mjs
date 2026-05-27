#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const applyMod = await importDist('core/agents/agent-patch-apply-worker.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-dfix-patch-'));
fs.writeFileSync(path.join(tmp, 'copy.txt'), 'old label\n');
const envelope = { schema: 'sks.agent-patch-envelope.v1', agent_id: 'dfix-fast-lane', operations: [{ op: 'replace', path: 'copy.txt', search: 'old label', replace: 'new label' }] };
const applied = await applyMod.applyAgentPatchEnvelope(tmp, envelope);
const dfixFile = path.join(tmp, 'dfix-route.txt');
fs.writeFileSync(dfixFile, 'old label\n');
const diagnose = spawnSync(process.execPath, ['dist/bin/sks.js', 'dfix', 'diagnose', 'dfix parallel write route fixture', '--file', dfixFile, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
const diagnoseJson = parseJson(diagnose.stdout);
const plan = diagnoseJson?.mission_id
  ? spawnSync(process.execPath, ['dist/bin/sks.js', 'dfix', 'plan', diagnoseJson.mission_id, '--file', dfixFile, '--write-mode', 'parallel', '--apply-patches', '--dry-run-patches', '--max-write-agents', '1', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  : { status: 1, stdout: '', stderr: 'diagnose mission missing' };
const planJson = parseJson(plan.stdout);
const routePolicy = planJson?.patch_plan?.route_parallel_write || null;
const report = { schema: 'sks.dfix-parallel-write-blackbox.v1', ok: applied.ok && diagnose.status === 0 && plan.status === 0 && routePolicy?.route_level_flags_wired === true, applied, route_command: { diagnose_status: diagnose.status, plan_status: plan.status, mission_id: diagnoseJson?.mission_id || null, route_policy: routePolicy, stderr_tail: `${diagnose.stderr || ''}${plan.stderr || ''}`.slice(-2000) } };
const out = path.join(root, '.sneakoscope', 'reports', 'dfix-parallel-write-blackbox.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(applied.ok === true, 'DFix parallel write blackbox patch failed', report);
assertGate(fs.readFileSync(path.join(tmp, 'copy.txt'), 'utf8') === 'new label\n', 'DFix parallel write blackbox content mismatch', report);
assertGate(routePolicy?.write_mode === 'parallel', 'DFix route must record --write-mode parallel', report);
assertGate(routePolicy?.apply_patches === true, 'DFix route must record --apply-patches', report);
assertGate(routePolicy?.dry_run_patches === true, 'DFix route must record --dry-run-patches', report);
emitGate('dfix:parallel-write-blackbox', { changed_files: applied.changed_files.length });

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
