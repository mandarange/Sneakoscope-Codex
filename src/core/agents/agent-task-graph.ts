import path from 'node:path'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import type { AgentRole, AgentTaskSlice } from './agent-schema.js'

export const AGENT_TASK_GRAPH_SCHEMA = 'sks.agent-task-graph.v1'

export interface AgentTaskGraphWorkItem {
  work_item_id: string
  title: string
  description: string
  route_domain: string
  work_item_kind: string
  required_persona_category: string
  priority: number
  dependencies: string[]
  lease_requirements: unknown[]
  target_paths: string[]
  readonly_paths: string[]
  write_paths: string[]
  max_attempts: number
  delay_ms?: number
  source_intelligence_refs: Record<string, unknown> | null
  goal_mode_ref: Record<string, unknown> | null
  strategy_refs: Record<string, unknown> | null
  micro_win_id?: string
  dopamine_weight?: number
  appshot_required?: boolean
}

export interface AgentTaskGraph {
  schema: typeof AGENT_TASK_GRAPH_SCHEMA
  generated_at: string
  route_type: string
  prompt_hash: string
  target_active_slots: number
  total_work_items: number
  minimum_work_items: number
  desired_work_items: number
  domains: string[]
  work_items: AgentTaskGraphWorkItem[]
  route_work_count_summary: {
    target_active_slots: number
    total_work_items: number
    generated_from_route: string
    work_items_exceed_active_slots: boolean
  }
}

export function buildAgentTaskGraph(input: {
  routeType?: string
  prompt?: string
  targetActiveSlots: number
  minimumWorkItems?: number
  desiredWorkItems?: number
  domains?: any[]
  dependencies?: Record<string, string[]>
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  strategyRefs?: Record<string, unknown> | null
  microWins?: Array<{ id: string; title?: string; description?: string; kind?: string; write_paths?: string[]; readonly_paths?: string[]; dependencies?: string[]; dopamine_weight?: number; appshot_required?: boolean }>
}): AgentTaskGraph {
  const routeType = normalizeRouteType(input.routeType || '$Agent')
  const targetActiveSlots = Math.max(1, Math.floor(Number(input.targetActiveSlots || 5)))
  const minimumWorkItems = Math.max(1, Math.floor(Number(input.minimumWorkItems || targetActiveSlots)))
  const desiredWorkItems = Math.max(minimumWorkItems, Math.floor(Number(input.desiredWorkItems || minimumWorkItems)))
  const domainTemplates = routeTemplates(routeType)
  const domains = Array.isArray(input.domains) && input.domains.length ? input.domains : domainTemplates
  const workItems = Array.from({ length: desiredWorkItems }, (_, index) => {
    const microWin = input.microWins?.[index % Math.max(1, input.microWins.length)]
    const fallbackTemplate = domainTemplates[0] || { id: 'general', kind: 'general', role: 'verifier', description: 'general task' }
    const template = domainTemplates[index % domainTemplates.length] || fallbackTemplate
    const domain = domains[index % domains.length] || template
    const routeDomain = String(microWin?.kind || domain?.id || template.id || 'general')
    const workItemKind = String(microWin?.kind || template.kind || routeDomain || 'general')
    const id = stableWorkItemId({ routeType, prompt: input.prompt || '', index, routeDomain, workItemKind })
    const explicitWritePaths = (microWin?.write_paths || []).map(String)
    const explicitReadonlyPaths = (microWin?.readonly_paths || []).map(String)
    const microWinPaths = [...explicitWritePaths, ...explicitReadonlyPaths]
    const targetPaths: string[] = microWinPaths.length ? microWinPaths : Array.isArray(domain?.files) ? domain.files.slice(0, 20).map(String) : []
    const microWinAllowsWrite = microWin?.kind === 'write' || explicitWritePaths.length > 0
    const writeCandidates = explicitWritePaths.length ? explicitWritePaths : microWin === undefined ? targetPaths : []
    const writePaths = (microWinAllowsWrite || (microWin === undefined && writeAllowed(template.role)))
      ? writeCandidates.map(normalizePath).filter((file) => file && !isProtectedWritePath(file)).slice(0, 3)
      : []
    const delayMs = fixtureDelayMs(index, targetActiveSlots)
    return {
      work_item_id: id,
      title: microWin?.title || `${labelForRoute(routeType)} ${workItemKind} ${index + 1}`,
      description: microWin?.description || `${labelForRoute(routeType)} work item ${index + 1}: ${String(template.description || routeDomain)}.`,
      route_domain: routeDomain,
      work_item_kind: workItemKind,
      required_persona_category: String(template.role || 'verifier'),
      priority: index + 1,
      dependencies: microWin?.dependencies || input.dependencies?.[id] || [],
      lease_requirements: [
        ...writePaths.map((file: string) => ({ kind: 'write', path: file })),
        ...targetPaths.map((file: string) => ({ kind: 'read', path: normalizePath(file) })).filter((row: { path: string }) => row.path)
      ],
      target_paths: targetPaths,
      readonly_paths: targetPaths,
      write_paths: writePaths,
      max_attempts: 1,
      ...(delayMs === null ? {} : { delay_ms: delayMs }),
      source_intelligence_refs: input.sourceIntelligenceRefs || null,
      goal_mode_ref: input.goalModeRef || null,
      strategy_refs: input.strategyRefs || null,
      ...(microWin?.id === undefined ? {} : { micro_win_id: microWin.id }),
      ...(microWin?.dopamine_weight === undefined ? {} : { dopamine_weight: microWin.dopamine_weight }),
      ...(microWin?.appshot_required === undefined ? {} : { appshot_required: microWin.appshot_required })
    }
  })
  return {
    schema: AGENT_TASK_GRAPH_SCHEMA,
    generated_at: nowIso(),
    route_type: routeType,
    prompt_hash: sha256(input.prompt || '').slice(0, 16),
    target_active_slots: targetActiveSlots,
    total_work_items: workItems.length,
    minimum_work_items: minimumWorkItems,
    desired_work_items: desiredWorkItems,
    domains: [...new Set(workItems.map((item) => item.route_domain))],
    work_items: workItems,
    route_work_count_summary: {
      target_active_slots: targetActiveSlots,
      total_work_items: workItems.length,
      generated_from_route: routeType,
      work_items_exceed_active_slots: workItems.length > targetActiveSlots
    }
  }
}

