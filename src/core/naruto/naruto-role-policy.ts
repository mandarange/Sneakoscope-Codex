import type { NarutoWorkKind } from './naruto-work-item.js'

export type NarutoWorkerRole =
  | 'implementer'
  | 'modifier'
  | 'test_writer'
  | 'verifier'
  | 'researcher'
  | 'conflict_resolver'
  | 'rollback_planner'
  | 'integrator'
  | 'gpt_final_arbiter'

export function mapWorkKindToNarutoRole(kind: NarutoWorkKind): NarutoWorkerRole {
  switch (kind) {
    case 'bugfix':
    case 'feature':
    case 'implementation':
      return 'implementer'
    case 'code_modification':
    case 'refactor':
    case 'patch_rebase':
      return 'modifier'
    case 'test_generation':
      return 'test_writer'
    case 'test_execution':
    case 'verification':
    case 'ux_review':
    case 'ppt_review':
    case 'image_review':
      return 'verifier'
    case 'research':
      return 'researcher'
    case 'documentation':
    case 'chore':
      return 'modifier'
    case 'conflict_resolution':
      return 'conflict_resolver'
    case 'rollback_preparation':
      return 'rollback_planner'
    case 'integration_support':
      return 'integrator'
    case 'final_review_input_pack':
      return 'gpt_final_arbiter'
  }
}

