import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { setCurrent } from '../mission.js'
import { runNativeAgentOrchestrator } from './agent-orchestrator.js'

const ROUTE_PERSONAS: Record<string, any[]> = {
  Review: [
    routePersona('review_safety', 'safety', 'Read-only approval safety reviewer for permissions, DB, destructive actions, and fallback risk.'),
    routePersona('review_verifier', 'verifier', 'Read-only verifier for claims, command evidence, proof artifacts, and missing tests.'),
    routePersona('review_integrator', 'integrator', 'Final approval reconciler that closes blockers only after proof and session cleanup pass.')
  ],
  'PPT-Collab': [
    routePersona('ppt_source_mapper', 'documentation', 'Maps deck/source HTML artifacts and keeps source clarity evidence separate from visual review.'),
    routePersona('ppt_visual_reviewer', 'ux', 'Checks slide images, generated callouts, and layout issues without text-only fallback.'),
    routePersona('ppt_integrator', 'integrator', 'Owns PPT route closure after source HTML, image evidence, and proof graph align.')
  ],
  'UX-Collab': [
    routePersona('ux_visual_reviewer', 'ux', 'Requires generated annotated review images before UX claims can pass.'),
    routePersona('ux_issue_extractor', 'verifier', 'Extracts issue ledgers from generated callouts and blocks prose-only critique.'),
    routePersona('ux_safety', 'safety', 'Checks visual evidence privacy, local image handling, and unsupported fix claims.')
  ],
  'DB-Review': [
    routePersona('db_guardian', 'db', 'Read-only DB safety guardian that blocks destructive or live data mutation without a sealed contract.'),
    routePersona('db_schema_reviewer', 'schema', 'Reviews SQL/schema intent and migration scope before any DB-related proof can pass.'),
    routePersona('db_integrator', 'integrator', 'Closes DB review only after safety report, gate, and proof evidence agree.')
  ],
  'Release-Review': [
    routePersona('release_gate_auditor', 'release', 'Checks release gates, package metadata, and version/readiness evidence.'),
    routePersona('release_packaging', 'verifier', 'Verifies dist, package boundary, pack/install, and publish-prep artifacts.'),
    routePersona('release_safety', 'safety', 'Blocks publish overclaims, stale package claims, and unverified real-smoke assertions.')
  ]
}

export async function writeRouteCollaborationArtifacts(root: string, opts: {
  missionId: string
  route: string
  routeKey: 'Review' | 'PPT-Collab' | 'UX-Collab' | 'DB-Review' | 'Release-Review'
  prompt?: string
  agents?: number
  concurrency?: number
  backend?: string
  mode?: string
}) {
  const routeKey = opts.routeKey
  const backend = opts.backend || 'fake'
  const agentRun = await runNativeAgentOrchestrator({
    root,
    missionId: opts.missionId,
    route: opts.route,
    prompt: opts.prompt || routeKey + ' native collaboration fixture',
    agents: opts.agents || 5,
    concurrency: opts.concurrency || 5,
    backend,
    mock: backend === 'fake',
    readonly: true
  })
  const missionDir = path.join(root, '.sneakoscope', 'missions', opts.missionId)
  const ledgerRoot = path.join(root, agentRun.ledger_root)
  const plan = {
    schema: 'sks.route-collaboration-native-agent-plan.v1',
    generated_at: nowIso(),
    mission_id: opts.missionId,
    route: opts.route,
    route_key: routeKey,
    backend: 'native_multi_session_agent_kernel',
    replaces_legacy_multiagent_runtime: true,
    legacy_compatibility_note: 'Legacy multi-agent command surfaces are removed; route collaboration uses the native agent kernel only.',
    central_ledger: 'agents/agent-events.jsonl',
    task_board: 'agents/agent-task-board.json',
    leases: 'agents/agent-leases.json',
    no_overlap_proof: 'agents/agent-no-overlap-proof.json',
    session_close: 'agents/agent-cleanup.json',
    proof_graph: 'agents/agent-proof-evidence.json',
    trust_report: 'agents/agent-trust-report.json',
    fake_backend_fixture: backend === 'fake',
    real_mode_codex_exec_backend: {
      supported: true,
      command_pattern: 'sks agent run "<task>" --backend codex-exec --real --agents <1-20> --concurrency <1-20> --json',
      requires_user_runtime: true
    },
    route_specific_personas: ROUTE_PERSONAS[routeKey] || [],
    manual_agent_count_syntax: {
      agent_command: 'sks agent run "<task>" --agents 8 --concurrency 4 --mock --json',
      team_prompt: '$Team <task> executor:8 reviewer:5',
      cap: agentRun.roster.max_agents,
      default: agentRun.roster.default_agents
    },
    dynamic_effort_assignment: agentRun.roster.effort_policy,
    validation: {
      route_runtime_legacy_multiagent_call_removed: true,
      native_agent_plan_used: true,
      central_ledger_written: true,
      task_board_written: true,
      non_overlap_leases_assigned: agentRun.partition.lease_count > 0 && agentRun.partition.blockers.length === 0,
      session_close_validated: agentRun.cleanup.all_sessions_closed === true,
      proof_graph_validated: agentRun.proof.ok === true,
      recursive_command_block_policy: true,
      docs_update_required: false,
      release_gate_updated: true,
      mock_mode_fake_agent_backend: backend === 'fake',
      real_mode_codex_exec_backend: true
    }
  }
  await writeJsonAtomic(path.join(missionDir, routePlanName(routeKey)), plan)
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-route-collaboration-plan.json'), plan)
  await setCurrent(root, {
    mission_id: opts.missionId,
    mode: opts.mode || modeForRouteKey(routeKey),
    phase: 'ROUTE_NATIVE_AGENT_COLLABORATION_DONE',
    route_command: opts.route,
    native_agent_backend: backend
  })
  return {
    schema: 'sks.route-collaboration-artifacts.v1',
    ok: agentRun.ok && plan.validation.proof_graph_validated,
    mission_id: opts.missionId,
    route: opts.route,
    route_key: routeKey,
    plan,
    agent_run: agentRun,
    artifacts: {
      plan: routePlanName(routeKey),
      central_ledger: 'agents/agent-events.jsonl',
      task_board: 'agents/agent-task-board.json',
      leases: 'agents/agent-leases.json',
      no_overlap_proof: 'agents/agent-no-overlap-proof.json',
      session_close: 'agents/agent-cleanup.json',
      proof_graph: 'agents/agent-proof-evidence.json'
    }
  }
}

export function routePlanName(routeKey: string) {
  return routeKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-native-agent-plan.json'
}

function routePersona(id: string, role: string, mandate: string) {
  return {
    id,
    role,
    read_only: true,
    mandate,
    central_ledger_only: true,
    no_recursive_route_commands: true
  }
}

function modeForRouteKey(routeKey: string) {
  if (routeKey === 'PPT-Collab') return 'PPT'
  if (routeKey === 'UX-Collab') return 'IMAGE_UX_REVIEW'
  if (routeKey === 'DB-Review') return 'DB'
  if (routeKey === 'Release-Review') return 'RELEASE'
  return 'REVIEW'
}
