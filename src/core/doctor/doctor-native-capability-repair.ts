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
  core_blockers: string[];
  route_blockers: Record<string, string[]>;
  optional_manual_required: string[];
  optional_warnings: string[];
  blockers: string[];
  report_write_failed?: boolean;
}

export async function runDoctorNativeCapabilityRepair(input: {
  root: string;
  fix: boolean;
  yes: boolean;
  flags?: string[];
  skipNativeCapabilities?: boolean;
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
    const nativeCapabilities = input.skipNativeCapabilities === true
      ? skippedNativeCapabilityDiagnostics(root)
      : await repairNativeCapabilities({
          root,
          fix: input.fix,
          yes: input.yes,
          allowManualInstructions: true
        });
    const blockers = [
      ...((coreSkills as { blockers?: string[] }).blockers || []),
      ...((skillDedupe as { blockers?: string[] }).blockers || []),
      ...((nativeCapabilities as { core_blockers?: string[]; blockers?: string[] }).core_blockers || (nativeCapabilities as { blockers?: string[] }).blockers || [])
    ];
    const routeBlockers = (nativeCapabilities as { route_blockers?: Record<string, string[]> }).route_blockers || {};
    const optionalManualRequired = (nativeCapabilities as { optional_manual_required?: string[] }).optional_manual_required || [];
    const optionalWarnings = [
      ...((nativeCapabilities as { warnings?: string[] }).warnings || []),
      ...optionalManualRequired.map((id) => `${id}_manual_required`)
    ];
    let report: DoctorNativeCapabilityRepairReport = {
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
      core_blockers: blockers,
      route_blockers: routeBlockers,
      optional_manual_required: optionalManualRequired,
      optional_warnings: [...new Set(optionalWarnings)],
      blockers
    };
    const reportPath = path.join(root, '.sneakoscope', 'reports', 'doctor-native-capability-repair.json');
    try {
      await writeJsonAtomic(reportPath, report);
    } catch (err: unknown) {
      report = { ...report, report_write_failed: true };
      process.stderr.write(`SKS doctor warning: failed to write native capability repair report ${reportPath}: ${messageOf(err)}\n`);
    }
    return report;
  };
  if (!input.fix) return operation();
  return withSecretPreservationGuard(root, 'doctor-native-capability-repair', operation);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function skippedNativeCapabilityDiagnostics(root: string) {
  return {
    schema: 'sks.native-capability-repair-matrix.v1',
    generated_at: nowIso(),
    ok: true,
    root,
    skipped: true,
    reason: 'optional_native_capabilities_deferred_to_doctor_capabilities_or_route_gate',
    capabilities: [],
    core_blockers: [],
    route_blockers: {
      'route-computer-use': ['computer_use_os_permission_or_capability_unknown'],
      'route-chrome-web-review': ['codex_chrome_extension_readiness_not_verified']
    },
    optional_manual_required: ['computer_use', 'chrome_web_review'],
    blockers: [],
    warnings: [
      'computer_use_manual_required_before_route',
      'chrome_extension_manual_required_before_browser_route',
      'optional_native_capability_diagnostics_skipped'
    ]
  };
}
