import path from 'node:path';

export function loopRoot(root: string, missionId: string): string {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'loops');
}

export function loopNodeRoot(root: string, missionId: string, loopId: string): string {
  return path.join(loopRoot(root, missionId), loopId);
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

export function loopGraphProofPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-graph-proof.json');
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
