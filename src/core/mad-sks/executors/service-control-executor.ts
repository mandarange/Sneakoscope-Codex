import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { madSksAuditAction } from '../audit-ledger.js';
import { classifyMadSksShellArgv } from '../shell-argv-classifier.js';
import { resultFromEvidence, snapshotProtectedCoreBefore, type MadSksExecutor, type MadSksExecutorContext, type MadSksExecutorInput, writeExecutorEvidence } from './executor-base.js';
import { runShellCommand } from './shell-command-executor.js';

export const serviceControlExecutor: MadSksExecutor = {
  id: 'service-control',
  action_type: 'service_control',
  async dryRun(input, context) {
    return runServiceControl(input, context, true);
  },
  async apply(input, context) {
    return runServiceControl(input, context, false);
  }
};

export async function runServiceControl(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const argv = Array.isArray(input.argv) && input.argv.length ? input.argv.map(String) : serviceArgv(input);
  const classification = await classifyMadSksShellArgv({ argv, cwd: String(input.cwd || context.target_root), targetRoot: context.target_root, root: context.package_root });
  if (classification.route_to_executor !== 'service_control') {
    return resultFromEvidence({
      executor: serviceControlExecutor.id,
      actionType: 'service_control',
      context,
      status: 'blocked',
      blockedActions: [classification],
      blockers: ['service_control_command_required']
    });
  }
  const guard = await runMadSksGuardMiddleware({
    input: { action_type: 'service_control', required_scope: 'service_control', command: argv.join(' '), argv, cwd: String(input.cwd || context.target_root), dry_run: dryRun, high_risk: true },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) {
    return resultFromEvidence({ executor: serviceControlExecutor.id, actionType: 'service_control', context, status: 'blocked', blockedActions: [guard], blockers: guard.issues });
  }
  const previousState = { captured: true, state: dryRun ? 'dry_run_previous_state' : 'unknown_previous_state' };
  const protectedCoreBefore = dryRun ? undefined : await snapshotProtectedCoreBefore(context, serviceControlExecutor.id);
  const shell = await runShellCommand({ ...input, argv, cwd: input.cwd || context.target_root, command: argv, dry_run: dryRun }, context, dryRun);
  const newState = { captured: true, state: dryRun ? 'dry_run_new_state' : shell.ok ? 'command_completed' : 'command_failed' };
  const verification = [{ kind: 'service_command', ok: dryRun || shell.ok, argv, previous_state: previousState, new_state: newState }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: serviceControlExecutor.id,
    actionType: 'service_control',
    ...(protectedCoreBefore ? { beforeSnapshot: protectedCoreBefore } : {}),
    serviceRollbacks: [{ type: 'restore_previous_service_state', previous_state: previousState, command: argv }],
    auditActions: [madSksAuditAction({ type: 'service_control', command: argv.join(' '), rollback_available: true, risk_level: 'high' })],
    verification
  });
  return resultFromEvidence({
    executor: serviceControlExecutor.id,
    actionType: 'service_control',
    context,
    status: dryRun ? 'dry_run' : shell.ok ? 'applied' : 'failed',
    evidence,
    verification,
    blockers: shell.ok || dryRun ? [] : shell.blockers,
    writesPerformed: !dryRun,
    extra: { guard, classification, previous_state: previousState, new_state: newState, shell }
  });
}

function serviceArgv(input: MadSksExecutorInput): string[] {
  const command = String(input.service_command || 'npm');
  if (command === 'npm') return ['npm', 'run', String(input.script || 'dev')];
  return [command, String(input.operation || 'status'), String(input.service || '')].filter(Boolean);
}
