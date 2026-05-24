export const AGENT_KERNEL_SCHEMA = 'sks.native-agent-kernel.v1';
export const AGENT_RESULT_SCHEMA = 'sks.agent-result.v1';
export const AGENT_LEDGER_EVENT_SCHEMA = 'sks.agent-ledger-event.v1';
export const AGENT_PROOF_EVIDENCE_SCHEMA = 'sks.agent-proof-evidence.v1';
export const AGENT_WORKER_PIPELINE = 'AGENT_WORKER_PIPELINE';
export const AGENT_ORCHESTRATOR_PIPELINE = 'AGENT_ORCHESTRATOR_PIPELINE';
export const DEFAULT_AGENT_COUNT = 5;
export const AGENT_COUNT = DEFAULT_AGENT_COUNT;
export const AGENT_INTAKE_STAGE_ID = 'native_agent_intake';
export const MAX_AGENT_COUNT = 20;
export const DEFAULT_AGENT_CONCURRENCY = 5;
export const AGENT_BACKENDS = Object.freeze(['fake', 'process', 'codex-exec', 'tmux']);
export function normalizeAgentBackend(input) {
  const value = String(input || 'fake');
  return AGENT_BACKENDS.includes(value) ? value : 'fake';
}
export function agentSessionId(agentId, index = 1) {
  return agentId + '-session-' + String(index).padStart(2, '0');
}
