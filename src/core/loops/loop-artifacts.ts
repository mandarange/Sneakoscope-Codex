import path from 'node:path';

export function loopRoot(root: string, missionId: string): string {
  const missionsRoot = path.resolve(root, '.sneakoscope', 'missions');
  return containedJoin(missionsRoot, safeArtifactId('mission', missionId), 'loops');
}

export function loopNodeRoot(root: string, missionId: string, loopId: string): string {
  return containedJoin(loopRoot(root, missionId), safeArtifactId('loop', loopId));
}

export function loopPlanPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-plan.json');
}

export function loopStatePath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'loop-state.json');
}

export function loopRunLogPath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'loop-run-log.jsonl');
}

export function loopProofPath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'loop-proof.json');
}

export function loopBudgetPath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'loop-budget.json');
}

export function loopCheckpointPath(root: string, missionId: string, loopId: string, iteration: number, phase: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'checkpoints', `${String(Math.max(1, Math.floor(iteration))).padStart(4, '0')}-${sanitizeArtifactPart(phase)}.json`);
}

export function loopLatestCheckpointPath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'checkpoint-latest.json');
}

export function loopGraphProofPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-graph-proof.json');
}

export function loopIntegrationMergePath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'integration-merge.json');
}

export function loopGptFinalArbiterPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-gpt-final-arbiter.json');
}

export function loopKillRequestPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'kill-request.json');
}

export function loopGatePath(root: string, missionId: string, loopId: string, gateId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'gates', `${sanitizeArtifactPart(gateId)}.json`);
}

export function loopPatchPath(root: string, missionId: string, loopId: string, name: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'patches', `${sanitizeArtifactPart(name)}.json`);
}

export function loopHandoffPath(root: string, missionId: string, loopId: string): string {
  return path.join(loopNodeRoot(root, missionId, loopId), 'handoff.md');
}

export function loopOwnerLedgerPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-owner-ledger.json');
}

export function sanitizeArtifactPart(value: string): string {
  return String(value || 'artifact').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'artifact';
}

function safeArtifactId(kind: string, value: string): string {
  const text = String(value || '').trim();
  const sanitized = sanitizeArtifactPart(text);
  if (!text || sanitized !== text) throw new Error(`invalid_loop_${kind}_id:${text || 'empty'}`);
  return sanitized;
}

function containedJoin(base: string, ...parts: string[]): string {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...parts);
  if (target !== resolvedBase && !target.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`loop_artifact_path_escape:${target}`);
  }
  return target;
}
