import path from 'node:path';
import { nowIso, sha256 } from '../fsx.js';

export const MAD_SKS_PERMISSION_MODEL_SCHEMA = 'sks.mad-sks-permission-model.v1';
export const MAD_SKS_AUTHORIZATION_SCHEMA = 'sks.mad-sks-authorization.v1';

export type MadSksMode = 'disabled' | 'plan_only' | 'authorized' | 'full_system_authority' | 'blocked';
export type MadSksScope =
  | 'target_files'
  | 'shell'
  | 'system'
  | 'db_write'
  | 'package_install'
  | 'service_control'
  | 'admin'
  | 'network'
  | 'computer_use'
  | 'browser_use'
  | 'generated_assets'
  | 'file_permissions'
  | 'delete';

export interface MadSksFlagSet {
  madSks: boolean;
  allowSystem: boolean;
  allowDbWrite: boolean;
  allowPackageInstall: boolean;
  allowServiceControl: boolean;
  allowAdmin: boolean;
  allowNetwork: boolean;
  allowComputerUse: boolean;
  allowDelete: boolean;
  allowBrowserUse: boolean;
  allowGeneratedAssets: boolean;
  allowFilePermissions: boolean;
  yes: boolean;
  dryRun: boolean;
  planOnly: boolean;
  separateDeleteConfirmation: boolean;
}

export interface MadSksPermissionModel {
  schema: typeof MAD_SKS_PERMISSION_MODEL_SCHEMA;
  ok: boolean;
  mode: MadSksMode;
  generated_at: string;
  target_root: string;
  user_intent: string | null;
  flags: MadSksFlagSet;
  allowed_scopes: MadSksScope[];
  denied_scopes: MadSksScope[];
  required_flags: Record<string, string>;
  forbidden_scopes: string[];
  immutable_harness_guard: 'always_on';
  secret_redaction_required: true;
  rollback_required_for: MadSksScope[];
  audit_required_for: MadSksScope[];
  high_risk_confirmation_required: boolean;
  blockers: string[];
  authorization_manifest_schema: typeof MAD_SKS_AUTHORIZATION_SCHEMA;
  hash: string;
}

export const MAD_SKS_DEFAULT_FORBIDDEN_SCOPES = Object.freeze([
  'sks_harness_code',
  'sks_package_root_mutation',
  'sks_dist_runtime_mutation',
  'sks_release_metadata_mutation',
  'sks_managed_hook_core_mutation',
  'credential_exfiltration',
  'persistent_security_weakening',
  'third_party_system_intrusion',
  'unrequested_fallback_implementation',
  'whole_database_drop',
  'whole_schema_drop',
  'whole_table_drop',
  'truncate',
  'all_row_delete',
  'all_row_update',
  'dangerous_project_or_branch_management'
] as const);

const ALL_SCOPES: MadSksScope[] = [
  'target_files',
  'shell',
  'system',
  'db_write',
  'package_install',
  'service_control',
  'admin',
  'network',
  'computer_use',
  'browser_use',
  'generated_assets',
  'file_permissions',
  'delete'
];

export function defaultMadSksFlags(overrides: Partial<MadSksFlagSet> = {}): MadSksFlagSet {
  return {
    madSks: false,
    allowSystem: false,
    allowDbWrite: false,
    allowPackageInstall: false,
    allowServiceControl: false,
    allowAdmin: false,
    allowNetwork: false,
    allowComputerUse: false,
    allowDelete: false,
    allowBrowserUse: false,
    allowGeneratedAssets: false,
    allowFilePermissions: false,
    yes: false,
    dryRun: false,
    planOnly: false,
    separateDeleteConfirmation: false,
    ...overrides
  };
}

export function parseMadSksFlags(args: readonly unknown[] = []): MadSksFlagSet {
  const set = new Set(args.map((arg) => String(arg)));
  return defaultMadSksFlags({
    madSks: set.has('--mad-sks') || set.has('--mad') || set.has('--MAD'),
    allowSystem: set.has('--allow-system'),
    allowDbWrite: set.has('--allow-db-write'),
    allowPackageInstall: set.has('--allow-package-install'),
    allowServiceControl: set.has('--allow-service-control'),
    allowAdmin: set.has('--allow-admin') || set.has('--allow-sudo'),
    allowNetwork: set.has('--allow-network'),
    allowComputerUse: set.has('--allow-computer-use'),
    allowDelete: set.has('--allow-delete'),
    allowBrowserUse: set.has('--allow-browser') || set.has('--allow-browser-use'),
    allowGeneratedAssets: set.has('--allow-generated-assets'),
    allowFilePermissions: set.has('--allow-file-permissions') || set.has('--allow-chmod'),
    yes: set.has('--yes') || set.has('-y'),
    dryRun: set.has('--dry-run'),
    planOnly: set.has('--plan-only') || set.has('plan'),
    separateDeleteConfirmation: set.has('--confirm-delete') || set.has('--confirm-destructive-delete')
  });
}

