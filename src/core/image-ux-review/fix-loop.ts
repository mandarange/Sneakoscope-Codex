import { detectRepeatedBlocker } from '../loop-blocker.js';

export function runImageUxFixLoop(issueLedger: any = {}, taskPlan: any = {}, opts: any = {}) {
  const tasks = Array.isArray(taskPlan.tasks) ? taskPlan.tasks : [];
  const blockerEvents = Array.isArray(opts.blockerEvents) ? opts.blockerEvents : [];
  const repeated = detectRepeatedBlocker(blockerEvents, 2);
  const risky = tasks.filter((task: any) => task.requires_human_review || task.risk_level === 'high');
  const patchable = tasks.filter((task: any) => !task.requires_human_review && task.risk_level !== 'high');
  const patchApplied = opts.patchApplied === true;
  const blockers = [
    ...(repeated.stop_required ? ['repeated_blocker_stop'] : []),
    ...(risky.length ? ['risky_patch_requires_human_review'] : []),
    ...(tasks.length && !patchApplied && opts.requirePatch ? ['patch_not_applied'] : [])
  ];
  return {
    schema: 'sks.image-ux-fix-loop.v1',
    max_full_surface_passes: Number(opts.maxFullSurfacePasses || 2),
    max_screen_retries: Number(opts.maxScreenRetries || 2),
    priority_order: ['P0', 'P1', 'P2', 'P3'],
    db_destructive_operations_allowed: false,
    dirty_status_before_patch: opts.gitDirtyStatus || null,
    changed_files: Array.isArray(opts.changedFiles) ? opts.changedFiles : [],
    patch_commands: Array.isArray(opts.patchCommands) ? opts.patchCommands : [],
    patchable_tasks: patchable.length,
    risky_tasks_blocked: risky.length,
    repeated_blocker: repeated,
    recapture_required: patchApplied,
    no_op_patch_wrongness: opts.noopPatch === true,
    blockers,
    passed: blockers.length === 0,
    issue_status_policy: 'Never set fixed without patch evidence or accepted_not_applicable decision.',
    result_status: blockers.length ? 'blocked' : patchApplied ? 'patched_recapture_required' : 'no_patch_needed_or_not_requested',
    issue_count: Array.isArray(issueLedger.issues) ? issueLedger.issues.length : 0
  };
}
