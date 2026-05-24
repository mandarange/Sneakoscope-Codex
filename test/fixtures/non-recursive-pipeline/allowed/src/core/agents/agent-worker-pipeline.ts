export const AGENT_WORKER_PIPELINE = 'AGENT_WORKER_PIPELINE'

export function agentWorkerEnv(agent: any, allowedCommandsFile: string) {
  return {
    SKS_AGENT_WORKER: '1',
    SKS_PIPELINE_MODE: 'agent-worker',
    SKS_DISABLE_ROUTE_RECURSION: '1',
    SKS_AGENT_SESSION_ID: agent.session_id,
    SKS_AGENT_ID: agent.id,
    SKS_AGENT_ALLOWED_COMMANDS_FILE: allowedCommandsFile
  }
}
