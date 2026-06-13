import { writeJsonAtomic } from '../fsx.js';
import { loopFinalArbiterGateContractPath, loopGptFinalArbiterPath } from './loop-artifacts.js';

export interface LoopFinalArbiterGateContract {
  schema: 'sks.loop-final-arbiter-gate-contract.v1';
  mission_id: string;
  gate_id: 'gpt:final-arbiter';
  handled_by: 'loop-finalizer';
  gate_runner_status: 'deferred';
  finalizer_artifact_path: string;
  required_when: string[];
  production_fixture_allowed: false;
}

export async function writeLoopFinalArbiterGateContract(root: string, missionId: string): Promise<LoopFinalArbiterGateContract> {
  const contract = buildLoopFinalArbiterGateContract(root, missionId);
  await writeJsonAtomic(loopFinalArbiterGateContractPath(root, missionId), { ...contract, generated_at: new Date().toISOString() });
  return contract;
}

export function buildLoopFinalArbiterGateContract(root: string, missionId: string): LoopFinalArbiterGateContract {
  return {
    schema: 'sks.loop-final-arbiter-gate-contract.v1',
    mission_id: missionId,
    gate_id: 'gpt:final-arbiter',
    handled_by: 'loop-finalizer',
    gate_runner_status: 'deferred',
    finalizer_artifact_path: relativeMissionArtifact(root, loopGptFinalArbiterPath(root, missionId)),
    required_when: ['source_mutation_exists', 'selected_gates_include_gpt_final_arbiter'],
    production_fixture_allowed: false
  };
}

export function loopFinalArbiterGateContractRelativePath(missionId: string): string {
  return `.sneakoscope/missions/${missionId}/loops/gpt-final-arbiter-gate-contract.json`;
}

function relativeMissionArtifact(root: string, absolute: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = absolute.replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedRoot}/`) ? normalized.slice(normalizedRoot.length + 1) : normalized;
}
