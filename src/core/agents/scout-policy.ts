import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const SCOUT_POLICY_SCHEMA = 'sks.main-no-scout-worker-scout-policy.v1'
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

