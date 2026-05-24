import { AGENT_RESULT_SCHEMA, AGENT_WORKER_PIPELINE } from './agent-schema.js'
import type { AgentRunnerResult } from './agent-schema.js'
import { scanAgentTextForRecursion } from './agent-recursion-guard.js'
import { validateAgentResultSchema } from './agent-output-validator.js'

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

export function validateAgentWorkerResult(result: any): AgentRunnerResult {
  const guard = scanAgentTextForRecursion(JSON.stringify(result || {}))
  const normalized: AgentRunnerResult = {
    schema: AGENT_RESULT_SCHEMA,
    mission_id: String(result?.mission_id || ''),
    agent_id: String(result?.agent_id || 'unknown'),
    session_id: String(result?.session_id || 'unknown'),
    persona_id: String(result?.persona_id || result?.agent_id || 'unknown'),
    task_slice_id: String(result?.task_slice_id || 'unknown'),
    status: guard.ok ? (result?.status || 'done') : 'blocked',
    backend: result?.backend || 'fake',
    summary: String(result?.summary || ''),
    findings: Array.isArray(result?.findings) ? result.findings : [],
    proposed_changes: Array.isArray(result?.proposed_changes) ? result.proposed_changes : [],
    changed_files: Array.isArray(result?.changed_files) ? result.changed_files : [],
    lease_compliance: normalizeLeaseCompliance(result?.lease_compliance),
    artifacts: Array.isArray(result?.artifacts) ? result.artifacts : [],
    blockers: [...(Array.isArray(result?.blockers) ? result.blockers : []), ...guard.violations.map((v) => 'recursion:' + v)],
    confidence: String(result?.confidence || 'medium'),
    handoff_notes: String(result?.handoff_notes || ''),
    unverified: Array.isArray(result?.unverified) ? result.unverified : [],
    writes: Array.isArray(result?.writes) ? result.writes : [],
    recursion_guard: { ok: guard.ok, violations: guard.violations },
    verification: normalizeVerification(result?.verification)
  }
  const schemaValidation = validateAgentResultSchema(normalized)
  if (!schemaValidation.ok) {
    normalized.status = 'blocked'
    normalized.blockers.push(...schemaValidation.issues.map((issue) => 'schema_invalid:' + issue))
    normalized.verification = { status: 'failed', checks: [...normalized.verification.checks, 'agent-result-schema'] }
  }
  return normalized
}

export function agentWorkerPipelineContract() {
  return {
    schema: 'sks.agent-worker-pipeline.v1',
    pipeline_id: AGENT_WORKER_PIPELINE,
    creates_mission: false,
    route_classifier_allowed: false,
    writes_global_current_json: false,
    route_finalizer_allowed: false,
    writes_only_agent_session_and_central_ledger: true
  }
}

function normalizeLeaseCompliance(value: any) {
  return {
    ok: value?.ok !== false,
    violations: Array.isArray(value?.violations) ? value.violations : []
  }
}

function normalizeVerification(value: any) {
  return {
    status: String(value?.status || 'not_run'),
    checks: Array.isArray(value?.checks) ? value.checks : []
  }
}