export function taskGraphToSlices(graph: AgentTaskGraph, roster: any[] = []): AgentTaskSlice[] {
  const rows = roster.length ? roster : [{ id: 'agent_1', role: 'verifier' }]
  const leasedWrites = new Set<string>()
  return graph.work_items.map((item, index) => {
    const agent = rows[index % rows.length] || rows[0]
    const writePaths = item.write_paths.filter((file) => {
      const normalized = normalizePath(file)
      if (!normalized || isProtectedWritePath(normalized) || leasedWrites.has(normalized)) return false
      leasedWrites.add(normalized)
      return true
    })
    return {
      id: item.work_item_id,
      owner_agent_id: String(agent?.id || `agent_${(index % rows.length) + 1}`),
      role: String(agent?.role || item.required_persona_category || 'verifier'),
      title: item.title,
      domain: item.route_domain,
      target_paths: item.target_paths,
      readonly_paths: item.readonly_paths,
      write_paths: writePaths,
      required_persona_category: item.required_persona_category,
      dependencies: item.dependencies,
      priority: item.priority,
      lease_requirements: [
        ...writePaths.map((file) => ({ kind: 'write', path: file })),
        ...item.readonly_paths.map((file) => ({ kind: 'read', path: normalizePath(file) })).filter((row) => row.path)
      ],
      generated_by: AGENT_TASK_GRAPH_SCHEMA,
      route_domain: item.route_domain,
      work_item_kind: item.work_item_kind,
      max_attempts: item.max_attempts,
      ...(item.delay_ms === undefined ? {} : { delay_ms: item.delay_ms }),
      strategy_refs: item.strategy_refs || null,
      ...(item.micro_win_id === undefined ? {} : { micro_win_id: item.micro_win_id }),
      ...(item.dopamine_weight === undefined ? {} : { dopamine_weight: item.dopamine_weight }),
      ...(item.appshot_required === undefined ? {} : { appshot_required: item.appshot_required }),
      description: item.description
    }
  })
}

