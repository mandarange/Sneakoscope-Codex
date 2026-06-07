import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const REPLICATION_PACK_ARTIFACT = 'replication-pack.json'

export function defaultReplicationPack(plan: any = null) {
  return {
    schema: 'sks.research-replication-pack.v1',
    generated_at: nowIso(),
    mission_id: plan?.mission_id || null,
    prompt: plan?.prompt || '',
    inputs: ['research-plan.json', 'research-quality-contract.json', 'source-ledger.json', 'claim-evidence-matrix.json'],
    commands: [
      'sks research status latest',
      'npm run research:quality-contract',
      'npm run research:claim-matrix',
      'npm run research:final-review'
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
    assumptions: ['Live source retrieval must be recorded in source-ledger.json for real runs.'],
    reproduction_notes: []
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
