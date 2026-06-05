import { allocateWorkerWorktree, type GitWorkerWorktreeAllocation } from './git-worktree-manager.js'

export async function createGitIntegrationWorktree(input: {
  repoRoot: string
  missionId: string
  baseRef?: string
}): Promise<GitWorkerWorktreeAllocation> {
  const allocationInput: Parameters<typeof allocateWorkerWorktree>[0] = {
    repoRoot: input.repoRoot,
    missionId: input.missionId,
    workerId: 'integration',
    slotId: 'integration',
    generationIndex: 1,
    branchPrefix: 'sks-integration'
  }
  if (input.baseRef !== undefined) allocationInput.baseRef = input.baseRef
  return allocateWorkerWorktree(allocationInput)
}
