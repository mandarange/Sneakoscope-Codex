#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const proof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'agent-slot-pane-binding-proof.js')).href);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-slot-pane-binding-'));
const records = [1, 2, 3].map((index) => ({
  session_id: `slot-001-gen-${index}`,
  slot_id: 'slot-001',
  generation_index: index,
  pane_kind: 'worker_codex_sdk',
  zellij_pane_id: String(100 + index),
  zellij_pane_id_source: index % 2 ? 'zellij_worker_new_pane_stdout' : 'zellij_worker_list_panes',
  scaling_primitive: 'native_cli_process_in_zellij_worker_pane',
  sdk_thread_id: `sdk-thread-${index}`,
  sdk_run_id: `sdk-run-${index}`,
  stream_event_count: 4,
  structured_output_valid: true,
  status: 'closed'
}));
await fs.writeFile(path.join(tmp, 'agent-native-cli-session-swarm.json'), `${JSON.stringify({
  schema: 'sks.agent-native-cli-session-swarm.v1',
  ok: true,
  closed_worker_process_count: records.length,
  zellij_pane_worker_sessions: records.length,
  max_observed_worker_process_count: 1,
  target_active_slots: 1,
  records
}, null, 2)}\n`);
await fs.writeFile(path.join(tmp, 'agent-zellij-pane-launch-ledger.jsonl'), records.map((record) => JSON.stringify({
  schema: 'sks.agent-zellij-pane-launch.v1',
  pane_kind: 'worker_codex_sdk',
  persistent_slot_lane: false,
  scaling_primitive: 'native_cli_process_in_zellij_worker_pane',
  slot_id: record.slot_id,
  generation_index: record.generation_index,
  pane_id: record.zellij_pane_id,
  pane_id_source: record.zellij_pane_id_source,
  sdk_thread_id: record.sdk_thread_id,
  sdk_run_id: record.sdk_run_id,
  stream_event_count: record.stream_event_count,
  structured_output_valid: record.structured_output_valid
})).join('\n') + '\n');
const report = await proof.writeAgentSlotPaneBindingProof(tmp, { requireZellij: true, reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-slot-pane-binding-proof.json') });
const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-slot-pane-binding-bad-'));
await fs.writeFile(path.join(badRoot, 'agent-native-cli-session-swarm.json'), `${JSON.stringify({
  closed_worker_process_count: 1,
  zellij_pane_worker_sessions: 1,
  records: [{ ...records[0], zellij_pane_id_source: 'synthetic_layout_pending_proof' }]
})}\n`);
await fs.writeFile(path.join(badRoot, 'agent-zellij-pane-launch-ledger.jsonl'), '');
const bad = await proof.evaluateAgentSlotPaneBindingProof(badRoot, { requireZellij: true });
const ok = report.ok && report.sdk_thread_count === records.length && bad.ok === false && bad.blockers.includes('slot_pane_binding_synthetic_or_missing_pane_id_source');
emit({ schema: 'sks.agent-slot-pane-binding-proof-check.v1', ok, report, bad, blockers: ok ? [] : ['agent_slot_pane_binding_proof_check_failed'] });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-slot-pane-binding-proof-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
