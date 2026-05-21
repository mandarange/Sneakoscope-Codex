import { nowIso } from '../fsx.js';

export const PPT_DECK_ISSUE_LEDGER_ARTIFACT = 'ppt-deck-issue-ledger.json';

export function buildPptDeckIssueLedger({ slideIssueLedger, recheckReport = null }: any = {}) {
  const deduped = dedupeIssues(Array.isArray(slideIssueLedger?.issues) ? slideIssueLedger.issues : []);
  const blocking = deduped.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'resolved', 'recheck_verified'].includes(issue.status));
  const narrativeIssues = deduped.filter((issue: any) => issue.category === 'narrative');
  const blockers = [...(slideIssueLedger?.blockers || [])];
  const recheckComplete = !blocking.length || recheckReport?.changed_slides_rechecked === true || recheckReport?.deck_rechecked === true;
  if (blocking.length && !recheckComplete) blockers.push('ppt_slide_recheck_missing');
  return {
    schema: 'sks.ppt-deck-issue-ledger.v1',
    schema_version: 1,
    created_at: nowIso(),
    issues: deduped,
    issue_count: deduped.length,
    p0_p1_open_count: blocking.length,
    narrative_flow_issue_count: narrativeIssues.length,
    deck_priority: blocking.length ? 'blocking' : deduped.length ? 'reviewed_with_residual_p2_p3' : 'no_visible_issues',
    fix_plan_summary: deduped.map((issue: any) => ({
      issue_id: issue.id,
      slide_index: issue.slide_index,
      deck_priority: ['P0', 'P1'].includes(issue.severity) ? 'must_fix' : issue.severity === 'P2' ? 'fix_if_local' : 'suggestion',
      fix_action: issue.fix_action
    })),
    scorecard: {
      slide_level_blockers_zero: blocking.length === 0,
      narrative_flow: Math.max(0, Number((0.92 - narrativeIssues.length * 0.08).toFixed(2))),
      visual_hierarchy: Math.max(0, Number((0.9 - deduped.filter((issue: any) => issue.category === 'visual_hierarchy').length * 0.05).toFixed(2))),
      accessibility: Math.max(0, Number((0.9 - deduped.filter((issue: any) => issue.category === 'accessibility').length * 0.06).toFixed(2))),
      overall: Math.max(0, Number((0.94 - blocking.length * 0.16 - Math.max(0, deduped.length - blocking.length) * 0.03).toFixed(2)))
    },
    blockers: [...new Set(blockers)],
    passed: slideIssueLedger?.passed === true && blocking.length === 0 && blockers.length === 0 && recheckComplete,
    recheck_complete: recheckComplete
  };
}

function dedupeIssues(issues: any[] = []) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const issue of issues) {
    const key = [issue.slide_id, issue.callout_id, issue.category, issue.target_element, issue.fix_action].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}
