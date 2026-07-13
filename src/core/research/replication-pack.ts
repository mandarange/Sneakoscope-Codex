import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const REPLICATION_PACK_ARTIFACT = 'replication-pack.json'

export function defaultReplicationPack(plan: any = null, opts: { experimentPlan?: any; claimMatrix?: any } = {}) {
  const missionId = plan?.mission_id || null
  const keyClaimIds = Array.isArray(opts.claimMatrix?.key_claim_ids) ? opts.claimMatrix.key_claim_ids.map(String) : []
  const experimentSteps = Array.isArray(opts.experimentPlan?.steps) ? opts.experimentPlan.steps : []
  return {
    schema: 'sks.research-replication-pack.v1',
    generated_at: nowIso(),
    mission_id: missionId,
    prompt: plan?.prompt || '',
    inputs: ['research-plan.json', 'research-quality-contract.json', 'source-ledger.json', 'claim-evidence-matrix.json'],
    commands: [
      `procedure: inspect sks research status ${missionId || 'latest'} and confirm the exact artifact hashes`,
      'procedure: reacquire the cited supporting and counterevidence sources from source-ledger.json',
      `procedure: execute experiment steps ${experimentSteps.map((step: any) => step.id).filter(Boolean).join(', ') || 'E1-E5'} under the recorded boundary conditions`,
      `procedure: compare observations with the acceptance thresholds for ${keyClaimIds.join(', ') || 'the key claims'} and record null or negative outcomes`
    ],
    expected_artifacts: [
      'research-report.md',
      'claim-evidence-matrix.json',
      'source-quality-report.json',
      'implementation-blueprint.json',
      'experiment-plan.json',
      'replication-pack.json',
      'research-final-review.json',
      'research-gate.evaluated.json'
    ],
    assumptions: [
      'Live source retrieval must be recorded in source-ledger.json for real runs.',
      'Discovery-only or context-only rows cannot substitute for hydrated supporting evidence.',
      'A replication failure downgrades the affected claim instead of being hidden.'
    ],
    reproduction_notes: ['Procedures are domain-neutral; replace them with exact instruments, datasets, software, or laboratory steps when the research topic supplies them.']
  }
}

export function validateReplicationPack(replicationPack: any = null) {
  const commands = Array.isArray(replicationPack?.commands) ? replicationPack.commands : []
  const artifacts = Array.isArray(replicationPack?.expected_artifacts) ? replicationPack.expected_artifacts : []
  const inputs = Array.isArray(replicationPack?.inputs) ? replicationPack.inputs : []
  const blockers = [
    ...(replicationPack ? [] : ['replication_pack_missing']),
    ...(commands.length < 3 ? ['replication_pack_commands_too_thin'] : []),
    ...(artifacts.length < 6 ? ['replication_pack_artifacts_too_thin'] : []),
    ...(inputs.length < 3 ? ['replication_pack_inputs_too_thin'] : [])
  ]
  return { ok: blockers.length === 0, blockers, commands: commands.length, artifacts: artifacts.length, inputs: inputs.length }
}

export async function readReplicationPack(dir: string) {
  return readJson(path.join(dir, REPLICATION_PACK_ARTIFACT), null)
}

export async function writeReplicationPack(dir: string, replicationPack: any) {
  await writeJsonAtomic(path.join(dir, REPLICATION_PACK_ARTIFACT), replicationPack)
  return replicationPack
}
