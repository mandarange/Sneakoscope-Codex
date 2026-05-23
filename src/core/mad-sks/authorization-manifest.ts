import path from 'node:path';
import { nowIso, sha256 } from '../fsx.js';
import {
  MAD_SKS_AUTHORIZATION_SCHEMA,
  type MadSksPermissionModel,
  type MadSksScope,
  stableJson
} from './permission-model.js';

export interface MadSksAuthorizationManifest {
  schema: typeof MAD_SKS_AUTHORIZATION_SCHEMA;
  ok: boolean;
  user_intent: string;
  target_root: string;
  allowed_scopes: MadSksScope[];
  forbidden_scopes: string[];
  created_at: string;
  expires_at: string | null;
  permission_model_hash: string;
  local_only_artifact_policy: true;
  immutable_harness_guard_required: true;
  rollback_plan_required: true;
  audit_ledger_required: true;
  hash: string;
}

export function createMadSksAuthorizationManifest({
  permission,
  userIntent = 'MAD-SKS user-authorized maintenance',
  expiresAt = null
}: {
  permission: MadSksPermissionModel;
  userIntent?: string;
  expiresAt?: string | null;
}): MadSksAuthorizationManifest {
  const payload = {
    schema: MAD_SKS_AUTHORIZATION_SCHEMA as typeof MAD_SKS_AUTHORIZATION_SCHEMA,
    ok: permission.ok && permission.mode !== 'disabled' && permission.mode !== 'blocked',
    user_intent: userIntent,
    target_root: path.resolve(permission.target_root),
    allowed_scopes: permission.allowed_scopes,
    forbidden_scopes: permission.forbidden_scopes,
    created_at: nowIso(),
    expires_at: expiresAt,
    permission_model_hash: permission.hash,
    local_only_artifact_policy: true as const,
    immutable_harness_guard_required: true as const,
    rollback_plan_required: true as const,
    audit_ledger_required: true as const
  };
  return { ...payload, hash: hashAuthorizationPayload(payload) };
}

export function validateMadSksAuthorizationManifest(value: unknown): { ok: boolean; issues: string[]; manifest: MadSksAuthorizationManifest | null } {
  const manifest = value && typeof value === 'object' ? value as Partial<MadSksAuthorizationManifest> : null;
  const issues: string[] = [];
  if (!manifest) issues.push('authorization_manifest_not_object');
  if (manifest && manifest.schema !== MAD_SKS_AUTHORIZATION_SCHEMA) issues.push(`schema:${manifest.schema || 'missing'}`);
  if (manifest && manifest.ok !== true) issues.push('manifest_not_authorized');
  if (manifest && !manifest.user_intent) issues.push('user_intent_missing');
  if (manifest && !manifest.target_root) issues.push('target_root_missing');
  if (manifest && !Array.isArray(manifest.allowed_scopes)) issues.push('allowed_scopes_missing');
  if (manifest && !Array.isArray(manifest.forbidden_scopes)) issues.push('forbidden_scopes_missing');
  if (manifest && manifest.immutable_harness_guard_required !== true) issues.push('immutable_harness_guard_not_required');
  if (manifest && manifest.rollback_plan_required !== true) issues.push('rollback_plan_not_required');
  if (manifest && manifest.audit_ledger_required !== true) issues.push('audit_ledger_not_required');
  if (manifest && manifest.hash) {
    const { hash: _hash, ...payload } = manifest as Record<string, unknown>;
    if (sha256(stableJson(payload)) !== manifest.hash) issues.push('hash_mismatch');
  } else if (manifest) {
    issues.push('hash_missing');
  }
  return { ok: issues.length === 0, issues, manifest: issues.length === 0 ? manifest as MadSksAuthorizationManifest : null };
}

function hashAuthorizationPayload(payload: Record<string, unknown>): string {
  return sha256(stableJson(payload));
}
