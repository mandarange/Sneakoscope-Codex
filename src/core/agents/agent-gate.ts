import fs from 'node:fs/promises'
import path from 'node:path'
import { AGENT_INTAKE_STAGE_ID, DEFAULT_AGENT_COUNT } from './agent-schema.js'

async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true } catch { return false }
}

async function readJson(file: string, fallback: any = null): Promise<any> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

export async function readAgentGateStatus(root: string, missionId: string) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId)
  const proofPath = path.join(dir, 'agents', 'agent-proof-evidence.json')
  const gatePath = path.join(dir, 'agent-gate.json')
  const policyPath = path.join(dir, 'agents', 'agent-concurrency-policy.json')
  const teamPlanPath = path.join(dir, 'team-plan.json')
  const proof = await readJson(proofPath, null)
  const gate = await readJson(gatePath, null)
  const policy = await readJson(policyPath, null)
  const teamPlan = await readJson(teamPlanPath, null)
  const expectedAgentCount = Math.max(DEFAULT_AGENT_COUNT, Number(
    gate?.expected_agent_count ||
    teamPlan?.bundle_size ||
    policy?.agents ||
    DEFAULT_AGENT_COUNT
  ) || DEFAULT_AGENT_COUNT)
  const missing = [] as string[]
  if (!(await exists(proofPath))) missing.push('agents/agent-proof-evidence.json')
  const blockers = [...(Array.isArray(proof?.blockers) ? proof.blockers : []), ...(Array.isArray(gate?.blockers) ? gate.blockers : [])]
  if (proof?.ok !== true) blockers.push('agent_proof_not_ok')
  if (proof?.status !== 'passed') blockers.push('agent_proof_status_not_passed')
  const agentCount = Number(proof?.agent_count || 0)
  if (agentCount < DEFAULT_AGENT_COUNT) blockers.push('agent_count_below_5')
  if (agentCount < expectedAgentCount) blockers.push('agent_count_below_expected')
  if (proof?.no_overlap_ok !== true) blockers.push('agent_no_overlap_not_ok')
  if (proof?.ledger_hash_chain_ok !== true) blockers.push('agent_ledger_hash_chain_not_ok')
  if (proof?.consensus_ok !== true) blockers.push('agent_consensus_not_ok')
  if (proof?.janitor_ok !== true) blockers.push('agent_janitor_missing_or_not_ok')
  const sessionsClosed = proof?.all_sessions_closed === true && gate?.all_sessions_closed !== false
  const ok = missing.length === 0 && blockers.length === 0 && sessionsClosed && proof?.schema === 'sks.agent-proof-evidence.v1'
  return {
    id: AGENT_INTAKE_STAGE_ID,
    ok,
    missing,
    blockers,
    source: proofPath,
    proof,
    gate,
    expected_agent_count: expectedAgentCount,
    all_sessions_closed: sessionsClosed
  }
}
