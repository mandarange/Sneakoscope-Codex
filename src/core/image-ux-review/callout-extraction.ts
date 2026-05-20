import { validateBbox } from '../wiki-image/bbox.js';
import { detectCodexExecResumeOutputSchema } from '../codex-exec-output-schema.js';

const ISSUE_STATUSES = new Set(['open', 'fixed', 'accepted_not_applicable', 'blocked', 'needs_human', 'suggestion_only', 'remains_open']);
const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);

export async function outputSchemaExtractionPreference() {
  const availability = await detectCodexExecResumeOutputSchema().catch(() => null);
  return {
    preferred: availability?.output_schema_supported === true,
    availability,
    fallback_cap: availability?.output_schema_supported === true ? 'verified' : 'verified_partial'
  };
}

export function buildIssueLedgerFromGeneratedCallouts(generatedReviewLedger: any = {}, existing: any = null) {
  const existingIssues = Array.isArray(existing?.issues) ? existing.issues : [];
  const generated = Array.isArray(generatedReviewLedger.generated_review_images)
    ? generatedReviewLedger.generated_review_images
    : [];
  const calloutIssues = generated.flatMap((image: any) =>
    Array.isArray(image.callouts)
      ? image.callouts.map((callout: any, index: number) => normalizeIssueRow(callout, image, index))
      : []
  );
  const issues = (existingIssues.length ? existingIssues : calloutIssues).map((issue: any, index: number) =>
    normalizeIssueRow(issue, generated.find((image: any) => image.id === issue.generated_review_image_id || image.id === issue.evidence_image_id) || generated[0] || {}, index)
  );
  const validation = validateIssueRows(issues, generated);
  const blockers = [...validation.issues];
  if (!generated.length) blockers.push('generated_review_image_missing');
  if (generated.some((image: any) => image.text_only === true)) blockers.push('ux_review_text_only_fallback');
  if (generated.length && !issues.length) blockers.push('callout_extraction_schema_failed');
  return {
    schema: 'sks.image-ux-issue-ledger.v2',
    schema_version: 2,
    extraction_source: 'image-ux-generated-review-ledger.json',
    extraction_method: 'codex_exec_resume_output_schema_preferred',
    extracted_from_generated_callout: issues.length > 0,
    issues,
    blocking_issue_count: issues.filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status)).length,
    p0_p1_zero: issues.every((issue: any) => !['P0', 'P1'].includes(issue.severity) || ['fixed', 'accepted_not_applicable'].includes(issue.status)),
    blockers: [...new Set(blockers)],
    passed: generatedReviewLedger.passed === true && blockers.length === 0,
    validation
  };
}

export function normalizeIssueRow(issue: any = {}, image: any = {}, index = 0) {
  const severity = SEVERITIES.has(String(issue.severity)) ? String(issue.severity) : 'P2';
  const source = issue.source || image.source || (image.mock ? 'mock_fixture' : 'real_gpt_image_2_callout');
  const status = ISSUE_STATUSES.has(String(issue.status)) ? String(issue.status) : 'open';
  const bbox = Array.isArray(issue.bbox) ? issue.bbox : Array.isArray(issue.region) ? issue.region : [0, 0, 1, 1];
  const sourceScreenId = issue.source_screen_id || issue.screen_id || image.source_screen_id || 'screen-1';
  const generatedReviewImageId = issue.generated_review_image_id || issue.evidence_image_id || image.id || 'generated-review-unknown';
  const calloutId = issue.callout_id || issue.id || `callout-${index + 1}`;
  return {
    id: issue.id || `ux-issue-${index + 1}`,
    severity,
    source_screen_id: sourceScreenId,
    screen_id: sourceScreenId,
    generated_review_image_id: generatedReviewImageId,
    evidence_image_id: generatedReviewImageId,
    callout_id: calloutId,
    bbox,
    region: typeof issue.region === 'string' ? issue.region : `bbox:${bbox.join(',')}`,
    title: issue.title || issue.label || `Callout ${index + 1}`,
    detail: issue.detail || issue.description || 'Generated callout issue extracted from annotated review image.',
    likely_cause: issue.likely_cause || 'visual_hierarchy_or_affordance_gap',
    fix_action: issue.fix_action || issue.action || 'Adjust the referenced UI region and recheck the changed screen.',
    target_surface: issue.target_surface || image.target_surface || 'ui',
    candidate_files: Array.isArray(issue.candidate_files) ? issue.candidate_files : [],
    status,
    confidence: clampConfidence(issue.confidence ?? (source === 'mock_fixture' ? 0.5 : 0.82)),
    source,
    extracted_from_generated_image: issue.extracted_from_generated_image !== false
  };
}

export function validateIssueRows(issues: readonly any[] = [], generatedImages: readonly any[] = []) {
  const validationIssues: string[] = [];
  const imageById = new Map(generatedImages.map((image: any) => [image.id, image]));
  for (const issue of issues) {
    for (const field of ['id', 'severity', 'source_screen_id', 'generated_review_image_id', 'callout_id', 'bbox', 'title', 'detail', 'fix_action', 'status', 'confidence', 'source']) {
      if (issue[field] === undefined || issue[field] === null || issue[field] === '') validationIssues.push(`issue_${field}:${issue.id || 'unknown'}`);
    }
    if (!SEVERITIES.has(issue.severity)) validationIssues.push(`issue_severity:${issue.id}`);
    if (!ISSUE_STATUSES.has(issue.status)) validationIssues.push(`issue_status:${issue.id}`);
    if (issue.extracted_from_generated_image !== true) validationIssues.push(`issue_not_generated_image_extracted:${issue.id}`);
    const image = imageById.get(issue.generated_review_image_id) || {};
    const bbox = validateBbox(issue.bbox, image as Record<string, unknown>);
    for (const bboxIssue of bbox.issues) validationIssues.push(`${bboxIssue}:${issue.id}`);
    if (issue.source === 'mock_fixture' && image && (image as any).real_generated === true) validationIssues.push(`mock_source_on_real_image:${issue.id}`);
  }
  return {
    ok: validationIssues.length === 0,
    issues: [...new Set(validationIssues)]
  };
}

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
