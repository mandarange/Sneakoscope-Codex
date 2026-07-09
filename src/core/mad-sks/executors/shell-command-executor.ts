import { spawn } from 'node:child_process';
import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { classifyMadSksShellArgv } from '../shell-argv-classifier.js';
import { madSksAuditAction } from '../audit-ledger.js';
import { redactMadSksSecrets } from '../write-guard.js';
import {
  redactedCommand,
  resultFromEvidence,
  snapshotProtectedCoreBefore,
  writeExecutorEvidence,
  type MadSksExecutor,
  type MadSksExecutorContext,
  type MadSksExecutorInput
} from './executor-base.js';

export const shellCommandExecutor: MadSksExecutor = {
  id: 'shell-command',
  action_type: 'shell_command',
  async dryRun(input, context) {
    return runShellCommand(input, context, true);
  },
  async apply(input, context) {
    return runShellCommand(input, context, false);
  }
};

export async function runShellCommand(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const argv = Array.isArray(input.argv) && input.argv.length
    ? input.argv.map(String)
    : Array.isArray(input.command)
      ? input.command.map(String)
      : [];
  const command = typeof input.command === 'string' ? input.command : argv.join(' ');
  const cwd = String(input.cwd || context.target_root);
  const classification = await classifyMadSksShellArgv({ command, argv: argv.length ? argv : null, cwd, targetRoot: context.target_root, root: context.package_root });
  const guard = await runMadSksGuardMiddleware({
    input: {
      action_type: 'shell_command',
      required_scope: classification.route_to_executor === 'package_install'
        ? 'package_install'
        : classification.route_to_executor === 'service_control'
          ? 'service_control'
          : classification.route_to_executor === 'db_write'
            ? 'db_write'
            : 'shell',
      command,
      argv: argv.length ? argv : null,
      cwd,
      dry_run: dryRun,
      allow_rollback_unavailable: true
    },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) {
    return resultFromEvidence({
      executor: shellCommandExecutor.id,
      actionType: 'shell_command',
      context,
      status: 'blocked',
      blockedActions: [guard, classification],
      blockers: guard.issues
    });
  }
  if (dryRun) {
    const verification = [{ kind: 'classification', ok: true, classification }];
    const evidence = await writeExecutorEvidence({
      context,
      executor: shellCommandExecutor.id,
      actionType: 'shell_command',
      rollbackUnavailable: ['shell_command_rollback_unavailable_until_command_specific_plan'],
      auditActions: [madSksAuditAction({ type: 'shell_command', command: redactedCommand(input.command as any), rollback_available: false, risk_level: classification.risk_level })],
      verification
    });
    return resultFromEvidence({ executor: shellCommandExecutor.id, actionType: 'shell_command', context, status: 'dry_run', evidence, verification, extra: { classification, guard } });
  }
  if (!argv.length) {
    return resultFromEvidence({
      executor: shellCommandExecutor.id,
      actionType: 'shell_command',
      context,
      status: 'blocked',
      blockers: ['argv_array_required_for_apply'],
      blockedActions: [classification]
    });
  }
  const protectedCoreBefore = await snapshotProtectedCoreBefore(context, shellCommandExecutor.id);
  const started = Date.now();
  const run = await spawnArgv(argv, cwd);
  const duration = Date.now() - started;
  const verification = [{ kind: 'exit_code', ok: run.code === 0, code: run.code }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: shellCommandExecutor.id,
    actionType: 'shell_command',
    beforeSnapshot: protectedCoreBefore,
    rollbackUnavailable: ['shell_command_rollback_unavailable'],
    auditActions: [madSksAuditAction({
      type: 'shell_command',
      command: redactedCommand(argv),
      duration_ms: duration,
      exit_code: run.code,
      rollback_available: false,
      risk_level: classification.risk_level,
      notes: [`stdout:${redactMadSksSecrets(run.stdout).slice(-1000)}`, `stderr:${redactMadSksSecrets(run.stderr).slice(-1000)}`]
    })],
    verification
  });
  return resultFromEvidence({
    executor: shellCommandExecutor.id,
    actionType: 'shell_command',
    context,
    status: run.code === 0 ? 'applied' : 'failed',
    evidence,
    verification,
    blockers: run.code === 0 ? [] : [`exit_code:${run.code}`],
    writesPerformed: true,
    extra: { classification, guard, stdout_tail: redactMadSksSecrets(run.stdout).slice(-2000), stderr_tail: redactMadSksSecrets(run.stderr).slice(-2000) }
  });
}

function spawnArgv(argv: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const bin = argv[0];
    if (!bin) {
      resolve({ code: 127, stdout: '', stderr: 'argv[0] is required' });
      return;
    }
    const child = spawn(bin, argv.slice(1), { cwd, shell: false, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += String(chunk); });
    child.on('error', (err: Error) => resolve({ code: 127, stdout, stderr: `${stderr}\n${err.message}` }));
    child.on('close', (code: number | null) => resolve({ code, stdout, stderr }));
  });
}
