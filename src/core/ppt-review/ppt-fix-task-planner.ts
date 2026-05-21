import { nowIso, writeJsonAtomic } from '../fsx.js';
import path from 'node:path';

export const PPT_FIX_TASK_PLAN_ARTIFACT = 'ppt-fix-task-plan.json';

export async function writePptFixTaskPlan(dir: string, deckPath: string | null, deckIssueLedger: any = {}) {
  const plan = planPptFixTasks(deckPath, deckIssueLedger);
  await writeJsonAtomic(path.join(dir, PPT_FIX_TASK_PLAN_ARTIFACT), plan);
  return plan;
}

export function planPptFixTasks(deckPath: string | null, deckIssueLedger: any = {}) {
  const issues = Array.isArray(deckIssueLedger.issues)
    ? deckIssueLedger.issues
    : Array.isArray(deckIssueLedger.slide_issues)
      ? deckIssueLedger.slide_issues
      : [];
  const tasks = issues
    .filter((issue: any) => ['P0', 'P1'].includes(issue.severity) || (issue.severity === 'P2' && cheapLocalSlideFix(issue)))
    .map((issue: any, index: number) => ({
      id: `ppt-fix-task-${index + 1}`,
      issue_id: issue.id,
      deck_path: deckPath,
      slide_id: issue.slide_id,
      slide_index: issue.slide_index,
      target_element: issue.target_element,
      category: issue.category,
      severity: issue.severity,
      expected_visual_delta: issue.fix_action || 'visible slide improvement',
      patch_strategy: patchStrategy(issue, deckPath),
      risk_level: riskLevel(issue),
      requires_human_review: requiresHumanReview(issue, deckPath),
      status: issue.severity === 'P3' ? 'suggestion_only' : deckPath ? 'planned' : 'blocked',
      re_export_required: true,
      re_review_required: true
    }));
  const blockers = [
    ...(!deckPath && tasks.length ? ['deck_edit_method_unavailable'] : []),
    ...(tasks.some((task: any) => task.requires_human_review) ? ['ppt_fix_requires_human_review'] : [])
  ];
  return {
    schema: 'sks.ppt-fix-task-plan.v1',
    created_at: nowIso(),
    deck_path: deckPath,
    tasks,
    p0_p1_task_count: tasks.filter((task: any) => ['P0', 'P1'].includes(task.severity)).length,
    blockers: [...new Set(blockers)],
    passed: blockers.length === 0
  };
}

function cheapLocalSlideFix(issue: any) {
  return /(spacing|alignment|contrast|typography|font|density|label|color|hierarchy|layout)/i.test(`${issue.fix_action || ''} ${issue.detail || ''}`);
}

function patchStrategy(issue: any, deckPath: string | null) {
  if (!deckPath) return 'manual_deck_edit_required';
  if (issue.category === 'brand') return 'human_brand_review_then_manual_deck_edit';
  if (issue.category === 'narrative' || /rewrite|claim|business|brand/i.test(`${issue.fix_action || ''} ${issue.detail || ''}`)) return 'human_content_review_then_manual_deck_edit';
  return 'targeted_slide_edit_then_export_review';
}

function riskLevel(issue: any) {
  if (issue.category === 'brand' || issue.category === 'narrative') return 'medium';
  if (/claim|legal|financial|customer|pricing|security|credential/i.test(`${issue.fix_action || ''} ${issue.detail || ''}`)) return 'high';
  return issue.severity === 'P0' ? 'medium' : 'low';
}

function requiresHumanReview(issue: any, deckPath: string | null) {
  if (!deckPath) return true;
  return riskLevel(issue) !== 'low';
}
