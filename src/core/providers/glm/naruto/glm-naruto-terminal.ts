import path from 'node:path';
import { ensureDir, writeJsonAtomic } from '../../../fsx.js';
import { writeFinalStopGate } from '../../../stop-gate/stop-gate-writer.js';
import type { SksStopGateEvidence } from '../../../stop-gate/stop-gate-types.js';
import type { GlmNarutoMissionResult } from './glm-naruto-types.js';

export async function finalizeGlmNarutoTerminal(input: {
  readonly root: string;
  readonly missionId: string;
  readonly result: GlmNarutoMissionResult;
  readonly artifactDir?: string;
  readonly evidence?: SksStopGateEvidence;
}): Promise<GlmNarutoMissionResult> {
  const artifactDir = input.artifactDir ?? path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId);
  await ensureDir(artifactDir);
  const termination = {
    schema: 'sks.glm-naruto-termination.v1',
    mission_id: input.missionId,
    terminal_state: input.result.status,
    reason: input.result.termination_reason,
    blockers: input.result.blockers
  };
  await writeJsonAtomic(path.join(artifactDir, 'mission-result.json'), input.result).catch(() => undefined);
  await writeJsonAtomic(path.join(artifactDir, 'termination.json'), termination).catch(() => undefined);

  const passed = input.result.ok;
  const evidence = input.evidence ?? {
    build_passed: passed,
    tests_passed: passed,
    route_evidence_passed: passed,
    per_worker_artifacts: input.result.workers_started > 0,
    verifier_wave_run: input.result.gate_passed_candidates > 0,
    model_guard_enforced: true,
    proof_required: false,
    proof_passed: true,
    reflection_required: false,
    reflection_passed: 'not_required'
  };
  await writeFinalStopGate({
    root: input.root,
    missionId: input.missionId,
    route: 'GLM_NARUTO',
    routeCommand: '$Naruto',
    status: passed ? 'passed' : 'blocked',
    terminal: input.result.status === 'completed' || input.result.status === 'blocked' || input.result.status === 'budget_exhausted',
    terminalState: input.result.status === 'budget_exhausted' || input.result.status === 'cancelled' ? 'blocked' : input.result.status,
    evidence,
    blockers: input.result.blockers,
    nativeGateFile: 'termination.json',
    nativeGatePatch: termination
  }).catch(() => undefined);

  return { ...input.result, artifact_dir: artifactDir };
}
