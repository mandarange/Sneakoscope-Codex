export function buildRecapturePlan(fixLoop: any = {}, opts: any = {}) {
  const changedFiles = Array.isArray(fixLoop.changed_files) ? fixLoop.changed_files : [];
  const recaptureRequired = fixLoop.recapture_required === true || changedFiles.length > 0;
  const computerUseAvailable = opts.computerUseAvailable === true;
  const blockers = recaptureRequired && !computerUseAvailable && !opts.userScreenshot
    ? ['manual_recapture_required']
    : [];
  return {
    schema: 'sks.image-ux-recapture-plan.v1',
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
    changed_screens_rechecked_or_not_applicable: !recaptureRequired || blockers.length === 0,
    blockers,
    passed: blockers.length === 0
  };
}
