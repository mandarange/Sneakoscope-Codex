import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import type { ProofLevel } from './fake-real-proof-policy.js'

export const RUNTIME_TRUTH_MATRIX_SCHEMA = 'sks.runtime-truth-matrix.v1'
export const RUNTIME_TRUTH_SUBSYSTEMS = [
  'tmux_physical',
  'codex_dynamic',
  'codex_patch_envelope_smoke',
  'cleanup',
  'intelligent_work_graph',
  'source_intelligence',
  'goal_mode',
  'route_blackbox',
  'dynamic_scheduler',
  'warp_mad_lanes',
  'codex_0_134',
  'mcp_0_134',
  'mcp_readonly_runtime_scheduler',
  'adhd_orchestration',
  'appshots',
  'parallel_write',
  'patch_proof',
  'native_cli_session_swarm',
  'real_codex_parallel_workers',
  'native_worker_backend_router',
  'codex_child_overlap',
  'model_authored_patch_envelopes',
  'fast_mode_child_propagation',
  'fast_mode_default',
  'cleanup_v4',
  'ast_type_work_graph',
  'warp_mad_right_lanes'
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
    codex_patch_envelope_smoke: process.env.SKS_REQUIRE_REAL_CODEX_PATCHES === '1',
    real_codex_parallel_workers: process.env.SKS_REQUIRE_REAL_CODEX_PARALLEL === '1',
    warp_mad_lanes: process.env.SKS_REQUIRE_WARP_MAD_LANES === '1',
    ...(input.required || {})
  } as Partial<Record<RuntimeTruthSubsystem, boolean>>
  const [tmux, codex, codexPatch, realCodexParallel, workerBackendRouter, codexChildOverlap, modelAuthoredPatch, tmuxRightLanePhysical, tmuxRightLaneCoordinate, tmuxRightLaneContent, madWarpRightLaneAttach, cleanup, workGraph, fakeReal, sourceIntel, goalMode, scheduler, warpMad, codex0134, mcp0134, mcpReadonlyRuntime, adhdOrchestration, appshots, parallelWrite, patchProof, nativeCliSession, fastModeDefault] = await Promise.all([
    readReport(`agent-real-tmux-physical-proof-${input.releaseVersion}.json`, ['agent-tmux-physical-proof.json', 'agent-real-tmux-physical-proof-1.18.6.json']),
    readReport(`agent-real-codex-dynamic-smoke-${input.releaseVersion}.json`, ['agent-real-codex-dynamic-smoke-1.18.6.json']),
    readReport('agent-real-codex-patch-envelope-smoke.json'),
    readReport('agent-real-codex-parallel-workers.json', ['real-codex-parallel-proof.json']),
    readReport('agent-worker-backend-router.json'),
    readReport('agent-codex-child-overlap.json'),
    readReport('agent-model-authored-patch-envelope.json'),
    readReport('tmux-right-lane-physical-layout-proof.json'),
    readReport('tmux-right-lane-coordinate-proof.json'),
    readReport('tmux-right-lane-content-proof.json'),
    readReport('mad-sks-warp-right-lane-attach.json'),
    readReport(`agent-cleanup-executor-v2-${input.releaseVersion}.json`, ['agent-cleanup-proof.json']),
    readReport(`agent-intelligent-work-graph-v2-${input.releaseVersion}.json`, ['agent-intelligent-work-graph.json']),
    readReport('fake-real-proof-policy.json'),
    readReport('source-intelligence-evidence.json'),
    readReport('goal-mode-applied.json'),
    readReport('agent-scheduler-state.json'),
    readReport('mad-sks-tmux-lane-ui.json'),
    readReport('codex-0-134-official-compat.json'),
    readReport('mcp-0-134-modernization.json'),
    readReport('mcp-readonly-runtime-scheduler.json'),
    readReport('strategy-gate.json', ['strategy-adhd-orchestrating-gate.json', 'adhd-orchestrating-gate.json']),
    readReport('appshots-evidence.json'),
    readReport('agent-parallel-write-kernel.json'),
    readReport('agent-patch-proof.json'),
    readReport('native-cli-session-proof.json', ['agent-native-cli-session-swarm.json']),
    readReport('fast-mode-propagation-proof.json')
  ])
  const rows: RuntimeTruthRow[] = [
    row('tmux_physical', levelFromTmux(tmux, required.tmux_physical === true), ['agent-real-tmux-physical-proof', 'agent-tmux-physical-proof.json'], required.tmux_physical === true, tmux, 'run `SKS_TEST_REAL_TMUX=1 npm run agent:real-tmux-physical-proof`'),
    row('codex_dynamic', levelFromCodex(codex, required.codex_dynamic === true), ['agent-real-codex-dynamic-smoke'], required.codex_dynamic === true, codex, 'run `SKS_TEST_REAL_DYNAMIC_AGENTS=1 npm run agent:real-codex-dynamic-smoke-v2`'),
    row('codex_patch_envelope_smoke', levelFromCodex(codexPatch, required.codex_patch_envelope_smoke === true), ['agent-real-codex-patch-envelope-smoke.json'], required.codex_patch_envelope_smoke === true, codexPatch, 'run `SKS_TEST_REAL_CODEX_PATCHES=1 npm run agent:real-codex-patch-envelope-smoke`'),
    row('cleanup', levelFromOk(cleanup, 'integration_optional'), ['agent-cleanup-proof.json'], false, cleanup, 'run `npm run agent:cleanup-executor-v2`'),
    row('intelligent_work_graph', levelFromWorkGraph(workGraph || fakeReal), ['agent-intelligent-work-graph-v2.json', 'agent-symbol-ownership-map.json'], false, workGraph, 'run `npm run agent:ast-aware-work-graph`'),
    row('source_intelligence', sourceIntel?.ok === true ? 'proven' : 'integration_optional', ['source-intelligence-evidence.json'], false, sourceIntel, 'refresh source intelligence evidence'),
    row('goal_mode', goalMode?.ok === true ? 'proven' : 'integration_optional', ['goal-mode-applied.json'], false, goalMode, 'record official goal mode evidence'),
    row('route_blackbox', fakeReal?.subsystem_levels?.route_blackbox || 'integration_optional', ['fake-real-proof-policy.json', 'agent-proof-evidence.json'], false, fakeReal, 'run actual route blackbox proof'),
    row('dynamic_scheduler', scheduler?.pending_queue_drained === true || scheduler?.ok === true ? 'proven' : 'integration_optional', ['agent-scheduler-state.json'], false, scheduler, 'run dynamic scheduler proof gate'),
    row('warp_mad_lanes', levelFromWarp(warpMad || madWarpRightLaneAttach || tmuxRightLanePhysical, required.warp_mad_lanes === true), ['mad-sks-tmux-lane-ui.json', 'tmux-right-lane-physical-layout-proof.json'], required.warp_mad_lanes === true, warpMad || madWarpRightLaneAttach || tmuxRightLanePhysical, 'run `sks --mad` in Warp/tmux and capture visible lane proof'),
    row('codex_0_134', levelFromOk(codex0134, 'integration_optional'), ['codex-0-134-official-compat.json'], false, codex0134, 'run `npm run codex:0.134-official-compat`'),
    row('mcp_0_134', levelFromOk(mcp0134, 'integration_optional'), ['mcp-0-134-modernization.json'], false, mcp0134, 'run `npm run mcp:0.134-modernization`'),
    row('mcp_readonly_runtime_scheduler', levelFromOk(mcpReadonlyRuntime, 'integration_optional'), ['mcp-readonly-runtime-scheduler.json'], false, mcpReadonlyRuntime, 'run `npm run mcp:readonly-runtime-scheduler`'),
    row('adhd_orchestration', levelFromOk(adhdOrchestration, 'integration_optional'), ['strategy-gate.json', 'adhd-orchestrating-gate.json'], false, adhdOrchestration, 'run `npm run strategy:adhd-orchestrating-gate`'),
    row('appshots', levelFromAppshots(appshots), ['appshots-evidence.json'], false, appshots, 'run `npm run appshots:evidence`'),
    row('parallel_write', levelFromOk(parallelWrite, 'integration_optional'), ['agent-parallel-write-kernel.json'], false, parallelWrite, 'run `npm run agent:parallel-write-kernel`'),
    row('patch_proof', levelFromOk(patchProof, 'integration_optional'), ['agent-patch-proof.json'], false, patchProof, 'run `npm run agent:patch-proof`'),
    row('native_cli_session_swarm', levelFromOk(nativeCliSession, 'integration_optional'), ['native-cli-session-proof.json', 'agent-native-cli-session-swarm.json'], false, nativeCliSession, 'run `npm run agent:native-cli-session-swarm-20`'),
    row('real_codex_parallel_workers', levelFromCodex(realCodexParallel, required.real_codex_parallel_workers === true), ['real-codex-parallel-proof.json', 'agent-real-codex-parallel-workers.json'], required.real_codex_parallel_workers === true, realCodexParallel, 'run `SKS_TEST_REAL_CODEX_PARALLEL=1 npm run agent:real-codex-parallel-workers`'),
    row('native_worker_backend_router', levelFromOk(workerBackendRouter, 'integration_optional'), ['agent-worker-backend-router.json', 'worker-backend-router-report.json'], false, workerBackendRouter, 'run `npm run agent:worker-backend-router`'),
    row('codex_child_overlap', levelFromOk(codexChildOverlap || realCodexParallel, 'integration_optional'), ['agent-codex-child-overlap.json', 'real-codex-parallel-proof.json'], required.real_codex_parallel_workers === true, codexChildOverlap || realCodexParallel, 'run `npm run agent:codex-child-overlap`'),
    row('model_authored_patch_envelopes', levelFromOk(modelAuthoredPatch || realCodexParallel, 'integration_optional'), ['agent-model-authored-patch-envelope.json', 'real-codex-parallel-proof.json'], required.real_codex_parallel_workers === true, modelAuthoredPatch || realCodexParallel, 'run `npm run agent:model-authored-patch-envelope`'),
    row('fast_mode_child_propagation', levelFromOk(realCodexParallel || fastModeDefault, 'integration_optional'), ['real-codex-parallel-proof.json', 'fast-mode-propagation-proof.json'], false, realCodexParallel || fastModeDefault, 'run `npm run agent:fast-mode-worker-propagation`'),
    row('fast_mode_default', levelFromOk(fastModeDefault, 'integration_optional'), ['fast-mode-propagation-proof.json'], false, fastModeDefault, 'run `npm run agent:fast-mode-default`'),
    row('cleanup_v4', levelFromOk(cleanup, 'integration_optional'), ['agent-cleanup-proof.json'], false, cleanup, 'run `npm run agent:cleanup-executor-v2`'),
    row('ast_type_work_graph', levelFromWorkGraph(workGraph || fakeReal), ['agent-intelligent-work-graph-v2.json', 'agent-symbol-ownership-map.json'], false, workGraph, 'run `npm run agent:ast-aware-work-graph`'),
    row('warp_mad_right_lanes', levelFromWarp(warpMad || madWarpRightLaneAttach || tmuxRightLanePhysical || tmuxRightLaneCoordinate || tmuxRightLaneContent, required.warp_mad_lanes === true), ['mad-sks-tmux-lane-ui.json', 'tmux-right-lane-physical-layout-proof.json'], required.warp_mad_lanes === true, warpMad || madWarpRightLaneAttach || tmuxRightLanePhysical || tmuxRightLaneCoordinate || tmuxRightLaneContent, 'run `sks --mad` in Warp/tmux and capture right-lane proof')
  ]
  const blockers = rows.flatMap((item) => item.required_mode && ['blocked', 'real_required_missing', 'integration_optional'].includes(item.proof_level)
    ? [`required_runtime_truth_missing:${item.subsystem}`, ...item.blockers]
    : item.blockers)
  const priorities = Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((priority) => {
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

function levelFromAppshots(report: any): ProofLevel {
  if (!report) return 'integration_optional'
  const evidence = report.evidence || report
  if (Array.isArray(evidence.blockers) && evidence.blockers.length > 0) return 'blocked'
  if (evidence.ok !== true && report.ok !== true) return 'blocked'
  if (evidence.proof_level === 'proven') return 'proven'
  if (evidence.proof_level === 'fixture_instrumented_real') return 'fixture_instrumented_real'
  if (evidence.status === 'not_required') return 'integration_optional'
  const sources = Array.isArray(evidence.source_verification) ? evidence.source_verification : []
  if (sources.length && sources.every((source: any) => source?.accepted === true)) {
    return sources.some((source: any) => source?.fixture === true) ? 'fixture_instrumented_real' : 'proven'
  }
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
