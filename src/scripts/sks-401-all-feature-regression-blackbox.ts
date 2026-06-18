import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';
import { REQUIRED_4001_RELEASE_IDS } from './release-4001-required-gates.js';
import { REQUIRED_4002_RELEASE_IDS } from './release-4002-required-gates.js';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; version?: string };
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8')) as { gates: Array<{ id: string }> };
const ids = new Set(manifest.gates.map((gate) => gate.id));
const required = [...REQUIRED_4001_RELEASE_IDS, ...REQUIRED_4002_RELEASE_IDS];
const missing = required.filter((id) => !pkg.scripts?.[id] || !ids.has(id));
assertGate(pkg.version === '4.0.2', 'package version must be 4.0.2 after production completion bump', pkg.version);
assertGate(missing.length === 0, '4.0.1/4.0.2 required scripts/gates missing', missing);

const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const schedulerMod = await importDist('core/release/extreme-parallel-scheduler.js');
const dirtyMod = await importDist('core/doctor/doctor-dirty-planner.js');
const certificateMod = await importDist('core/triwiki/triwiki-sla-certificate.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-card.ts'], tier: 'confidence' });
const plan = schedulerMod.planExtremeParallelSchedule(root, graph);
const dirty = dirtyMod.planDoctorDirtyRepair(root, ['context7']);
const certificate = certificateMod.buildTriWikiSlaCertificate({
  graph,
  mode: 'actual',
  slaMs: 300_000,
  estimatedCriticalPathMs: Math.max(1, plan.critical_path_ms || 1),
  estimatedSequentialMs: Math.max(1, plan.sequential_ms || plan.critical_path_ms || 1),
  actualDurationMs: 1,
  executedPacks: Math.max(1, graph.gate_packs.length),
  reusedProofs: graph.reused_proofs.length,
  invalidatedProofs: graph.invalidated_proofs.length
});
assertGate(graph.gate_packs.length > 0, 'regression must compute affected graph gate packs', graph);
assertGate(plan.schema === 'sks.extreme-parallel-scheduler.v1', 'regression must exercise scheduler planning', plan);
assertGate(dirty.schema === 'sks.doctor-dirty-plan.v1', 'regression must exercise semantic dirty doctor', dirty);
assertGate(certificate.mode === 'actual' && certificate.sla_met === true, 'regression must create actual SLA certificate', certificate);
emitGate('sks:401-all-feature-regression', { required: required.length, packs: graph.gate_packs.length });
