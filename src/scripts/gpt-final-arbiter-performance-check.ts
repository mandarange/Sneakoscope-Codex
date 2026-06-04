#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const compressor = await importDist('core/codex-control/gpt-final-context-compressor.js');

const local_outputs = Array.from({ length: 20 }, (_, index) => ({
  worker_id: `slot-${String(index + 1).padStart(3, '0')}/gen-1`,
  backend: 'local-llm',
  status: 'done',
  summary: `worker ${index + 1} summarized a bounded shard`,
  changed_files: [`src/example-${index + 1}.ts`],
  blockers: []
}));
const candidate_patch_envelopes = local_outputs.map((output, index) => ({
  id: `patch-${index + 1}`,
  agent_id: output.worker_id,
  source: 'model_authored',
  lease_id: `lease-${index + 1}`,
  rollback_hint: { ok: true },
  operations: [{ op: 'replace', path: output.changed_files[0], search: 'before', replace: 'after' }]
}));
const report = compressor.compressGptFinalContext({
  route: '$Naruto',
  mission_id: 'M-20-local-workers',
  local_mode: 'local-parallel-gpt-final',
  local_outputs,
  candidate_patch_envelopes,
  verification_results: [{ ok: true, status: 'passed' }],
  side_effect_report: { ok: true },
  mutation_ledger: { ok: true },
  rollback_plan: { ok: true }
});

assertGate(report.proof_pack.worker_count === 20, 'proof pack must include 20 worker summaries');
assertGate(report.proof_pack.token_budget_estimate < 8000, '20-worker proof pack must stay under token budget', report.proof_pack);
assertGate(report.latency_budget.ok === true, 'GPT final latency budget report must pass');

emitGate('local-collab:gpt-final-performance', { workers: report.proof_pack.worker_count, token_budget_estimate: report.proof_pack.token_budget_estimate });
