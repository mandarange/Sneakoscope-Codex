import { readJson, writeJsonAtomic } from '../fsx.js';
import { loopGatePath, loopMutationLedgerPath, loopSideEffectReportPath } from './loop-artifacts.js';
import type { LoopIntegrationMergeResult } from './loop-integration-merge.js';
import { mutationLedgerFromLoopProofs, readLoopMutationLedger, type LoopMutationLedgerEvent } from './loop-mutation-ledger.js';
import type { SksLoopProof } from './loop-schema.js';
import { enforceLoopOwnerScope } from './loop-worktree-runtime.js';

export interface LoopSideEffectReport {
  schema: 'sks.loop-side-effect-report.v1';
  ok: boolean;
  mission_id: string;
  changed_files: string[];
  owner_scope_violations: string[];
  unexpected_package_changes: string[];
  global_config_mutations: string[];
  network_or_install_side_effects: string[];
  gate_side_effects: string[];
  mutation_ledger_path: string;
  blockers: string[];
}

export async function buildLoopSideEffectReport(input: {
  root: string;
  missionId: string;
  proofs: SksLoopProof[];
  integrationMerge?: LoopIntegrationMergeResult | null;
}): Promise<LoopSideEffectReport> {
  await mutationLedgerFromLoopProofs({
    root: input.root,
    missionId: input.missionId,
    proofs: input.proofs,
    integrationMerge: input.integrationMerge || null
  });
  const ledger = await readLoopMutationLedger(input.root, input.missionId);
  const changedFiles = [...new Set([
    ...input.proofs.flatMap((proof) => proof.changed_files),
    ...(input.integrationMerge?.changed_files || []),
    ...ledger.map((event) => event.file_path).filter((file): file is string => Boolean(file))
  ])];
  const integrationLoopIds = new Set(input.proofs.filter((proof) => proof.loop_id.includes('integration')).map((proof) => proof.loop_id));
  const ownerScopeViolations = collectOwnerScopeViolations(input.proofs, ledger);
  const unexpectedPackageChanges = changedFiles.filter((file) => isPackageOrReleaseFile(file) && !changedByIntegration(input.proofs, file, integrationLoopIds));
  const globalConfigMutations = changedFiles.filter(isGlobalConfigPath);
  const gateSideEffects = await collectGateSideEffects(input.root, input.missionId, input.proofs);
  const networkOrInstallSideEffects = gateSideEffects.filter((item) => /(install|network|npm|pnpm|yarn|curl|brew)/i.test(item));
  const blockers = [
    ...ownerScopeViolations.map((file) => `loop_side_effect_owner_scope_violation:${file}`),
    ...unexpectedPackageChanges.map((file) => `loop_side_effect_unexpected_package_change:${file}`),
    ...globalConfigMutations.map((file) => `loop_side_effect_global_config_mutation:${file}`),
    ...networkOrInstallSideEffects.map((item) => `loop_side_effect_network_or_install:${item}`),
    ...gateSideEffects.filter((item) => item.includes('gate_side_effect_not_hermetic')).map((item) => `loop_side_effect_gate:${item}`)
  ];
  const report: LoopSideEffectReport = {
    schema: 'sks.loop-side-effect-report.v1',
    ok: blockers.length === 0,
    mission_id: input.missionId,
    changed_files: changedFiles,
    owner_scope_violations: [...new Set(ownerScopeViolations)],
    unexpected_package_changes: [...new Set(unexpectedPackageChanges)],
    global_config_mutations: [...new Set(globalConfigMutations)],
    network_or_install_side_effects: [...new Set(networkOrInstallSideEffects)],
    gate_side_effects: [...new Set(gateSideEffects)],
    mutation_ledger_path: `.sneakoscope/missions/${input.missionId}/loops/mutation-ledger.jsonl`,
    blockers: [...new Set(blockers)]
  };
  await writeJsonAtomic(loopSideEffectReportPath(input.root, input.missionId), { ...report, generated_at: new Date().toISOString() });
  return report;
}

function collectOwnerScopeViolations(proofs: SksLoopProof[], ledger: LoopMutationLedgerEvent[]): string[] {
  const fromLedger = ledger
    .filter((event) => event.event_type === 'owner_scope_violation' || event.allowed_by_owner_scope === false)
    .map((event) => event.file_path)
    .filter((file): file is string => Boolean(file));
  const fromProofs = proofs.flatMap((proof) => proof.changed_files.filter((file) => enforceLoopOwnerScope([file], proof.owner_scope).length > 0));
  return [...fromLedger, ...fromProofs];
}

async function collectGateSideEffects(root: string, missionId: string, proofs: SksLoopProof[]): Promise<string[]> {
  const results: string[] = [];
  for (const proof of proofs) {
    for (const gateId of proof.gate_result.selected_gates || []) {
      const artifact = await readJson<any>(loopGatePath(root, missionId, proof.loop_id, gateId), null);
      const sideEffect = String(artifact?.side_effect || artifact?.definition_side_effect || '');
      if (proof.loop_id !== 'loop-integration' && sideEffect === 'mutation') {
        results.push(`gate_side_effect_not_hermetic:${proof.loop_id}:${gateId}`);
      }
      if (Array.isArray(artifact?.side_effects)) {
        results.push(...artifact.side_effects.map((value: unknown) => `${proof.loop_id}:${gateId}:${String(value)}`));
      }
    }
  }
  return results;
}

function changedByIntegration(proofs: SksLoopProof[], file: string, integrationLoopIds: Set<string>): boolean {
  return proofs.some((proof) => integrationLoopIds.has(proof.loop_id) && proof.changed_files.includes(file));
}

function isPackageOrReleaseFile(file: string): boolean {
  return ['package.json', 'package-lock.json', 'release-gates.v2.json'].includes(normalize(file));
}

function isGlobalConfigPath(file: string): boolean {
  const normalized = normalize(file);
  return normalized.startsWith('.codex/')
    || normalized.startsWith('.agents/')
    || normalized.startsWith('.sneakoscope/policy')
    || normalized.includes('/.codex/')
    || normalized.includes('/.agents/');
}

function normalize(file: string): string {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function loopSideEffectLedgerPath(root: string, missionId: string): string {
  return loopMutationLedgerPath(root, missionId);
}
