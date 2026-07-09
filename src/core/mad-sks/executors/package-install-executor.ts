import path from 'node:path';
import {
  fileContentSnapshot,
  hashFileIfExists,
  resultFromEvidence,
  snapshotProtectedCoreBefore,
  type MadSksExecutor,
  type MadSksExecutorContext,
  type MadSksExecutorInput,
  writeExecutorEvidence,
  writeRollbackSnapshot
} from './executor-base.js';
import { runShellCommand } from './shell-command-executor.js';
import { madSksAuditAction } from '../audit-ledger.js';
import { classifyMadSksShellArgv } from '../shell-argv-classifier.js';

export const packageInstallExecutor: MadSksExecutor = {
  id: 'package-install',
  action_type: 'package_install',
  async dryRun(input, context) {
    return runPackageInstall(input, context, true);
  },
  async apply(input, context) {
    return runPackageInstall(input, context, false);
  }
};

export async function runPackageInstall(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const argv = Array.isArray(input.argv) && input.argv.length ? input.argv.map(String) : packageArgv(input);
  const cwd = String(input.cwd || context.target_root);
  if (path.resolve(context.target_root) === path.resolve(context.package_root)) {
    return resultFromEvidence({
      executor: packageInstallExecutor.id,
      actionType: 'package_install',
      context,
      status: 'blocked',
      blockers: ['sks_package_root_package_install_blocked']
    });
  }
  const classification = await classifyMadSksShellArgv({ argv, cwd, targetRoot: context.target_root, root: context.package_root });
  if (classification.route_to_executor !== 'package_install') {
    return resultFromEvidence({
      executor: packageInstallExecutor.id,
      actionType: 'package_install',
      context,
      status: 'blocked',
      blockedActions: [classification],
      blockers: ['package_manager_command_required']
    });
  }
  const manifests = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'Cargo.toml', 'Cargo.lock', 'requirements.txt', 'pyproject.toml']
    .map((file) => path.join(context.target_root, file));
  const before = await Promise.all(manifests.map(async (file) => ({ path: file, hash: await hashFileIfExists(file) })));
  const beforeSnapshots = await Promise.all(manifests.map(async (file) => fileContentSnapshot(file)));
  const rollbackSnapshots = await Promise.all(beforeSnapshots.map(async (snapshot) => ({
    snapshot,
    snapshot_path: snapshot.content === null ? null : await writeRollbackSnapshot(context, snapshot)
  })));
  const protectedCoreBefore = dryRun ? undefined : await snapshotProtectedCoreBefore(context, packageInstallExecutor.id);
  const shell = await runShellCommand({ ...input, argv, cwd, command: argv, dry_run: dryRun }, context, dryRun);
  const after = await Promise.all(manifests.map(async (file) => ({ path: file, hash: await hashFileIfExists(file) })));
  const changed = after.filter((entry, index) => entry.hash !== before[index]?.hash).map((entry) => entry.path);
  const verification = [{ kind: 'package_manifest_hashes', ok: dryRun || shell.ok, before, after }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: packageInstallExecutor.id,
    actionType: 'package_install',
    ...(protectedCoreBefore ? { beforeSnapshot: protectedCoreBefore } : {}),
    changedFiles: changed,
    packageRollbacks: rollbackSnapshots
      .filter((entry) => entry.snapshot.content_hash)
      .map((entry) => ({
        type: 'restore_manifest_or_lock',
        path: entry.snapshot.path,
        existed_before: entry.snapshot.existed_before,
        previous_hash: entry.snapshot.content_hash,
        snapshot_path: entry.snapshot_path
      })),
    auditActions: [madSksAuditAction({ type: 'package_install', command: argv.join(' '), rollback_available: true, risk_level: 'medium', notes: [`shell_status:${shell.status}`] })],
    verification
  });
  return resultFromEvidence({
    executor: packageInstallExecutor.id,
    actionType: 'package_install',
    context,
    status: dryRun ? 'dry_run' : shell.ok ? 'applied' : 'failed',
    changedFiles: changed,
    evidence,
    verification,
    blockers: shell.ok || dryRun ? [] : shell.blockers,
    writesPerformed: !dryRun,
    extra: { shell, classification }
  });
}

function packageArgv(input: MadSksExecutorInput): string[] {
  const manager = String(input.manager || 'npm');
  const operation = String(input.operation || 'install');
  const packages = Array.isArray(input.packages) ? input.packages.map(String) : [];
  return [manager, operation, ...packages];
}
