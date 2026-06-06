import type { AgentPatchEnvelope } from '../agents/agent-patch-schema.js'
import type { GitWorktreeDiff } from './git-worktree-diff.js'

export function buildGitWorktreePatchEnvelope(input: {
  diff: GitWorktreeDiff
  agentId: string
  sessionId: string
  slotId: string
  generationIndex: number
}): AgentPatchEnvelope {
  const changedFiles = input.diff.changed_files.length ? input.diff.changed_files : ['git-worktree.diff']
  return {
    schema: 'sks.agent-patch-envelope.v1',
    source: 'git-worktree-diff',
    mission_id: input.diff.mission_id,
    route: '$Naruto',
    agent_id: input.agentId,
    session_id: input.sessionId,
    slot_id: input.slotId,
    generation_index: input.generationIndex,
    lease_id: `git-worktree:${input.diff.worker_id}`,
    allowed_paths: changedFiles,
    git_worktree: {
      main_repo_root: input.diff.main_repo_root,
      worktree_path: input.diff.worktree_path,
      branch: input.diff.branch,
      base_head: input.diff.base_head,
      worktree_head: input.diff.worktree_head,
      changed_files: changedFiles,
      diff_bytes: input.diff.diff_bytes
    },
    operations: [{
      op: 'git_apply_patch',
      path: '.',
      diff: input.diff.diff
    }],
    rationale: 'Process-generated patch envelope exported from an isolated Git worktree diff.',
    verification_hint: {
      command: 'git apply --3way --check <diff>',
      notes: 'Apply inside an integration worktree based on the recorded base head.'
    }
  }
}
