import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { hunksOverlap, parseUnifiedDiffHunks } from './glm-naruto-hunk-parser.js';

export function envelopesHaveHunkConflict(left: GlmNarutoPatchEnvelope, right: GlmNarutoPatchEnvelope): boolean {
  const leftHunks = parseUnifiedDiffHunks(left.patch);
  const rightHunks = parseUnifiedDiffHunks(right.patch);
  if (leftHunks.length === 0 || rightHunks.length === 0) return sharesPath(left, right);
  return leftHunks.some((leftHunk) => rightHunks.some((rightHunk) => hunksOverlap(leftHunk, rightHunk)));
}

export function envelopesShareFileButNotHunk(left: GlmNarutoPatchEnvelope, right: GlmNarutoPatchEnvelope): boolean {
  return sharesPath(left, right) && !envelopesHaveHunkConflict(left, right);
}

function sharesPath(left: GlmNarutoPatchEnvelope, right: GlmNarutoPatchEnvelope): boolean {
  const rightPaths = new Set(right.target_paths);
  return left.target_paths.some((file) => rightPaths.has(file));
}
