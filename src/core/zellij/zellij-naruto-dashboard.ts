import type { NarutoWorktreePolicy } from '../naruto/naruto-work-item.js'

export interface NarutoZellijDashboardPlan {
  schema: 'sks.zellij-naruto-dashboard.v1'
  target_active_workers: number
  visible_pane_cap: number
  visible_worker_panes: number
  headless_workers: number
  dashboard: {
    active: number
    visible: number
    headless: number
    completed: number
    failed: number
    backpressure: string
  }
  pane_titles: string[]
  worktree_mode: NarutoWorktreePolicy['mode']
  worktree_labels: string[]
  ok: boolean
  blockers: string[]
}

export function planNarutoZellijDashboard(input: {
  targetActiveWorkers: number
  visiblePaneCap?: number
  completed?: number
  failed?: number
  backpressure?: string
  roles?: string[]
  backend?: string
  worktreePolicy?: NarutoWorktreePolicy
}): NarutoZellijDashboardPlan {
  const targetActiveWorkers = Math.max(1, Math.floor(Number(input.targetActiveWorkers || 1)))
  const visiblePaneCap = Math.max(1, Math.floor(Number(input.visiblePaneCap || 12)))
  const visibleWorkerPanes = Math.min(targetActiveWorkers, visiblePaneCap)
  const headlessWorkers = Math.max(0, targetActiveWorkers - visibleWorkerPanes)
  const backend = input.backend || 'codex-sdk'
  const worktreeMode = input.worktreePolicy?.mode || 'patch-envelope-only'
  const roles = input.roles && input.roles.length ? input.roles : ['implementer', 'modifier', 'verifier', 'test_writer']
  const worktreeLabels: string[] = []
  const paneTitles = Array.from({ length: visibleWorkerPanes }, (_, index) => {
    const slot = `slot-${String(index + 1).padStart(3, '0')}`
    const role = roles[index % roles.length] || 'worker'
    if (worktreeMode !== 'git-worktree') return `${slot}/gen-1 · ${role} · ${backend} · active`
    const wt = `WT:${slot}-gen-1`
    const branch = `branch:${slot}/gen-1`
    worktreeLabels.push(`${wt} ${branch}`)
    return `${slot}/gen-1 · ${wt} · ${branch} · ${role} · ${backend} · active`
  })
  const blockers = [
    ...(visibleWorkerPanes > visiblePaneCap ? ['naruto_zellij_visible_panes_exceed_cap'] : []),
    ...(headlessWorkers < 0 ? ['naruto_zellij_headless_negative'] : [])
  ]
  return {
    schema: 'sks.zellij-naruto-dashboard.v1',
    target_active_workers: targetActiveWorkers,
    visible_pane_cap: visiblePaneCap,
    visible_worker_panes: visibleWorkerPanes,
    headless_workers: headlessWorkers,
    dashboard: {
      active: targetActiveWorkers,
      visible: visibleWorkerPanes,
      headless: headlessWorkers,
      completed: Math.max(0, Math.floor(Number(input.completed || 0))),
      failed: Math.max(0, Math.floor(Number(input.failed || 0))),
      backpressure: input.backpressure || 'normal'
    },
    pane_titles: paneTitles,
    worktree_mode: worktreeMode,
    worktree_labels: worktreeLabels,
    ok: blockers.length === 0,
    blockers
  }
}
