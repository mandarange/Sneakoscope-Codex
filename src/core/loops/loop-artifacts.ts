import path from 'node:path';

// Path helpers for the loop artifacts that the retired SKS Loop runtime wrote under
// `.sneakoscope/missions/<mission>/loops/`. Only the two files that are still read for
// old missions (the plan and the graph proof) keep a helper.

function loopRoot(root: string, missionId: string): string {
  const missionsRoot = path.resolve(root, '.sneakoscope', 'missions');
  return containedJoin(missionsRoot, safeArtifactId('mission', missionId), 'loops');
}

export function loopPlanPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-plan.json');
}

export function loopGraphProofPath(root: string, missionId: string): string {
  return path.join(loopRoot(root, missionId), 'loop-graph-proof.json');
}

function sanitizeArtifactPart(value: string): string {
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
