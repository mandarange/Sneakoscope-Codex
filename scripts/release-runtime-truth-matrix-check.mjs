#!/usr/bin/env node
import { assertGate, emitGate, importDist, root, readJson } from './sks-1-18-gate-lib.mjs';

const releaseVersion = readJson('package.json').version;
const mod = await importDist('core/proof/runtime-truth-matrix.js');
const matrix = await mod.buildRuntimeTruthMatrix({ root, releaseVersion });
await mod.writeRuntimeTruthMatrix(root, matrix);

const requiredRows = [
  'tmux_physical',
  'codex_dynamic',
  'cleanup',
  'intelligent_work_graph',
  'source_intelligence',
  'goal_mode',
  'route_blackbox',
  'dynamic_scheduler',
  'warp_mad_lanes',
  'codex_0_134',
  'mcp_0_134',
  'parallel_write',
  'patch_proof',
  'cleanup_v4',
  'ast_type_work_graph',
  'warp_mad_right_lanes'
];
assertGate(matrix.schema === 'sks.runtime-truth-matrix.v1', 'runtime truth matrix schema mismatch', matrix);
for (const subsystem of requiredRows) {
  const row = matrix.rows.find((item) => item.subsystem === subsystem);
  assertGate(Boolean(row), `runtime truth matrix missing subsystem ${subsystem}`, matrix);
  assertGate(typeof row.proof_level === 'string', `runtime truth row missing proof level: ${subsystem}`, row);
  assertGate(Array.isArray(row.evidence_artifacts), `runtime truth row missing evidence artifacts: ${subsystem}`, row);
  assertGate(Array.isArray(row.blockers), `runtime truth row missing blockers: ${subsystem}`, row);
  assertGate(typeof row.next_action === 'string', `runtime truth row missing next action: ${subsystem}`, row);
  assertGate(typeof row.required_mode === 'boolean', `runtime truth row missing required mode: ${subsystem}`, row);
}
for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
  assertGate(['closed', 'blocked', 'not_applicable_with_proof'].includes(matrix.priorities[priority]?.status), `runtime truth matrix missing ${priority}`, matrix);
}
assertGate(matrix.ok === true, 'runtime truth matrix has required blockers', matrix);
emitGate('release:runtime-truth-matrix', { subsystems: matrix.rows.length, version: releaseVersion });
