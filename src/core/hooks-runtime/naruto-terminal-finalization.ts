import path from 'node:path';
import { nowIso, readJson, readText, sha256 } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import { updateCurrentIfMissionAndRun } from '../mission.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { validateRouteCompletionProof } from '../proof/route-proof-gate.js';
import {
  officialSubagentPreparationInProgress,
  withOfficialSubagentLifecycleLock
} from '../subagents/official-subagent-preparation.js';
import {
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME
} from '../subagents/subagent-evidence.js';
import { closeWorkOrderLedgerForRouteResult } from '../work-order-ledger.js';

export async function finalizeNarutoTerminalProof(
  root: any,
  state: any,
  sessionKey: any,
  dir: string,
  terminal: any
) {
  // Lock order is finalization -> lifecycle -> session state. Preparation starts
  // at lifecycle -> session state and never acquires the finalization lock.
  await withFileLock({
    lockPath: path.join(dir, '.naruto-finalize.lock'),
    timeoutMs: 5_000,
    staleMs: 30_000
  }, () => withOfficialSubagentLifecycleLock(dir, async () => {
    if (await officialSubagentPreparationInProgress(dir)) return;
    const [currentPlan, currentGate] = await Promise.all([
      readJson(path.join(dir, 'subagent-plan.json'), null).catch(() => null),
      readJson(path.join(dir, 'naruto-gate.json'), null).catch(() => null)
    ]);
    if (String(currentPlan?.workflow_run_id || '').trim() !== terminal.workflowRunId
      || String(currentGate?.workflow_run_id || '').trim() !== terminal.workflowRunId
      || currentGate?.passed !== true
      || currentGate?.terminal !== true) return;
    let proofStatus = await currentNarutoProofStatus(root, terminal.missionId, terminal.workflowRunId, state);
    if (!proofStatus.valid) {
      const finalized: any = await maybeFinalizeRoute(root, {
        missionId: terminal.missionId,
        route: '$Naruto',
        gateFile: 'naruto-gate.json',
        gate: currentGate,
        artifacts: [
          { path: 'subagent-plan.json', kind: 'agent', source: 'real', ignoreStale: true },
          { path: 'subagent-events.jsonl', kind: 'agent', source: 'real', ignoreStale: true },
          { path: SUBAGENT_PARENT_SUMMARY_FILENAME, kind: 'agent', source: 'real', ignoreStale: true },
          { path: SUBAGENT_EVIDENCE_FILENAME, kind: 'agent', source: 'real', ignoreStale: true },
          { path: 'naruto-summary.json', kind: 'agent', source: 'real', ignoreStale: true },
          { path: 'naruto-gate.json', kind: 'agent', source: 'real', ignoreStale: true }
        ],
        claims: [{ id: 'naruto-official-subagent-completion', status: 'supported', evidence: 'naruto-gate.json' }],
        agents: true
      });
      if (finalized?.ok !== true) {
        throw new Error(`naruto_terminal_proof_finalize_failed:${String(finalized?.validation?.issues?.join(',') || finalized?.status || 'unknown')}`);
      }
      proofStatus = await currentNarutoProofStatus(root, terminal.missionId, terminal.workflowRunId, state);
    }
    if (!proofStatus.valid) throw new Error('naruto_terminal_proof_invalid_after_finalize');
    await closeWorkOrderLedgerForRouteResult(dir, { ok: true });
    await invalidateReflectionForNarutoProofOnce(
      root,
      state,
      sessionKey,
      terminal.workflowRunId,
      proofStatus.digest
    );
  }));
}

async function currentNarutoProofStatus(root: any, missionId: string, workflowRunId: string, state: any) {
  const validation = await validateRouteCompletionProof(root, {
    missionId,
    route: '$Naruto',
    state: {
      ...state,
      mission_id: missionId,
      subagents_required: true,
      official_subagent_run_id: workflowRunId
    }
  }).catch(() => null);
  const proofRunId = String(validation?.proof?.evidence?.route_gate?.workflow_run_id || '').trim();
  const proofText = await readText(
    path.join(root, '.sneakoscope', 'missions', missionId, 'completion-proof.json'),
    ''
  ).catch(() => '');
  return {
    valid: validation?.ok === true && proofRunId === workflowRunId,
    proof: validation?.proof || null,
    digest: proofText ? `sha256:${sha256(proofText)}` : null
  };
}

async function invalidateReflectionForNarutoProofOnce(
  root: any,
  state: any,
  sessionKey: any,
  workflowRunId: string,
  proofDigest: string | null
) {
  if (!workflowRunId || !proofDigest) return;
  const resolvedSessionKey = sessionKey || state?._session_key;
  await updateCurrentIfMissionAndRun(root, state?.mission_id, workflowRunId, (current: any) => {
    if (current?.reflection_invalidated_for_workflow_run_id === workflowRunId
      && current?.reflection_invalidated_for_proof_digest === proofDigest) return null;
    return {
      reflection_invalidation_required: true,
      reflection_invalidated_at: nowIso(),
      reflection_invalidation_reason: 'naruto_terminal_proof_committed',
      reflection_invalidated_for_workflow_run_id: workflowRunId,
      reflection_invalidated_for_proof_digest: proofDigest
    };
  }, { sessionKey: resolvedSessionKey });
}
