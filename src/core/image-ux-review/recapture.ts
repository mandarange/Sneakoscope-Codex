export function buildRecapturePlan(fixLoop: any = {}, opts: any = {}) {
  const changedFiles = Array.isArray(fixLoop.changed_files) ? fixLoop.changed_files : [];
  const recaptureRequired = fixLoop.recapture_required === true || changedFiles.length > 0;
  const computerUseAvailable = opts.computerUseAvailable === true;
  const blockers = recaptureRequired && !computerUseAvailable && !opts.userScreenshot
    ? ['manual_recapture_required']
    : [];
  return {
    schema: 'sks.image-ux-recapture-plan.v2',
    changed_screens_only: true,
    recapture_required: recaptureRequired,
    recapture_source: recaptureRequired
      ? computerUseAvailable ? 'codex_computer_use' : opts.userScreenshot ? 'user_provided_screenshot' : 'blocked'
      : 'not_applicable',
    recaptured_screenshot_sha256: opts.recapturedSha256 || null,
    recaptured_screenshot_dimensions: opts.recapturedDimensions || null,
    before_after_relation_required: recaptureRequired,
    gpt_image_2_re_review_required: recaptureRequired,
    output_schema_recheck_required: recaptureRequired,
    attach_after_command: 'sks ux-review attach-after --image <path> --json',
    after_screenshot: opts.userScreenshot ? {
      path: opts.userScreenshot,
      sha256: opts.recapturedSha256 || null,
      dimensions: opts.recapturedDimensions || null,
      privacy: 'local-only'
    } : null,
    before_after_relation_created: recaptureRequired && Boolean(opts.userScreenshot || opts.computerUseAvailable),
    re_review_required: recaptureRequired,
    re_review_issue_ledger_required: recaptureRequired,
    regression_blocker: Number(opts.newP0P1Issues || 0) > 0 ? 'after_recheck_regression' : null,
    changed_screens_rechecked_or_not_applicable: !recaptureRequired || blockers.length === 0,
    blockers: [...blockers, ...(Number(opts.newP0P1Issues || 0) > 0 ? ['after_recheck_regression'] : [])],
    passed: blockers.length === 0 && Number(opts.newP0P1Issues || 0) === 0
  };
}

export function compareReReviewIssues(beforeLedger: any = {}, afterLedger: any = {}) {
  const before = Array.isArray(beforeLedger.issues) ? beforeLedger.issues : [];
  const after = Array.isArray(afterLedger.issues) ? afterLedger.issues : [];
  const openBeforeP0P1 = before.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status));
  const openAfterP0P1 = after.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status));
  return {
    schema: 'sks.image-ux-recheck-compare.v1',
    before_open_p0_p1: openBeforeP0P1.length,
    after_open_p0_p1: openAfterP0P1.length,
    original_issues_cleared: openBeforeP0P1.every((issue: any) => !openAfterP0P1.some((afterIssue: any) => afterIssue.id === issue.id || afterIssue.post_fix_recheck_issue_id === issue.id)),
    new_p0_p1_regressions: openAfterP0P1.filter((issue: any) => !before.some((beforeIssue: any) => beforeIssue.id === issue.id)).length,
    passed: openAfterP0P1.length === 0
  };
}
