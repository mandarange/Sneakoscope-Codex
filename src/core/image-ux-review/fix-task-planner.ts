export function planImageUxFixTasks(issueLedger: any = {}, opts: any = {}) {
  const issues = Array.isArray(issueLedger.issues) ? issueLedger.issues : [];
  const unresolved = issues
    .filter((issue: any) => !['fixed', 'accepted_not_applicable'].includes(issue.status))
  const tasks = unresolved
    .filter((issue: any) => ['P0', 'P1'].includes(issue.severity) || (issue.severity === 'P2' && cheapLocalFix(issue)))
    .map((issue: any, index: number) => ({
      id: `ux-fix-task-${index + 1}`,
      issue_id: issue.id,
      source_screen_id: issue.source_screen_id,
      callout_id: issue.callout_id,
      candidate_files: Array.isArray(issue.candidate_files) ? issue.candidate_files : [],
      patch_strategy: patchStrategy(issue),
      risk_level: riskLevel(issue),
      requires_human_review: riskLevel(issue) !== 'low' && !opts.allowRisky,
      expected_visual_delta: issue.fix_action || 'visible UI adjustment in the referenced region',
      priority: issue.severity,
      scout_2_verification_input: true,
      wrongness_avoidance_rules: [
        'Do not mark an issue fixed without an actual patch or accepted_not_applicable decision.',
        'Do not auto-apply risky patches or DB/destructive operations from visual review.',
        'Recapture and re-review changed screens before verified visual fix claims.'
      ],
      status: issue.severity === 'P3' ? 'suggestion_only' : 'planned'
    }));
  const blockers = tasks.length || unresolved.length === 0 ? [] : ['no_fixable_issues'];
  return {
    schema: 'sks.image-ux-fix-task-plan.v1',
    tasks,
    blockers,
    passed: blockers.length === 0,
    p0_p1_task_count: tasks.filter((task: any) => ['P0', 'P1'].includes(task.priority)).length
  };
}

function cheapLocalFix(issue: any) {
  const text = `${issue.fix_action || ''} ${issue.detail || ''}`;
  return /(spacing|padding|margin|contrast|label|copy|alignment|size|color|density|간격|문구|라벨|색|정렬)/i.test(text);
}

function patchStrategy(issue: any) {
  if (!issue.candidate_files?.length) return 'requires_candidate_file_scout';
  if (issue.severity === 'P0' || issue.severity === 'P1') return 'targeted_ui_patch_then_recapture';
  if (cheapLocalFix(issue)) return 'cheap_local_patch_then_recapture';
  return 'suggestion_only';
}

function riskLevel(issue: any) {
  if (/db|database|migration|auth|payment|delete|drop|truncate|credential/i.test(`${issue.fix_action || ''} ${issue.detail || ''}`)) return 'high';
  if (!issue.candidate_files?.length) return 'medium';
  return issue.severity === 'P0' ? 'medium' : 'low';
}
