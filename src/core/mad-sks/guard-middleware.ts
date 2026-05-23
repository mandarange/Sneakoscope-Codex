import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, packageRoot } from '../fsx.js';
import { validateMadSksAuthorizationManifest, type MadSksAuthorizationManifest } from './authorization-manifest.js';
import { evaluateMadSksWrite } from './immutable-harness-guard.js';
import { type MadSksPermissionModel, type MadSksScope } from './permission-model.js';
import { classifyMadSksShellArgv } from './shell-argv-classifier.js';
import { guardMadSksFileOperation, type MadSksActionType } from './write-guard.js';

export const MAD_SKS_GUARD_MIDDLEWARE_SCHEMA = 'sks.mad-sks-guard-middleware.v1';

export interface MadSksGuardInput {
  action_type: MadSksActionType;
  required_scope: MadSksScope;
  target_path?: string | null;
  command?: string | null;
  argv?: string[] | null;
  cwd?: string | null;
  dry_run?: boolean;
  high_risk?: boolean;
  allow_rollback_unavailable?: boolean;
}

export async function runMadSksGuardMiddleware({
  input,
  permission,
  authorizationManifest,
  targetRoot,
  root = packageRoot()
}: {
  input: MadSksGuardInput;
  permission: MadSksPermissionModel;
  authorizationManifest: MadSksAuthorizationManifest | null;
  targetRoot: string;
  root?: string;
}) {
  const issues: string[] = [];
  const resolvedTargetRoot = path.resolve(targetRoot || permission?.target_root || process.cwd());
  const authValidation = validateMadSksAuthorizationManifest(authorizationManifest);
  if (!authValidation.ok) issues.push('authorization_manifest_invalid', ...authValidation.issues);
  if (!permission?.ok) issues.push('permission_model_not_ok');
  if (!permission?.allowed_scopes?.includes(input.required_scope)) issues.push(`scope_not_allowed:${input.required_scope}`);
  if (permission?.forbidden_scopes?.length === 0) issues.push('forbidden_scopes_missing');

  const targetBoundary = input.target_path
    ? await evaluateTargetBoundary(input.target_path, resolvedTargetRoot)
    : { ok: true, path: null, real_path: null, reason: null };
  if (!targetBoundary.ok) issues.push(targetBoundary.reason || 'target_boundary_failed');

  const immutable = input.target_path
    ? await evaluateMadSksWrite({
        packageRoot: root,
        targetRoot: resolvedTargetRoot,
        operation: input.action_type,
        path: input.target_path
      })
    : null;
  if (immutable && immutable.decision !== 'allowed') issues.push(immutable.reason || 'immutable_harness_guard_blocked');

  const fileGuard = input.target_path
    ? await guardMadSksFileOperation({ targetPath: input.target_path, operation: input.action_type, root })
    : null;
  if (fileGuard && fileGuard.action === 'block') issues.push(...fileGuard.reasons);

  const shell = input.command || input.argv?.length
    ? await classifyMadSksShellArgv({
        command: input.command || '',
        argv: input.argv || null,
        cwd: input.cwd || resolvedTargetRoot,
        targetRoot: resolvedTargetRoot,
        root
      })
    : null;
  if (shell?.action === 'block') issues.push(...shell.reasons);
  if (shell?.reasons?.includes('cwd_outside_target_root') && !permission.flags.allowSystem) issues.push('cwd_outside_target_root_requires_allow_system');
  if (shell?.reasons?.includes('admin_or_sudo') && !permission.flags.allowAdmin) issues.push('admin_command_requires_allow_admin');
  if (shell?.reasons?.includes('delete_command') && (!permission.flags.allowDelete || !permission.flags.separateDeleteConfirmation)) {
    issues.push('delete_command_requires_allow_delete_and_confirm_delete');
  }
  if (shell?.reasons?.includes('file_permission_change') && !permission.flags.allowFilePermissions) issues.push('chmod_requires_allow_file_permissions');
  if (shell?.reasons?.includes('file_ownership_change') && !permission.flags.allowFilePermissions) issues.push('chown_requires_allow_file_permissions');
  if (shell?.action === 'confirm' && !permission.flags.yes && !input.dry_run) issues.push('shell_high_risk_confirmation_required');
  if (permission.high_risk_confirmation_required && !permission.flags.yes && !input.dry_run) {
    issues.push('high_risk_final_confirmation_required');
  }
  if (input.high_risk && !permission.flags.yes && !input.dry_run) issues.push('executor_high_risk_confirmation_required');

  return {
    schema: MAD_SKS_GUARD_MIDDLEWARE_SCHEMA,
    ok: issues.length === 0,
    status: issues.length ? 'blocked' : input.dry_run ? 'dry_run_passed' : 'passed',
    generated_at: nowIso(),
    action_type: input.action_type,
    required_scope: input.required_scope,
    target_root: resolvedTargetRoot,
    authorization_manifest_hash: authorizationManifest?.hash || null,
    permission_model_hash: permission?.hash || null,
    target_boundary: targetBoundary,
    immutable_harness_guard: immutable,
    write_guard: fileGuard,
    shell_classification: shell,
    rollback_requirement: {
      required: permission?.rollback_required_for?.includes(input.required_scope) === true,
      unavailable_allowed: input.allow_rollback_unavailable === true
    },
    secret_redaction_status: 'applied',
    issues
  };
}

async function evaluateTargetBoundary(candidate: string, targetRoot: string) {
  const resolved = path.resolve(candidate);
  const target = path.resolve(targetRoot);
  const real = await realPathForCheck(resolved);
  const realTarget = await realPathForCheck(target);
  const directInside = isInside(resolved, target);
  const realInside = isInside(real, realTarget);
  return {
    ok: directInside && realInside,
    path: resolved,
    real_path: real,
    target_root: target,
    real_target_root: realTarget,
    reason: directInside && realInside ? null : 'target_root_boundary_escape',
    symlink_escape_attempt: directInside && !realInside
  };
}

async function realPathForCheck(candidate: string) {
  try {
    return await fsp.realpath(candidate);
  } catch {
    const suffix = [];
    let current = path.resolve(candidate);
    while (current !== path.dirname(current)) {
      const parent = path.dirname(current);
      suffix.unshift(path.basename(current));
      try {
        const realParent = await fsp.realpath(parent);
        return path.join(realParent, ...suffix);
      } catch {
        current = parent;
      }
    }
    return path.resolve(candidate);
  }
}

function isInside(candidate: string, root: string) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
