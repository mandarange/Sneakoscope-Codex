import path from 'node:path';
import { COMMAND_CATALOG } from '../routes.js';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { COMMANDS, LEGACY_COMMAND_ALIASES, commandNames } from '../../cli/command-registry.js';

export const COMMAND_ALIAS_CLEANUP_SCHEMA = 'sks.command-alias-cleanup.v1';

export interface DoctorCommandAliasCleanupOptions {
  root: string;
  fix?: boolean;
}

export async function runDoctorCommandAliasCleanup(opts: DoctorCommandAliasCleanupOptions) {
  const report = commandAliasCleanupReport(opts);
  if (opts.fix) await writeJsonAtomic(report.report_path, report);
  return report;
}

export function commandAliasCleanupReport(opts: DoctorCommandAliasCleanupOptions) {
  const root = opts.root;
  const legacyAliases = Object.entries(LEGACY_COMMAND_ALIASES).map(([alias, canonical]) => ({
    alias,
    canonical
  }));
  const registeredAliasCommands = legacyAliases
    .filter((entry) => Object.prototype.hasOwnProperty.call(COMMANDS, entry.alias))
    .map((entry) => entry.alias);
  const catalogAliasRows = legacyAliases
    .filter((entry) => COMMAND_CATALOG.some((row: any) => row.name === entry.alias))
    .map((entry) => entry.alias);
  const canonical = commandNames();
  const missingCanonicalTargets = legacyAliases
    .filter((entry) => !canonical.includes(entry.canonical as any))
    .map((entry) => `${entry.alias}->${entry.canonical}`);
  const blockers = [
    ...registeredAliasCommands.map((alias) => `legacy_alias_registered_as_command:${alias}`),
    ...catalogAliasRows.map((alias) => `legacy_alias_visible_in_command_catalog:${alias}`),
    ...missingCanonicalTargets.map((entry) => `legacy_alias_missing_target:${entry}`)
  ];
  const ok = blockers.length === 0;
  return {
    schema: COMMAND_ALIAS_CLEANUP_SCHEMA,
    ok,
    status: ok ? 'clean' : 'blocked',
    generated_at: nowIso(),
    root,
    fix: Boolean(opts.fix),
    report_path: path.join(root, '.sneakoscope', 'reports', 'command-alias-cleanup.json'),
    canonical_command_count: canonical.length,
    legacy_alias_count: legacyAliases.length,
    aliases: legacyAliases,
    detected: {
      registered_alias_commands: registeredAliasCommands,
      catalog_alias_rows: catalogAliasRows,
      missing_canonical_targets: missingCanonicalTargets
    },
    actions: ok
      ? [{
          action: opts.fix ? 'doctor_fix_verified_aliases_consolidated' : 'verify_aliases_consolidated',
          ok: true,
          detail: 'Legacy command names dispatch through COMMAND_ALIASES and are not registered as duplicate command rows.'
        }]
      : [{
          action: 'source_registry_cleanup_required',
          ok: false,
          detail: 'Remove duplicate alias rows from COMMANDS and COMMAND_CATALOG, then map them through LEGACY_COMMAND_ALIASES.'
        }],
    blockers
  };
}