export function buildMadSksPermissionModel({
  targetRoot = process.cwd(),
  userIntent = null,
  flags = defaultMadSksFlags(),
  forbiddenScopes = MAD_SKS_DEFAULT_FORBIDDEN_SCOPES
}: {
  targetRoot?: string;
  userIntent?: string | null;
  flags?: MadSksFlagSet;
  forbiddenScopes?: readonly string[];
} = {}): MadSksPermissionModel {
  const resolvedRoot = path.resolve(targetRoot || process.cwd());
  const blockers: string[] = [];
  const allowed = new Set<MadSksScope>();
  const denied = new Set<MadSksScope>(ALL_SCOPES);
  const requiredFlags: Record<string, string> = {};

  if (!flags.madSks) blockers.push('mad_sks_flag_required');
  if (flags.madSks) allow('target_files');
  if (flags.madSks) allow('shell');
  gate('system', flags.allowSystem, '--allow-system');
  gate('db_write', flags.allowDbWrite, '--allow-db-write');
  gate('package_install', flags.allowPackageInstall, '--allow-package-install');
  gate('service_control', flags.allowServiceControl, '--allow-service-control');
  gate('admin', flags.allowAdmin, '--allow-admin');
  gate('network', flags.allowNetwork, '--allow-network');
  gate('computer_use', flags.allowComputerUse, '--allow-computer-use');
  gate('browser_use', flags.allowBrowserUse, '--allow-browser-use');
  gate('generated_assets', flags.allowGeneratedAssets, '--allow-generated-assets');
  gate('file_permissions', flags.allowFilePermissions, '--allow-file-permissions');
  gate('delete', flags.allowDelete && flags.separateDeleteConfirmation, '--allow-delete + --confirm-delete');

  if (flags.allowDelete && !flags.separateDeleteConfirmation) {
    blockers.push('destructive_delete_requires_separate_confirmation');
  }
  if (!resolvedRoot || resolvedRoot === path.parse(resolvedRoot).root) {
    blockers.push('target_root_must_not_be_filesystem_root');
  }

  const highRisk = flags.allowAdmin || flags.allowDelete || flags.allowServiceControl || flags.allowDbWrite;
  const fullSystem =
    flags.madSks
    && flags.allowSystem
    && flags.allowDbWrite
    && flags.allowPackageInstall
    && flags.allowServiceControl
    && flags.allowNetwork
    && flags.allowComputerUse;
  const mode: MadSksMode = blockers.some((blocker) => blocker !== 'destructive_delete_requires_separate_confirmation')
    ? 'blocked'
    : !flags.madSks
      ? 'disabled'
      : flags.planOnly || flags.dryRun
        ? 'plan_only'
        : fullSystem
          ? 'full_system_authority'
          : 'authorized';

  const payload = {
    schema: MAD_SKS_PERMISSION_MODEL_SCHEMA as typeof MAD_SKS_PERMISSION_MODEL_SCHEMA,
    ok: blockers.length === 0 || mode === 'plan_only',
    mode,
    generated_at: nowIso(),
    target_root: resolvedRoot,
    user_intent: userIntent,
    flags,
    allowed_scopes: [...allowed],
    denied_scopes: [...denied],
    required_flags: requiredFlags,
    forbidden_scopes: [...forbiddenScopes],
    immutable_harness_guard: 'always_on' as const,
    secret_redaction_required: true as const,
    rollback_required_for: [...allowed].filter((scope) => scope !== 'shell' && scope !== 'network'),
    audit_required_for: [...allowed],
    high_risk_confirmation_required: highRisk && !flags.yes,
    blockers,
    authorization_manifest_schema: MAD_SKS_AUTHORIZATION_SCHEMA as typeof MAD_SKS_AUTHORIZATION_SCHEMA
  };
  return { ...payload, hash: sha256(stableJson(payload)) };

  function allow(scope: MadSksScope) {
    allowed.add(scope);
    denied.delete(scope);
  }

  function gate(scope: MadSksScope, ok: boolean, flag: string) {
    if (flags.madSks && ok) {
      allow(scope);
      return;
    }
    requiredFlags[scope] = flag;
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
