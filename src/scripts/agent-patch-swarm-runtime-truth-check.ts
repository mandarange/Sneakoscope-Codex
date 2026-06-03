#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';
import { readJson, runPatchSwarmRouteBlackbox, writeReport } from './agent-patch-swarm-gate-lib.js';

const routeReport = await runPatchSwarmRouteBlackbox({
  gate: 'agent:patch-swarm-runtime-truth:route',
  route: '$Agent',
  routeCommand: 'sks agent run',
  reportName: 'agent-patch-swarm-runtime-truth-route'
});
const ledgerRoot = path.join(routeReport.fixture_root, routeReport.result.ledger_root);
const queue = readJson(path.join(ledgerRoot, 'agent-patch-queue.json'));
const events = fs.readFileSync(path.join(ledgerRoot, 'agent-patch-queue-events.jsonl'), 'utf8').trim().split(/\n+/).filter(Boolean).map(JSON.parse);
const merge = readJson(path.join(ledgerRoot, 'agent-merge-coordinator-report.json'));
const apply = readJson(path.join(ledgerRoot, 'agent-patch-apply-results.json'));
const verification = readJson(path.join(ledgerRoot, 'agent-patch-verification-results.json'));
const rollback = readJson(path.join(ledgerRoot, 'agent-patch-rollback-proof.json'));
const proof = readJson(path.join(ledgerRoot, 'agent-patch-proof.json'));
const runtime = readJson(path.join(ledgerRoot, 'agent-patch-swarm-runtime.json'));
const journal = readJson(path.join(ledgerRoot, 'agent-patch-transaction-journal-summary.json'));
const strategyGateExists = fs.existsSync(path.join(ledgerRoot, 'strategy-gate.json')) || routeReport.result.strategy_gate;
const strategyCompilerExists = fs.existsSync(path.join(ledgerRoot, 'strategy-compiler.json')) || routeReport.result.strategy_gate;
const eventTypes = new Set(events.map((event) => event.event_type || event.status));
const owners = new Map();
for (const row of queue.ownership_ledger || []) {
  for (const file of row.write_paths || []) {
    if (!owners.has(file)) owners.set(file, []);
    owners.get(file).push(row.agent_id);
  }
}
const duplicateWriteOwners = [...owners.entries()].filter(([, rows]) => new Set(rows).size > 1).map(([file, rows]) => ({ file, owners: rows }));
const report = {
  schema: 'sks.agent-patch-swarm-runtime-truth-check.v1',
  ok: true,
  policy_only: false,
  fixture_root: routeReport.fixture_root,
  mission_id: routeReport.result.mission_id,
  queue,
  merge,
  runtime,
  proof,
  journal,
  changed_files: [...new Set((apply.results || []).flatMap((row) => row.changed_files || []))],
  event_types: [...eventTypes],
  duplicate_write_owners: duplicateWriteOwners,
  strategy_gate_exists: Boolean(strategyGateExists),
  strategy_compiler_exists: Boolean(strategyCompilerExists),
  verification_ok: verification.ok === true,
  rollback_ok: rollback.ok === true,
  patch_proof_ok: proof.ok === true,
  final_agent_proof_ok: routeReport.result.proof?.ok === true
};
report.ok = report.policy_only === false
  && report.strategy_gate_exists
  && report.strategy_compiler_exists
  && queue.entries.length >= 10
  && ['enqueue', 'applying', 'applied', 'verified'].every((kind) => eventTypes.has(kind))
  && merge.parallel_apply_groups?.[0]?.entry_ids?.length >= 5
  && report.changed_files.length >= 5
  && duplicateWriteOwners.length === 0
  && verification.ok === true
  && rollback.ok === true
  && proof.ok === true
  && journal.ok === true
  && routeReport.result.proof?.ok === true;
writeReport('agent-patch-swarm-runtime-truth', report);

assertGate(report.ok === true, 'patch swarm runtime truth umbrella gate failed', report);
assertGate(report.policy_only === false, 'patch swarm runtime truth must not be policy-only', report);
assertGate(queue.entries.length >= 10, 'truth gate must enqueue at least 10 patch entries', report);
assertGate(['enqueue', 'applying', 'applied', 'verified'].every((kind) => eventTypes.has(kind)), 'truth gate must record queue lifecycle events', report);
assertGate(journal.ok === true, 'truth gate must include transaction journal proof', report);
emitGate('agent:patch-swarm-runtime-truth', { mission_id: report.mission_id, changed_files: report.changed_files.length });
