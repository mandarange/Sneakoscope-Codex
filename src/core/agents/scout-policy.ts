import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const SCOUT_POLICY_SCHEMA = 'sks.main-no-scout-worker-scout-policy.v1'
export const WORKER_SCOUT_EVIDENCE_SCHEMA = 'sks.worker-scout-evidence.v1'

export interface ScoutPolicyArtifact {
  schema: typeof SCOUT_POLICY_SCHEMA
  generated_at: string
  main_scout_allowed: false
  worker_local_scout_allowed: true
  worker_scout_artifact_root: 'agents/sessions/<agent_id>/worker-scout/'
  central_proof_ssot: 'agents/agent-proof-evidence.json'
  rules: string[]
}

export function buildScoutPolicyArtifact(): ScoutPolicyArtifact {
  return {
    schema: SCOUT_POLICY_SCHEMA,
    generated_at: nowIso(),
    main_scout_allowed: false,
    worker_local_scout_allowed: true,
    worker_scout_artifact_root: 'agents/sessions/<agent_id>/worker-scout/',
    central_proof_ssot: 'agents/agent-proof-evidence.json',
    rules: [
      'main orchestrator and route main sessions must not call Scout',
      'agent workers may use Scout only as session-local evidence',
      'worker Scout evidence cannot satisfy native_agent_backend proof',
      'worker Scout evidence cannot write mission-root scout-ledger.json',
      'worker Scout evidence cannot become central proof SSOT'
    ]
  }
}

export async function writeScoutPolicyArtifact(root: string): Promise<ScoutPolicyArtifact> {
  const artifact = buildScoutPolicyArtifact()
  await writeJsonAtomic(path.join(root, 'scout-policy.json'), artifact)
  return artifact
}

export function detectMainScoutCall(text: string) {
  const patterns = [
    /\bsks\s+scouts?\s+run\b/i,
    /\brunFiveScoutIntake\b/,
    /\bparallel_analysis_scouting\b/,
    /\bmain\s+.*\bScout\b/i
  ]
  const violations = patterns.filter((pattern) => pattern.test(text)).map(String)
  return {
    schema: 'sks.main-scout-call-detection.v1',
    ok: violations.length === 0,
    main_scout_allowed: false,
    violations
  }
}

export function validateWorkerScoutEvidence(root: string, evidence: any) {
  const agentId = String(evidence?.agent_id || '')
  const artifactPath = String(evidence?.artifact_path || evidence?.path || '')
  const normalized = normalizeRel(root, artifactPath)
  const expectedPrefix = normalizeRel(root, path.join(root, 'sessions', agentId, 'worker-scout')) + '/'
  const missionRootLedger = /(?:^|\/)scout-ledger\.json$/.test(normalized) && !normalized.includes(`/sessions/${agentId}/worker-scout/`)
  const ok = Boolean(agentId) && normalized.startsWith(expectedPrefix) && !missionRootLedger
  return {
    schema: WORKER_SCOUT_EVIDENCE_SCHEMA,
    ok,
    agent_id: agentId,
    artifact_path: artifactPath,
    normalized_path: normalized,
    worker_local_scout_allowed: true,
    central_proof_ssot: false,
    blockers: ok ? [] : [
      ...(!agentId ? ['worker_scout_agent_id_missing'] : []),
      ...(normalized.startsWith(expectedPrefix) ? [] : ['worker_scout_artifact_outside_agent_session']),
      ...(missionRootLedger ? ['worker_scout_global_scout_ledger_blocked'] : [])
    ]
  }
}

function normalizeRel(root: string, value: string) {
  const full = path.isAbsolute(value) ? value : path.join(root, value)
  return path.resolve(full).split(path.sep).join('/')
}
