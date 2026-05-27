import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import type { ProofLevel } from './fake-real-proof-policy.js'

export const RUNTIME_TRUTH_MATRIX_SCHEMA = 'sks.runtime-truth-matrix.v1'
export const RUNTIME_TRUTH_SUBSYSTEMS = [
  'tmux_physical',
  'codex_dynamic',
  'cleanup',
  'intelligent_work_graph',
  'source_intelligence',
  'goal_mode',
  'route_blackbox',
  'dynamic_scheduler',
  'warp_mad_lanes'
] as const

export type RuntimeTruthSubsystem = typeof RUNTIME_TRUTH_SUBSYSTEMS[number]

export interface RuntimeTruthRow {
  subsystem: RuntimeTruthSubsystem
  proof_level: ProofLevel
  evidence_artifacts: string[]
  blockers: string[]
  next_action: string
  required_mode: boolean
}

export interface RuntimeTruthMatrix {
  schema: typeof RUNTIME_TRUTH_MATRIX_SCHEMA
  release_version: string
  generated_at: string
  ok: boolean
  proof_levels: ProofLevel[]
  rows: RuntimeTruthRow[]
  subsystems: RuntimeTruthRow[]
  priorities: Record<string, { status: 'closed' | 'blocked' | 'not_applicable_with_proof'; evidence: string[]; blockers: string[] }>
  blockers: string[]
}

export async function buildRuntimeTruthMatrix(input: {
  root?: string
  releaseVersion: string
  agentRoot?: string
  required?: Partial<Record<RuntimeTruthSubsystem, boolean>>
  reports?: Record<string, any>
}): Promise<RuntimeTruthMatrix> {
  const root = path.resolve(input.root || process.cwd())
  const reportDir = path.join(root, '.sneakoscope', 'reports')
  const agentRoot = input.agentRoot ? path.resolve(input.agentRoot) : ''
  const readReport = async (name: string, fallbackNames: string[] = []) => {
    if (input.reports?.[name]) return input.reports[name]
    for (const candidate of [name, ...fallbackNames]) {
      const value = await readJson<any>(path.join(reportDir, candidate), null)
      if (value) return value
      if (agentRoot) {
        const agentValue = await readJson<any>(path.join(agentRoot, candidate), null)
        if (agentValue) return agentValue
      }
    }
    return null
  }
  const required = {
    tmux_physical: process.env.SKS_REQUIRE_REAL_TMUX === '1',
    codex_dynamic: process.env.SKS_REQUIRE_REAL_DYNAMIC_AGENTS === '1',
    warp_mad_lanes: process.env.SKS_REQUIRE_WARP_MAD_LANES === '1',
    ...(input.required || {})
  } as Partial<Record<RuntimeTruthSubsystem, boolean>>
  const [tmux, codex, cleanup, workGraph, fakeReal, sourceIntel, goalMode, scheduler, warpMad] = await Promise.all([
    readReport(`agent-real-tmux-physical-proof-${input.releaseVersion}.json`, ['agent-tmux-physical-proof.json', 'agent-real-tmux-physical-proof-1.18.6.json']),
    readReport(`agent-real-codex-dynamic-smoke-${input.releaseVersion}.json`, ['agent-real-codex-dynamic-smoke-1.18.6.json']),
    readReport(`agent-cleanup-executor-v2-${input.releaseVersion}.json`, ['agent-cleanup-proof.json']),
    readReport(`agent-intelligent-work-graph-v2-${input.releaseVersion}.json`, ['agent-intelligent-work-graph.json']),
    readReport('fake-real-proof-policy.json'),
    readReport('source-intelligence-evidence.json'),
    readReport('goal-mode-applied.json'),
    readReport('agent-scheduler-state.json'),
    readReport('mad-sks-tmux-lane-ui.json')
  ])
  const rows: RuntimeTruthRow[] = [
    row('tmux_physical', levelFromTmux(tmux, required.tmux_physical === true), ['agent-real-tmux-physical-proof', 'agent-tmux-physical-proof.json'], required.tmux_physical === true, tmux, 'run `SKS_TEST_REAL_TMUX=1 npm run agent:real-tmux-physical-proof`'),
    row('codex_dynamic', levelFromCodex(codex, required.codex_dynamic === true), ['agent-real-codex-dynamic-smoke'], required.codex_dynamic === true, codex, 'run `SKS_TEST_REAL_DYNAMIC_AGENTS=1 npm run agent:real-codex-dynamic-smoke-v2`'),
    row('cleanup', levelFromOk(cleanup, 'integration_optional'), ['agent-cleanup-proof.json'], false, cleanup, 'run `npm run agent:cleanup-executor-v2`'),
    row('intelligent_work_graph', levelFromWorkGraph(workGraph || fakeReal), ['agent-intelligent-work-graph-v2.json', 'agent-symbol-ownership-map.json'], false, workGraph, 'run `npm run agent:ast-aware-work-graph`'),
    row('source_intelligence', sourceIntel?.ok === true ? 'proven' : 'integration_optional', ['source-intelligence-evidence.json'], false, sourceIntel, 'refresh source intelligence evidence'),
    row('goal_mode', goalMode?.ok === true ? 'proven' : 'integration_optional', ['goal-mode-applied.json'], false, goalMode, 'record official goal mode evidence'),
    row('route_blackbox', fakeReal?.subsystem_levels?.route_blackbox || 'integration_optional', ['fake-real-proof-policy.json', 'agent-proof-evidence.json'], false, fakeReal, 'run actual route blackbox proof'),
    row('dynamic_scheduler', scheduler?.pending_queue_drained === true || scheduler?.ok === true ? 'proven' : 'integration_optional', ['agent-scheduler-state.json'], false, scheduler, 'run dynamic scheduler proof gate'),
    row('warp_mad_lanes', levelFromWarp(warpMad, required.warp_mad_lanes === true), ['mad-sks-tmux-lane-ui.json'], required.warp_mad_lanes === true, warpMad, 'run `sks --mad` in Warp/tmux and capture visible lane proof')
  ]
  const blockers = rows.flatMap((item) => item.required_mode && ['blocked', 'real_required_missing', 'integration_optional'].includes(item.proof_level)
    ? [`required_runtime_truth_missing:${item.subsystem}`, ...item.blockers]
    : item.blockers)
  const priorities = Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((priority) => {
    const priorityBlockers = priority === 'P0' || priority === 'P1' ? blockers : []
    return [priority, {
      status: priorityBlockers.length ? 'blocked' : 'closed',
      evidence: rows.map((item) => item.evidence_artifacts[0]).filter(Boolean),
      blockers: priorityBlockers
    }]
  })) as RuntimeTruthMatrix['priorities']
  return {
    schema: RUNTIME_TRUTH_MATRIX_SCHEMA,
    release_version: input.releaseVersion,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    proof_levels: ['fixture_only', 'fixture_instrumented_real', 'proven', 'integration_optional', 'real_required_missing', 'partial', 'blocked'],
    rows,
    subsystems: rows,
    priorities,
    blockers
  }
}

