export const AGENT_WORKER_PIPELINE = 'AGENT_WORKER_PIPELINE'

export async function agentWorkerEnv(root: string) {
  await createMission(root, { mode: 'team', prompt: 'nested route' })
  await setCurrent(root, 'M-nested')
  return {
    SKS_AGENT_WORKER: '1',
    SKS_PIPELINE_MODE: 'agent-worker',
    SKS_AGENT_SESSION_ID: 'S-1',
    SKS_AGENT_ID: 'A-1'
  }
}

export const leaked = 'sk-THISSHOULDBEREDACTED1234567890'
