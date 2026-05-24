import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export async function writeAgentConsensus(root: string, results: any[]) {
  const blockers = results.flatMap((result) => result.blockers || [])
  const consensus = {
    schema: 'sks.agent-consensus.v1',
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'passed',
    agent_count: results.length,
    agreements: results.map((result) => ({ agent_id: result.agent_id, status: result.status, summary: result.summary })),
    blockers
  }
  await writeJsonAtomic(path.join(root, 'agent-consensus.json'), consensus)
  return consensus
}

