import { findLatestMission, loadMission } from '../mission.js'
import { readJson } from '../fsx.js'
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js'
import { parseAgentCommandArgs } from '../agents/agent-command-surface.js'

export async function agentCommand(commandOrArgs: string | string[] = 'agent', maybeArgs: string[] = []) {
  const args = Array.isArray(commandOrArgs) ? commandOrArgs : maybeArgs
  const parsed = parseAgentCommandArgs('agent', args)
  if (parsed.action === 'status') return agentStatus(parsed)
  if (parsed.action !== 'run') throw new Error('Usage: sks agent run "task" [--route $Team] [--agents N] [--concurrency N] [--backend fake|process|codex-exec] [--json]')
  const result = await runNativeAgentOrchestrator(parsed)
  if (parsed.json) return console.log(JSON.stringify(result, null, 2))
  console.log('Native agent mission: ' + result.mission_id)
  console.log('Backend: ' + result.backend)
  console.log('Agents: ' + result.roster.agent_count + ' (concurrency ' + result.roster.concurrency + ')')
  console.log('Proof: ' + result.proof.status)
}

async function agentStatus(parsed: any) {
  const root = process.cwd()
  const id = await findLatestMission(root)
  if (!id) {
    const result = { schema: 'sks.agent-status.v1', ok: false, status: 'missing_mission' }
    if (parsed.json) return console.log(JSON.stringify(result, null, 2))
    console.log('No mission found.')
    return
  }
  const { dir } = await loadMission(root, id)
  const proof = await readJson(dir + '/agents/agent-proof-evidence.json', null)
  const result = { schema: 'sks.agent-status.v1', ok: Boolean(proof), mission_id: id, proof }
  if (parsed.json) return console.log(JSON.stringify(result, null, 2))
  console.log('Native agent mission: ' + id)
  console.log('Proof: ' + (proof?.status || 'missing'))
}
