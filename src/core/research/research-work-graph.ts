import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import type { NarutoWorkGraph, NarutoWorkItem, NarutoWorkKind } from '../naruto/naruto-work-item.js'

export const RESEARCH_WORK_GRAPH_ARTIFACT = 'research-work-graph.json'

const STAGES: Array<{ id: string, title: string, kind: NarutoWorkKind, outputs: string[] }> = [
  { id: 'research_source_quality', title: 'Source quality and layered retrieval audit', kind: 'research', outputs: ['source-ledger.json', 'source-quality-report.json'] },
  { id: 'research_claim_matrix', title: 'Claim-evidence matrix and citation coverage', kind: 'research', outputs: ['claim-evidence-matrix.json'] },
  { id: 'research_falsification', title: 'Counterevidence and falsification strengthening', kind: 'research', outputs: ['falsification-ledger.json'] },
  { id: 'research_synthesis_report', title: 'Research report and manuscript synthesis', kind: 'research', outputs: ['research-report.md'] },
  { id: 'research_blueprint', title: 'Implementation blueprint and handoff', kind: 'documentation', outputs: ['implementation-blueprint.json', 'implementation-blueprint.md', 'team-handoff-goal.md'] },
  { id: 'research_experiment', title: 'Experiment plan and replication pack', kind: 'verification', outputs: ['experiment-plan.json', 'replication-pack.json'] },
  { id: 'research_final_review', title: 'Final reviewer quality audit', kind: 'verification', outputs: ['research-final-review.json'] },
  { id: 'research_gate_close', title: 'Research gate evaluation and completion output', kind: 'final_review_input_pack', outputs: ['research-gate.evaluated.json', 'research-gate.json'] }
]

function workItem(stage: { id: string, title: string, kind: NarutoWorkKind, outputs: string[] }, index: number, plan: any = null): NarutoWorkItem {
  const missionPrefix = plan?.mission_id ? `.sneakoscope/missions/${plan.mission_id}/` : ''
  return {
    id: stage.id,
    kind: stage.kind,
    title: stage.title,
    target_paths: stage.outputs.map((artifact) => `${missionPrefix}${artifact}`),
    readonly_paths: [
      `${missionPrefix}research-plan.json`,
      `${missionPrefix}research-quality-contract.json`,
      `${missionPrefix}source-ledger.json`,
      `${missionPrefix}claim-evidence-matrix.json`
    ],
    write_paths: [],
    required_role: index < 4 ? 'research' : 'verifier',
    write_allowed: false,
    verification_required: true,
    dependencies: index === 0 ? [] : [STAGES[index - 1]?.id].filter(Boolean) as string[],
    can_run_in_parallel_with: STAGES.filter((candidate) => candidate.id !== stage.id).map((candidate) => candidate.id),
    conflicts_with: [],
    estimated_cost: { tokens: 4000, latency_ms: 60000, cpu_weight: 1, memory_mb: 256, gpu_weight: 0 },
    lease_requirements: stage.outputs.map((artifact) => ({ path: `${missionPrefix}${artifact}`, kind: 'read' })),
    acceptance: { requires_patch_envelope: false, requires_verification: true, requires_gpt_final: false },
    owner: null,
    allocation_reason: 'Stage-aware read-only research pipeline work graph',
    allocation_score: 1,
    allocation_hints: { domains: [stage.kind], write_paths: [], read_only_paths: stage.outputs } as any,
    lane: null,
    worktree: { mode: 'patch-envelope-only', required: false, allocation_required: false }
  }
}

export function buildResearchWorkGraph(plan: any = null): NarutoWorkGraph {
  const requestedClones = Math.max(8, Number(plan?.native_agent_plan?.session_count || 0))
  const workItems = STAGES.map((stage, index) => workItem(stage, index, plan))
  return {
    schema: 'sks.naruto-work-graph.v1',
    route: '$Naruto',
    requested_clones: requestedClones,
    total_work_items: workItems.length,
    readonly: true,
    write_capable: false,
    work_items: workItems,
    active_waves: [
      { wave_id: 'research-quality-wave', work_item_ids: workItems.slice(0, 4).map((item) => item.id), write_paths: [], conflict_count: 0 },
      { wave_id: 'research-closeout-wave', work_item_ids: workItems.slice(4).map((item) => item.id), write_paths: [], conflict_count: 0 }
    ],
    mixed_work_kinds: [...new Set(workItems.map((item) => item.kind))],
    write_allowed_count: 0,
    worktree_policy: { mode: 'patch-envelope-only', required: false, main_repo_root: null, worktree_root: null, fallback_reason: 'Research route is read-only.' },
    blockers: [],
    ok: true
  }
}

export async function writeResearchWorkGraph(dir: string, plan: any = null) {
  const graph = buildResearchWorkGraph(plan)
  await writeJsonAtomic(path.join(dir, RESEARCH_WORK_GRAPH_ARTIFACT), {
    ...graph,
    generated_at: nowIso()
  })
  return graph
}
