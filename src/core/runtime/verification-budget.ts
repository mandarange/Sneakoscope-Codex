import type { TaskProfile } from './task-profile.js'

export type VerificationBudget =
  | 'none'
  | 'single-check'
  | 'affected'
  | 'confidence'
  | 'release'

export function chooseVerificationBudget(input: {
  taskProfile: TaskProfile
  changedFiles: readonly string[]
  failedChecks?: readonly string[]
}): VerificationBudget {
  if (input.taskProfile === 'passthrough') return 'none'
  if (input.taskProfile === 'answer') return 'none'
  if (input.taskProfile === 'tiny-change') return 'single-check'
  if (input.taskProfile === 'high-risk') return 'confidence'
  return 'affected'
}
