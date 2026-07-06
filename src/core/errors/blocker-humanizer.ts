import { diagnosticForBlocker } from './next-action-map.js'

export interface HumanizedBlockers {
  human_summary: string
  next_actions: string[]
  evidence_paths: string[]
}

export function humanizeBlockers(blockers: string[] = [], evidencePaths: string[] = []): HumanizedBlockers {
  const uniqueBlockers = [...new Set(blockers.filter(Boolean))]
  const diagnostics = uniqueBlockers.map((blocker) => diagnosticForBlocker(blocker))
  return {
    human_summary: diagnostics.length
      ? diagnostics.map((diagnostic) => diagnostic.human_summary).join(' ')
      : 'No blockers were recorded.',
    next_actions: [...new Set(diagnostics.flatMap((diagnostic) => diagnostic.next_actions))],
    evidence_paths: [...new Set(evidencePaths.filter(Boolean))]
  }
}

