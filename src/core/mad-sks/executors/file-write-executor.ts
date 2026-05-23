import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, sha256, writeTextAtomic } from '../../fsx.js';
import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { madSksAuditAction } from '../audit-ledger.js';
import {
  fileContentSnapshot,
  hashFileIfExists,
  pathExists,
  resolveTargetPath,
  resultFromEvidence,
  writeExecutorEvidence,
  writeRollbackSnapshot,
  type MadSksExecutor,
  type MadSksExecutorContext,
  type MadSksExecutorInput
} from './executor-base.js';

export const fileWriteExecutor: MadSksExecutor = {
  id: 'file-write',
  action_type: 'file_write',
  async dryRun(input, context) {
    return runFileWrite(input, context, true);
  },
  async apply(input, context) {
    return runFileWrite(input, context, false);
  }
};

export async function runFileWrite(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const target = resolveTargetPath(context, input.target_path || input.path);
  const operation = String(input.operation || input.action || 'replace');
  const actionType = operation === 'delete' ? 'directory_delete' : 'file_write';
  const guard = await runMadSksGuardMiddleware({
    input: {
      action_type: actionType,
      required_scope: operation === 'delete' ? 'delete' : 'target_files',
      target_path: target,
      dry_run: dryRun
    },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) {
    return resultFromEvidence({
      executor: fileWriteExecutor.id,
      actionType,
      context,
      status: 'blocked',
      blockedActions: [guard],
      blockers: guard.issues
    });
  }

  const before = await fileContentSnapshot(target);
  const snapshotPath = await writeRollbackSnapshot(context, before);
  let nextContent = String(input.content ?? 'MAD-SKS authorized target mutation\n');
  if (operation === 'patch') {
    if (before.content === null) {
      return resultFromEvidence({
        executor: fileWriteExecutor.id,
        actionType,
        context,
        status: 'blocked',
        blockers: ['patch_target_missing']
      });
    }
    const search = String(input.search ?? '');
    if (!search) {
      return resultFromEvidence({
        executor: fileWriteExecutor.id,
        actionType,
        context,
        status: 'blocked',
        blockers: ['patch_search_required']
      });
    }
    if (!before.content.includes(search)) {
      return resultFromEvidence({
        executor: fileWriteExecutor.id,
        actionType,
        context,
        status: 'blocked',
        blockers: ['patch_search_not_found']
      });
    }
    nextContent = before.content.replace(search, String(input.replace ?? input.content ?? ''));
  }
  const beforeHash = before.content_hash;
  let afterHash = beforeHash;
  if (!dryRun) {
    if (operation === 'delete') {
      await fsp.rm(target, { recursive: true, force: true });
      afterHash = null;
    } else if (operation === 'mkdir') {
      await ensureDir(target);
      afterHash = sha256(`dir:${target}`);
    } else {
      await ensureDir(path.dirname(target));
      await writeTextAtomic(target, nextContent);
      afterHash = await hashFileIfExists(target);
    }
  }
  const verification = [{
    kind: 'file_expectation',
    path: target,
    ok: dryRun ? true : operation === 'delete' ? !(await pathExists(target)) : await pathExists(target),
    expected_hash: operation === 'delete' ? null : dryRun ? sha256(nextContent) : afterHash
  }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: fileWriteExecutor.id,
    actionType,
    changedFiles: dryRun ? [] : [target],
    fileRollbacks: [{
      type: 'restore_file',
      path: target,
      existed_before: before.existed_before,
      previous_content_hash: beforeHash,
      snapshot_path: before.content === null ? null : snapshotPath
    }],
    auditActions: [
      madSksAuditAction({
        type: actionType,
        target,
        before_hash: beforeHash,
        after_hash: afterHash,
        rollback_available: true,
        protected_core_impact: 'none',
        notes: dryRun ? ['dry_run_no_write_performed'] : [`operation:${operation}`]
      })
    ],
    verification
  });
  return resultFromEvidence({
    executor: fileWriteExecutor.id,
    actionType,
    context,
    status: dryRun ? 'dry_run' : 'applied',
    changedFiles: dryRun ? [] : [target],
    evidence,
    verification,
    writesPerformed: !dryRun,
    extra: { target_path: target, before_hash: beforeHash, after_hash: afterHash, guard }
  });
}
