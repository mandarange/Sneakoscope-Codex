import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { syncCoreSkillsIntegrity } from '../codex-native/core-skill-integrity.js';
import { dedupeProjectSkills } from '../codex-native/project-skill-dedupe.js';
import { repairNativeCapabilities } from '../codex-native/native-capability-repair.js';
import { withSecretPreservationGuard } from '../config/config-migration-journal.js';

export interface DoctorNativeCapabilityRepairReport {
  schema: 'sks.doctor-native-capability-repair.v1';
  generated_at: string;
  ok: boolean;
  root: string;
  fix: boolean;
  yes: boolean;
  core_skills: unknown;
  skill_dedupe: unknown;
  native_capabilities: unknown;
  secret_preservation_guard: string;
  blockers: string[];
}

export async function runDoctorNativeCapabilityRepair(input: {
  root: string;
  fix: boolean;
  yes: boolean;
  flags?: string[];
}): Promise<DoctorNativeCapabilityRepairReport> {
  const root = path.resolve(input.root);
  const operation = async () => {
    const coreSkills = await syncCoreSkillsIntegrity({ root, apply: input.fix });
    const skillDedupe = await dedupeProjectSkills({
      root,
      fix: input.fix,
      yes: input.yes,
      quarantineUserDuplicates: (input.flags || []).includes('--quarantine-user-duplicate-skills')
    });
    const nativeCapabilities = await repairNativeCapabilities({
      root,
      fix: input.fix,
      yes: input.yes,
      allowManualInstructions: true
    });
    const blockers = [
      ...((coreSkills as { blockers?: string[] }).blockers || []),
      ...((skillDedupe as { blockers?: string[] }).blockers || []),
      ...((nativeCapabilities as { blockers?: string[] }).blockers || [])
    ];
    const report: DoctorNativeCapabilityRepairReport = {
      schema: 'sks.doctor-native-capability-repair.v1',
      generated_at: nowIso(),
      ok: blockers.length === 0,
      root,
      fix: input.fix,
      yes: input.yes,
      core_skills: coreSkills,
      skill_dedupe: skillDedupe,
      native_capabilities: nativeCapabilities,
      secret_preservation_guard: '.sneakoscope/reports/secret-preservation-guard.json',
      blockers
    };
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'doctor-native-capability-repair.json'), report).catch(() => undefined);
    return report;
  };
  if (!input.fix) return operation();
  return withSecretPreservationGuard(root, 'doctor-native-capability-repair', operation);
}