export async function writeAgentTaskGraph(root: string, graph: AgentTaskGraph) {
  await writeJsonAtomic(path.join(root, 'agent-task-graph.json'), graph)
  return graph
}

function routeTemplates(routeType: string) {
  const route = routeType.toLowerCase()
  if (route.includes('team')) return [
    template('implementation', 'implementer', 'implementation task'),
    template('review', 'verifier', 'review task'),
    template('verification', 'verifier', 'verification task'),
    template('integration', 'integrator', 'integration task')
  ]
  if (route.includes('research')) return [
    template('source-mining', 'research', 'source mining task'),
    template('skeptic', 'research', 'skeptic falsification task'),
    template('falsifier', 'verifier', 'counterevidence task'),
    template('synthesis', 'research', 'synthesis task'),
    template('citation', 'verifier', 'citation coverage task')
  ]
  if (route.includes('qa')) return [
    template('test-group', 'verifier', 'test group task'),
    template('regression-group', 'verifier', 'regression group task'),
    template('fixture-group', 'safety', 'fixture and safety task')
  ]
  if (route.includes('dfix')) return [
    template('diagnose', 'architect', 'diagnosis task'),
    template('patch', 'implementer', 'patch task'),
    template('verify', 'verifier', 'verification task'),
    template('safety', 'safety', 'safety task'),
    template('root-cause', 'architect', 'root cause task')
  ]
  if (route.includes('ux')) return [
    template('component', 'ux', 'component task'),
    template('screenshot', 'verifier', 'screenshot task'),
    template('visual', 'ux', 'visual review task'),
    template('a11y', 'verifier', 'accessibility task'),
    template('fix', 'implementer', 'fix task'),
    template('recheck', 'verifier', 'recheck task')
  ]
  if (route.includes('ppt')) return [
    template('slide', 'documentation', 'slide task'),
    template('export', 'verifier', 'export task'),
    template('visual', 'ux', 'visual task'),
    template('fix', 'implementer', 'fix task'),
    template('rereview', 'verifier', 'rereview task'),
    template('proof', 'release', 'proof task')
  ]
  return [
    template('plan', 'architect', 'planning task'),
    template('implement', 'implementer', 'implementation task'),
    template('verify', 'verifier', 'verification task'),
    template('release-proof', 'release', 'release proof task')
  ]
}

function template(id: string, role: AgentRole | string, description: string) {
  return { id, kind: id, role, description }
}

function normalizeRouteType(routeType: string) {
  const value = String(routeType || '$Agent').trim()
  return value.startsWith('$') ? value : `$${value}`
}

function labelForRoute(routeType: string) {
  return routeType.replace(/^\$/, '') || 'Agent'
}

function stableWorkItemId(input: { routeType: string; prompt: string; index: number; routeDomain: string; workItemKind: string }) {
  const hash = sha256(`${input.routeType}\n${input.prompt}\n${input.index}\n${input.routeDomain}\n${input.workItemKind}`).slice(0, 8)
  return `work-${String(input.index + 1).padStart(3, '0')}-${hash}`
}

function writeAllowed(role: unknown) {
  return /implementer|integrator|documentation|schema|release|ux/.test(String(role || ''))
}

function normalizePath(file: unknown) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '')
}

function isProtectedWritePath(file: string) {
  return /^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/.test(file)
}

function fixtureDelayMs(index: number, targetActiveSlots: number) {
  if (process.env.SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE !== '1') return null
  if (index < 2) return 10
  if (index < targetActiveSlots) return 90
  return 15
}
