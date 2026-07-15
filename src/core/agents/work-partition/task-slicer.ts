import type { AgentRosterEntry, AgentTaskSlice } from '../agent-schema.js'
import { taskGraphToSlices, type AgentTaskGraph } from '../agent-task-graph.js'

export function createAgentTaskSlices(input: { roster: AgentRosterEntry[]; domains?: any[]; prompt?: string; desiredWorkItemCount?: number; minimumWorkItems?: number; routeWorkGraph?: AgentTaskGraph | null }) {
  if (input.routeWorkGraph?.work_items?.length) return taskGraphToSlices(input.routeWorkGraph, input.roster)
  const domains = (input.domains?.length ? [...input.domains] : [{ id: 'general', files: [], criticality: 0 }]).sort((a, b) => Number(b.criticality || 0) - Number(a.criticality || 0))
  const leasedWrites = new Set<string>()
  const sliceCount = Math.max(
    input.roster.length || 1,
    Number.isFinite(Number(input.minimumWorkItems)) ? Number(input.minimumWorkItems) : 0,
    Number.isFinite(Number(input.desiredWorkItemCount)) ? Number(input.desiredWorkItemCount) : 0
  )
  return Array.from({ length: sliceCount }, (_, index): AgentTaskSlice => {
    const agent: any = input.roster[index % input.roster.length] || input.roster[0] || { id: 'agent_1', role: 'verifier' }
    const domain = selectDomainForAgent(agent, index, domains)
    const writeAllowed = /implementer|integrator|documentation|schema|release|ux/.test(agent.role)
    const targetPaths = Array.isArray(domain.files) ? domain.files.slice(0, 20) : []
    const writePaths = []
    if (writeAllowed) {
      for (const file of targetPaths) {
        const normalized = normalizeWritePath(file)
        if (!normalized || isProtectedWritePath(normalized) || leasedWrites.has(normalized)) continue
        leasedWrites.add(normalized)
        writePaths.push(normalized)
        if (writePaths.length >= 3) break
      }
    }
    return {
      id: 'slice-' + String(index + 1).padStart(2, '0'),
      owner_agent_id: agent.id,
      role: agent.role,
      title: 'Slice ' + String(index + 1).padStart(2, '0'),
      domain: domain.id || 'general',
      target_paths: targetPaths,
      readonly_paths: targetPaths,
      write_paths: writePaths,
      required_persona_category: agent.role,
      dependencies: [],
      priority: index + 1,
      lease_requirements: [
        ...writePaths.map((file) => ({ kind: 'write', path: file })),
        ...targetPaths.map((file: string) => ({ kind: 'read', path: normalizeWritePath(file) })).filter((row: { path: string }) => row.path)
      ],
      generated_by: 'sks.agent-task-slicer.v1',
      route_domain: domain.id || 'general',
      work_item_kind: 'slice',
      max_attempts: 1,
      description: 'Native agent ' + agent.id + ' owns ' + (domain.id || 'general') + ' by domain criticality/dependency routing' + (writeAllowed ? ' with leased writes only.' : ' as read-only review.')
    }
  })
}

function normalizeWritePath(file: string) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '')
}

function isProtectedWritePath(file: string) {
  return /^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/.test(file)
}

function selectDomainForAgent(agent: any, index: number, domains: any[]) {
  const role = String(agent.role || '')
  const preferred = role.includes('safety') ? /qa|release|agent-kernel/ : role.includes('verifier') ? /qa|release|schemas/ : role.includes('integrator') ? /agent-kernel|naruto-route/ : role.includes('documentation') ? /docs/ : null
  if (preferred) {
    const found = domains.find((domain) => preferred.test(String(domain.id || '')))
    if (found) return found
  }
  return domains[index % domains.length] || { id: 'general', files: [] }
}
