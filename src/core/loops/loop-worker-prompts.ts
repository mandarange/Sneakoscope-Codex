import type { SksLoopNode, SksLoopPlan } from './loop-schema.js';
import { allGateIds } from './loop-schema.js';

export function buildLoopMakerPrompt(input: {
  plan: SksLoopPlan;
  node: SksLoopNode;
  worktreePath?: string | null;
}): string {
  const node = input.node;
  return [
    'You are the maker worker for an SKS Loop Mesh L2 action loop.',
    `Mission: ${input.plan.mission_id}`,
    `Loop: ${node.loop_id}`,
    `Purpose: ${node.purpose}`,
    `Owner files: ${node.owner_scope.files.join(', ') || '-'}`,
    `Owner directories: ${node.owner_scope.directories.join(', ') || '-'}`,
    `Allowed mutation scope: ${ownerScopeText(node)}`,
    'Do not mutate outside the owner scope.',
    `Selected local gates: ${allGateIds(node.gates).join(', ') || '-'}`,
    `Budget: ${JSON.stringify(node.budget)}`,
    `Worktree path: ${input.worktreePath || '-'}`,
    'Write a patch candidate/runtime proof artifact with changed files and blockers.',
    'No synthetic pass is allowed for production proof.'
  ].join('\n');
}

export function buildLoopCheckerPrompt(input: {
  plan: SksLoopPlan;
  node: SksLoopNode;
  makerArtifacts: string[];
  diffSummary?: string | null;
}): string {
  const node = input.node;
  return [
    'You are the checker worker for an SKS Loop Mesh action loop.',
    'You must run in a fresh session and must not mutate source files.',
    `Mission: ${input.plan.mission_id}`,
    `Loop: ${node.loop_id}`,
    `Purpose: ${node.purpose}`,
    `Maker artifacts: ${input.makerArtifacts.join(', ') || '-'}`,
    `Diff/patch summary: ${input.diffSummary || '-'}`,
    `Selected gates: ${allGateIds(node.gates).join(', ') || '-'}`,
    `Risk: ${node.risk.level} (${node.risk.reasons.join(', ') || '-'})`,
    'Reject unrequested side effects and owner-scope violations.',
    'Write checker-findings.json with fresh_session, reviewed_maker_artifacts, side_effects_detected, and approved.',
    'No synthetic pass is allowed for production proof.'
  ].join('\n');
}

function ownerScopeText(node: SksLoopNode): string {
  return [
    ...node.owner_scope.files.map((file) => `file:${file}`),
    ...node.owner_scope.directories.map((dir) => `dir:${dir}`)
  ].join(', ') || 'none';
}