export async function writeRuntimeTruthMatrix(root: string, matrix: RuntimeTruthMatrix, opts: { agentRoot?: string } = {}) {
  const reportName = `runtime-truth-matrix-${matrix.release_version}.json`
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', reportName), matrix)
  if (opts.agentRoot) await writeJsonAtomic(path.join(opts.agentRoot, 'runtime-truth-matrix.json'), matrix)
  return matrix
}

function row(subsystem: RuntimeTruthSubsystem, proofLevel: ProofLevel, evidenceArtifacts: string[], requiredMode: boolean, report: any, nextAction: string): RuntimeTruthRow {
  const blockers = Array.isArray(report?.blockers) ? report.blockers.map(String) : []
  return {
    subsystem,
    proof_level: proofLevel,
    evidence_artifacts: evidenceArtifacts,
    blockers,
    next_action: blockers.length ? nextAction : proofLevel === 'integration_optional' ? nextAction : 'no action required',
    required_mode: requiredMode
  }
}

function levelFromOk(report: any, missing: ProofLevel): ProofLevel {
  if (!report) return missing
  if (report.proof_level) return report.proof_level
  if (report.ok === true || report.status === 'passed') return 'proven'
  if (report.status === 'integration_optional') return 'integration_optional'
  return 'blocked'
}

function levelFromTmux(report: any, required: boolean): ProofLevel {
  if (!report) return required ? 'real_required_missing' : 'integration_optional'
  if (report.proof_level) return report.proof_level
  if (report.physical_tmux_verified === true || report.status === 'passed') return 'proven'
  if (report.status === 'integration_optional') return required ? 'real_required_missing' : 'integration_optional'
  return required ? 'real_required_missing' : 'blocked'
}

function levelFromCodex(report: any, required: boolean): ProofLevel {
  if (!report) return required ? 'real_required_missing' : 'integration_optional'
  if (report.proof_level) return report.proof_level
  if (report.fixture_instrumented_real === true || report.status === 'fixture_instrumented_real') return 'fixture_instrumented_real'
  if (report.status === 'passed' || report.status === 'proven') return 'proven'
  if (report.status === 'integration_optional') return required ? 'real_required_missing' : 'integration_optional'
  return required ? 'real_required_missing' : 'blocked'
}

function levelFromWorkGraph(report: any): ProofLevel {
  if (!report) return 'integration_optional'
  if (report.proof_level) return report.proof_level
  const score = Number(report.work_graph_quality_score || 0)
  return score >= 0.7 ? 'proven' : score >= 0.35 ? 'partial' : 'blocked'
}

function levelFromWarp(report: any, required: boolean): ProofLevel {
  if (!report) return required ? 'real_required_missing' : 'integration_optional'
  if (report.proof_level) return report.proof_level
  if (report.ok === true && report.visible_lane_contract === true) return 'proven'
  return required ? 'real_required_missing' : 'blocked'
}
