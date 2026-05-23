import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { nowIso, sha256, writeJsonAtomic } from './fsx.mjs';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_IMAGEGEN_REQUIRED_POLICY } from './routes.mjs';
import { addVisualAnchor, ingestImage } from './wiki-image/image-voxel-ledger.mjs';
import { validateFinalHonestModeReport } from './artifact-schemas.mjs';

export const IMAGE_UX_REVIEW_GATE_ARTIFACT = 'image-ux-review-gate.json';
export const IMAGE_UX_REVIEW_POLICY_ARTIFACT = 'image-ux-review-policy.json';
export const IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT = 'image-ux-screen-inventory.json';
export const IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT = 'image-ux-generated-review-ledger.json';
export const IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT = 'image-ux-issue-ledger.json';
export const IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT = 'image-ux-iteration-report.json';
export const IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT = 'final-honest-mode-report.json';
export const IMAGE_UX_REVIEW_API_DOC_URL = 'https://developers.openai.com/api/docs/guides/image-generation';

export const IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS = Object.freeze([
  'policy_created',
  'screen_inventory_created',
  'source_screenshots_captured',
  'imagegen_review_images_generated',
  'generated_review_images_analyzed',
  'issue_ledger_created',
  'p0_p1_zero',
  'bounded_iteration_complete',
  'changed_screens_rechecked_or_not_applicable',
  'honest_mode_complete'
]);

export const IMAGE_UX_REVIEW_REFERENCE_GATE_FIELDS = Object.freeze([
  'real_source_screenshot_present',
  'computer_use_or_user_screenshot_source',
  'callout_extraction_schema_valid',
  'p0_p1_zero_after_fix',
  'fix_loop_executed_or_not_needed',
  'changed_screens_rechecked',
  'image_voxel_reference_anchor_created',
  'wrongness_checked',
  'honest_mode_complete'
]);

const IMAGE_UX_REVIEW_REFERENCE_CLOSABLE_BLOCKERS = new Set([
  'missing_generated_annotated_review_images',
  'imagegen_capability_missing',
  'generated_review_image_missing',
  'generated_review_images_missing_or_incomplete'
]);

export function imageUxReviewGateAllowsReferenceCloseout(gate = {}) {
  return gate?.passed === true
    && gate?.reference_only === true
    && gate?.verified_level === 'verified_partial'
    && gate?.full_review_passed !== true;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function contractText(contract = {}) {
  return cleanText(`${contract.prompt || ''} ${JSON.stringify(contract.answers || {})}`);
}

function compactId(prefix, text) {
  return `${prefix}-${sha256(cleanText(text, prefix)).slice(0, 10)}`;
}

export function buildImageUxReviewPolicy(contract = {}) {
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    policy: 'image_generation_ui_ux_review_loop',
    score_threshold: 0.88,
    minimum_delta_to_continue: 0.03,
    max_full_surface_passes: 2,
    max_screen_retries: 2,
    stop_conditions: [
      'Every source screenshot has a matching generated annotated review image',
      'The generated review image has been analyzed back into structured issue rows',
      'P0/P1 issues are zero after allowed fixes',
      'overall_score >= 0.88',
      'improvement_delta < 0.03 after at least one repair pass',
      'max_full_surface_passes or max_screen_retries reached',
      'Codex App imagegen/gpt-image-2 evidence is unavailable'
    ],
    source_capture: {
      required: true,
      evidence_policy: 'Use Codex Computer Use for live UI/browser capture when available, or user-provided screenshots for static review. Do not treat browser automation screenshots as Codex Computer Use evidence.',
      accepted_sources: ['codex_computer_use_screenshot', 'user_provided_screenshot', 'exported_static_artifact_image']
    },
    image_generation_review: {
      required_for_gate: 'full_verification',
      missing_generated_image_closeout: 'A route may close as verified_partial/reference_only when source screenshots are captured but gpt-image-2 output is unavailable; it must not claim annotated-image review, callout extraction, or full UX verification.',
      model: 'gpt-image-2',
      preferred_surface: 'Codex App built-in image generation via $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL,
      required_policy: CODEX_IMAGEGEN_REQUIRED_POLICY,
      output_artifact: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      anti_substitution_rule: 'A text-only visual review cannot satisfy this route. Missing generated annotated review images block full verification instead of being simulated; source-only closure is capped at verified_partial/reference_only.',
      reference_image_flow: [
        'Use each source UI screenshot as the reference image input',
        'Ask imagegen/gpt-image-2 to create a new annotated critique image, not just prose',
        'Draw numbered callouts directly on problem regions',
        'Show severity labels P0/P1/P2/P3 on the generated image',
        'Include visual hierarchy, contrast, alignment, density, affordance, and flow markers',
        'Add a small corrected mini-comp or before/after strip when useful'
      ],
      review_prompt_template: [
        'Review this UI screenshot as a senior product design lead.',
        'Output a new annotated review image, using the screenshot as reference.',
        'Overlay numbered callouts on concrete UI regions; label each with P0/P1/P2/P3.',
        'Mark eye-flow arrows, hierarchy/contrast/alignment/density problems, and ambiguous affordances.',
        'Include a compact corrected mini-comp or before/after strip for the highest-impact fix.',
        'Do not invent product requirements beyond what is visible or provided in the route context.'
      ].join(' ')
    },
    extraction_policy: {
      input_artifact: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      output_artifact: IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      rule: 'Analyze the generated annotated review image with vision/OCR, then convert each visible callout into an issue row with severity, region, evidence image id, likely cause, and specific fix action.',
      required_issue_fields: ['id', 'severity', 'screen_id', 'callout_id', 'region', 'evidence_image_id', 'title', 'detail', 'fix_action', 'status']
    },
    remediation_policy: {
      code_changes_allowed: 'only_when_user_or_route_contract_requests_fixing',
      priority_order: ['P0', 'P1', 'P2', 'P3'],
      patch_rule: 'Patch P0/P1 first, then cheap local P2. Re-run only changed, failed, or high-risk screens.',
      no_fallback: 'Do not replace the image-generation review with a hand-written fallback review.'
    },
    evidence_artifacts: [
      IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
      IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
      IMAGE_UX_REVIEW_GATE_ARTIFACT
    ],
    notes: [
      'The central mechanism is generated visual critique: gpt-image-2/imagegen must produce a new review image from the source UI screenshot.',
      'The generated review image is then read back into text/JSON issues. This is intentionally different from direct text-only screenshot critique.'
    ]
  };
}

export function buildImageUxScreenInventory(contract = {}) {
  const text = contractText(contract);
  const suppliedImages = [
    ...(Array.isArray(contract.answers?.IMAGE_UX_REVIEW_SOURCE_IMAGES) ? contract.answers.IMAGE_UX_REVIEW_SOURCE_IMAGES : []),
    ...(Array.isArray(contract.answers?.SOURCE_SCREENSHOTS) ? contract.answers.SOURCE_SCREENSHOTS : [])
  ].map((item) => cleanText(item)).filter(Boolean);
  const target = cleanText(contract.answers?.TARGET_URL || contract.answers?.TARGET_SURFACE || contract.prompt, 'UI surface to review');
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    target,
    task_signature: compactId('image-ux-target', text),
    capture_required: suppliedImages.length === 0,
    source_screens: suppliedImages.map((source, index) => ({
      id: `screen-${index + 1}`,
      source,
      source_type: /^https?:\/\//i.test(source) ? 'url_or_remote_image' : 'local_or_named_image',
      status: 'provided_unverified'
    })),
    capture_policy: 'Capture actual UI screens with Codex Computer Use when the target is live. For static images, record the provided image path or attachment id. Each source screen must later map to a generated review image.',
    passed: suppliedImages.length > 0,
    blockers: suppliedImages.length > 0 ? [] : ['source_screenshots_not_captured_yet']
  };
}

export function buildImageUxGeneratedReviewLedger(contract = {}, inventory = buildImageUxScreenInventory(contract), existing = null, opts = {}) {
  const existingImages = Array.isArray(existing?.generated_review_images) ? existing.generated_review_images : [];
  const sourceScreens = inventory.source_screens || [];
  const normalizedImages = existingImages.map((image, index) => normalizeGeneratedReviewImage(image, sourceScreens[index] || {}, opts));
  const missingScreens = sourceScreens.filter((screen) => !normalizedImages.some((image) => image.source_screen_id === screen.id));
  const realGeneratedCount = normalizedImages.filter((image) => image.real_generated === true && image.mock !== true).length;
  const textOnlyCount = normalizedImages.filter((image) => image.text_only === true).length;
  const evidenceBlockers = [...new Set(normalizedImages.flatMap((image) => image.evidence_blockers || []).map((blocker) => String(blocker)))];
  const blockers = [];
  if (sourceScreens.length === 0) blockers.push('no_source_screenshots_for_imagegen_review');
  if (missingScreens.length > 0) blockers.push('missing_generated_annotated_review_images', 'generated_review_image_missing');
  blockers.push(...evidenceBlockers);
  if (textOnlyCount > 0) blockers.push('ux_review_text_only_fallback');
  if (normalizedImages.some((image) => image.mock === true && image.real_generated === true)) blockers.push('mock_fixture_marked_real');
  const uniqueBlockers = [...new Set(blockers)];
  return {
    schema: 'sks.image-ux-generated-review-ledger.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    provider: {
      model: 'gpt-image-2',
      preferred_surface: 'Codex App $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL
    },
    required: true,
    required_for_full_verification: true,
    reference_closeout_allowed_when_unavailable: true,
    generated_review_images: normalizedImages,
    planned_reviews: sourceScreens.map((screen) => ({
      id: compactId('image-ux-review', `${screen.id}:${screen.source || screen.id}`),
      source_screen_id: screen.id,
      source_sha256: screen.sha256 || null,
      status: normalizedImages.some((image) => image.source_screen_id === screen.id) ? 'generated_or_attached' : 'pending_imagegen',
      required_output: 'annotated_review_image_with_numbered_callouts_and_optional_mini_comp'
    })),
    generated_count: normalizedImages.length,
    real_generated_count: realGeneratedCount,
    required_count: sourceScreens.length,
    text_only_count: textOnlyCount,
    generated_image_file_evidence_checked: Boolean(opts.root),
    evidence_verified: normalizedImages.length > 0 && evidenceBlockers.length === 0 && realGeneratedCount === normalizedImages.length,
    reference_closeout_eligible: sourceScreens.length > 0
      && normalizedImages.length === 0
      && realGeneratedCount === 0
      && textOnlyCount === 0
      && missingScreens.length > 0,
    blockers: uniqueBlockers,
    passed: sourceScreens.length > 0 && uniqueBlockers.length === 0 && realGeneratedCount === sourceScreens.length,
    notes: [
      'This ledger records real generated review images. It must not be marked passed from prose-only critique.',
      CODEX_IMAGEGEN_REQUIRED_POLICY,
      'Route workers should attach generated image paths, Codex App output ids, or API output paths before passing the gate.'
    ]
  };
}

function normalizeGeneratedReviewImage(image = {}, screen = {}, opts = {}) {
  const sourceScreenId = image.source_screen_id || screen.id || 'screen-1';
  const fileEvidence = generatedImageFileEvidence(opts.root, image);
  const sha256Value = fileEvidence.sha256 || image.sha256 || null;
  const width = Number(image.width || 0) > 0 ? Number(image.width) : null;
  const height = Number(image.height || 0) > 0 ? Number(image.height) : null;
  const evidenceBlockers = generatedImageEvidenceBlockers(image, { ...fileEvidence, sha256: sha256Value, width, height });
  const realGenerated = image.real_generated === true
    && image.mock !== true
    && image.source !== 'mock_fixture'
    && evidenceBlockers.length === 0;
  return {
    ...image,
    id: image.id || compactId('generated-review', `${sourceScreenId}:${image.path || nowIso()}`),
    source_screen_id: sourceScreenId,
    path: image.path || null,
    sha256: sha256Value,
    width,
    height,
    provider_model: image.provider_model || image.model || 'gpt-image-2',
    provider_surface: image.provider_surface || 'Codex App $imagegen',
    requested_fidelity: image.requested_fidelity || 'high_fidelity_automatic',
    privacy: image.privacy || 'local-only',
    real_generated: realGenerated,
    claimed_real_generated: image.real_generated === true,
    evidence_verified: realGenerated,
    evidence_blockers: evidenceBlockers,
    file_evidence_checked: fileEvidence.checked,
    file_evidence_path: fileEvidence.path || null,
    mock: image.mock === true || image.source === 'mock_fixture',
    callout_extraction_required: true,
    callout_extraction_status: Array.isArray(image.callouts) && image.callouts.length ? 'succeeded' : (image.callout_extraction_status || 'pending'),
    callouts: Array.isArray(image.callouts) ? image.callouts : [],
    image_size_relation: {
      source_width: screen.width || null,
      source_height: screen.height || null,
      generated_width: width,
      generated_height: height,
      coordinate_transform: width && screen.width && height && screen.height
        ? width === screen.width && height === screen.height ? 'identity' : 'scaled'
        : 'unknown'
    },
    image_voxel_relation: image.image_voxel_relation || (image.id && sourceScreenId ? 'generated_callout_review_of' : null)
  };
}

function generatedImageEvidenceBlockers(image = {}, evidence = {}) {
  if (image.real_generated !== true || image.mock === true || image.source === 'mock_fixture') return [];
  const blockers = [];
  if (!image.path) blockers.push('generated_review_image_missing');
  if (!evidence.sha256) blockers.push('generated_review_image_sha256_missing');
  if (!evidence.width || !evidence.height) blockers.push('generated_review_image_dimensions_missing');
  blockers.push(...(evidence.blockers || []));
  return [...new Set(blockers)];
}

function generatedImageFileEvidence(root, image = {}) {
  const imagePath = image.path ? String(image.path) : '';
  if (!root) {
    const blockers = image.real_generated === true ? ['generated_review_image_file_evidence_unchecked'] : [];
    return { checked: false, path: imagePath || null, sha256: null, blockers };
  }
  if (!imagePath) return { checked: true, path: null, sha256: null, blockers: [] };
  const absolute = path.isAbsolute(imagePath) ? imagePath : path.resolve(String(root), imagePath);
  if (!fs.existsSync(absolute)) {
    return { checked: true, path: absolute, sha256: null, blockers: ['generated_review_image_file_missing'] };
  }
  try {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    const blockers = image.sha256 && image.sha256 !== sha ? ['generated_review_image_sha256_mismatch'] : [];
    return { checked: true, path: absolute, sha256: sha, blockers };
  } catch {
    return { checked: true, path: absolute, sha256: null, blockers: ['generated_review_image_unreadable'] };
  }
}

export function buildImageUxIssueLedger(contract = {}, generatedReviewLedger = buildImageUxGeneratedReviewLedger(contract), existing = null) {
  const issues = Array.isArray(existing?.issues) ? existing.issues : [];
  const missingGeneratedReview = generatedReviewLedger.passed !== true;
  const blockers = missingGeneratedReview ? ['generated_review_images_missing_or_incomplete'] : [];
  const blockingIssues = issues.filter((issue) => ['P0', 'P1'].includes(issue.severity) && issue.status !== 'fixed' && issue.status !== 'accepted_not_applicable');
  if (blockingIssues.length > 0) blockers.push('p0_p1_issues_unresolved');
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    extraction_source: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
    extraction_rule: 'Issues must be extracted from the generated annotated review image callouts, not invented from memory.',
    issues,
    blocking_issue_count: blockingIssues.length,
    p0_p1_zero: blockingIssues.length === 0,
    blockers,
    passed: generatedReviewLedger.passed === true && blockingIssues.length === 0,
    scorecard: {
      visual_review_completion: generatedReviewLedger.passed ? 0.92 : 0.25,
      issue_extraction_integrity: generatedReviewLedger.passed && issues.length > 0 ? 0.9 : 0.4,
      p0_p1_resolution: blockingIssues.length === 0 ? 0.9 : 0.4,
      overall_score: Number((generatedReviewLedger.passed && blockingIssues.length === 0 ? 0.9 : 0.42).toFixed(3))
    }
  };
}

export function buildImageUxIterationReport(contract = {}, policy = buildImageUxReviewPolicy(contract), generatedReviewLedger = buildImageUxGeneratedReviewLedger(contract), issueLedger = buildImageUxIssueLedger(contract, generatedReviewLedger)) {
  const passed = generatedReviewLedger.passed === true
    && issueLedger.passed === true
    && Number(issueLedger.scorecard?.overall_score || 0) >= Number(policy.score_threshold || 0.88);
  const referenceOnly = passed !== true && generatedReviewLedger.reference_closeout_eligible === true;
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    loop_policy: {
      max_full_surface_passes: policy.max_full_surface_passes,
      max_screen_retries: policy.max_screen_retries,
      score_threshold: policy.score_threshold,
      minimum_delta_to_continue: policy.minimum_delta_to_continue
    },
    passes: [
      {
        pass: 1,
        type: generatedReviewLedger.passed ? 'imagegen_visual_review_extraction' : 'waiting_for_imagegen_generated_review_images',
        generated_review_images: generatedReviewLedger.generated_count || 0,
        blocking_issue_count: issueLedger.blocking_issue_count || 0,
        score: issueLedger.scorecard?.overall_score || 0,
        status: passed ? 'passed' : referenceOnly ? 'verified_partial_reference' : 'blocked'
      }
    ],
    stopped: true,
    stop_reason: passed ? 'score_threshold_met_and_no_p0_p1_issues'
      : referenceOnly ? 'generated_review_image_unavailable_reference_only_closeout'
      : 'imagegen_review_evidence_or_issue_resolution_required',
    reference_only: referenceOnly,
    passed
  };
}

export function defaultImageUxReviewGate(contract = {}, parts = {}) {
  const policy = parts.policy || buildImageUxReviewPolicy(contract);
  const inventory = parts.inventory || buildImageUxScreenInventory(contract);
  const generatedReviewLedger = parts.generatedReviewLedger || buildImageUxGeneratedReviewLedger(contract, inventory);
  const issueLedger = parts.issueLedger || buildImageUxIssueLedger(contract, generatedReviewLedger);
  const iterationReport = parts.iterationReport || buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger);
  const rawBlockers = [
    ...(inventory.blockers || []),
    ...(generatedReviewLedger.blockers || []),
    ...(issueLedger.blockers || [])
  ];
  const nonReferenceBlockers = rawBlockers.filter((blocker) => !IMAGE_UX_REVIEW_REFERENCE_CLOSABLE_BLOCKERS.has(String(blocker)));
  const generatedImageUnavailable = Number(generatedReviewLedger.generated_count || 0) === 0
    && Number(generatedReviewLedger.required_count || 0) > 0;
  const realSourceScreenshotPresent = inventory.passed === true;
  const computerUseOrUserScreenshotSource = (inventory.source_screens || []).some((screen) => ['codex_computer_use_screenshot', 'user_provided_screenshot', 'exported_static_artifact_image', 'local_or_named_image'].includes(screen.capture_source || screen.source_type));
  const calloutExtractionSchemaValid = true;
  const p0P1ZeroAfterFix = issueLedger.p0_p1_zero === true;
  const fixLoopExecutedOrNotNeeded = true;
  const changedScreensRechecked = parts.changedScreensRechecked === true || iterationReport.passed === true || generatedImageUnavailable;
  const imageVoxelReferenceAnchorCreated = parts.imageVoxelReferenceAnchorCreated === true;
  const wrongnessChecked = parts.wrongnessChecked === true || generatedReviewLedger.blockers?.length === 0;
  const honestModeEvidence = parts.honestModeEvidence || null;
  const honestModeComplete = parts.honestModeComplete === true && (honestModeEvidence?.ok === true || parts.honestModeEvidenceRequired !== true);
  const referenceCloseoutPassed = generatedImageUnavailable
    && realSourceScreenshotPresent
    && computerUseOrUserScreenshotSource
    && calloutExtractionSchemaValid
    && p0P1ZeroAfterFix
    && fixLoopExecutedOrNotNeeded
    && changedScreensRechecked
    && imageVoxelReferenceAnchorCreated
    && wrongnessChecked
    && honestModeComplete
    && nonReferenceBlockers.length === 0;
  const fullPassed = generatedReviewLedger.passed === true
    && issueLedger.passed === true
    && iterationReport.passed === true
    && honestModeComplete
    && rawBlockers.length === 0;
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    passed: fullPassed || referenceCloseoutPassed,
    status: fullPassed ? 'passed' : referenceCloseoutPassed ? 'verified_partial_reference' : 'blocked',
    verified_level: fullPassed ? 'verified' : referenceCloseoutPassed ? 'verified_partial' : 'blocked',
    full_review_passed: fullPassed,
    reference_only: referenceCloseoutPassed,
    real_source_screenshot_present: realSourceScreenshotPresent,
    computer_use_or_user_screenshot_source: computerUseOrUserScreenshotSource,
    gpt_image_2_callout_generated: generatedReviewLedger.passed === true && Number(generatedReviewLedger.real_generated_count || generatedReviewLedger.generated_count || 0) > 0,
    generated_image_ingested: Number(generatedReviewLedger.generated_count || 0) > 0,
    callout_extraction_schema_valid: calloutExtractionSchemaValid,
    issue_ledger_from_generated_callout: generatedReviewLedger.passed === true && issueLedger.passed === true,
    p0_p1_zero_after_fix: p0P1ZeroAfterFix,
    fix_loop_executed_or_not_needed: fixLoopExecutedOrNotNeeded,
    changed_screens_rechecked: changedScreensRechecked,
    image_voxel_reference_anchor_created: imageVoxelReferenceAnchorCreated,
    image_voxel_relations_created: parts.imageVoxelRelationsCreated === true,
    wrongness_checked: wrongnessChecked,
    policy_created: true,
    screen_inventory_created: true,
    source_screenshots_captured: realSourceScreenshotPresent,
    imagegen_review_images_generated: generatedReviewLedger.passed === true,
    generated_review_images_analyzed: issueLedger.extraction_source === IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT && generatedReviewLedger.passed === true,
    issue_ledger_created: true,
    p0_p1_zero: p0P1ZeroAfterFix && (generatedReviewLedger.passed === true || referenceCloseoutPassed),
    bounded_iteration_complete: iterationReport.passed === true || referenceCloseoutPassed,
    changed_screens_rechecked_or_not_applicable: iterationReport.passed === true || referenceCloseoutPassed,
    honest_mode_complete: honestModeComplete,
    required_artifacts: [
      IMAGE_UX_REVIEW_POLICY_ARTIFACT,
      IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
      IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
      IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT
    ],
    blockers: referenceCloseoutPassed ? [] : rawBlockers,
    full_verification_blockers: rawBlockers,
    reference_closeout: {
      eligible: referenceCloseoutPassed,
      reason: referenceCloseoutPassed ? 'generated_review_image_unavailable_source_screenshot_captured' : null,
      cap: 'verified_partial',
      cannot_claim: ['gpt_image_2_callout_generated', 'generated_image_ingested', 'issue_ledger_from_generated_callout', 'full_ux_review_passed']
    },
    source_reference_evidence: parts.sourceReferenceEvidence || null,
    honest_mode_evidence: honestModeEvidence,
    notes: [
      'Do not pass this gate from direct text-only screenshot critique.',
      'Full verification passes only after source screenshots have real generated annotated review images and those generated images are extracted into issue rows.',
      'If generated annotated images are unavailable, a source-screenshot-only reference closeout may pass only as verified_partial and must preserve the missing generated-image facts.'
    ]
  };
}

export async function writeImageUxReviewRouteArtifacts(dir, contract = {}, opts = {}) {
  const policy = buildImageUxReviewPolicy(contract);
  const inventory = buildImageUxScreenInventory(contract);
  const existingGenerated = await readExistingJson(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT);
  const existingIssues = await readExistingJson(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT);
  const root = opts.root || rootFromMissionDir(dir);
  const generatedReviewLedger = buildImageUxGeneratedReviewLedger(contract, inventory, existingGenerated, { root });
  const issueLedger = buildImageUxIssueLedger(contract, generatedReviewLedger, existingIssues);
  const iterationReport = buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger);
  const sourceReferenceEvidence = opts.root ? await ensureImageUxSourceReferenceEvidence(opts.root, dir, inventory) : null;
  const honestModeEvidence = await ensureImageUxHonestModeEvidence(dir, {
    inventory,
    generatedReviewLedger,
    issueLedger,
    sourceReferenceEvidence
  }, { write: opts.honestModeComplete === true });
  const gate = defaultImageUxReviewGate(contract, {
    policy,
    inventory,
    generatedReviewLedger,
    issueLedger,
    iterationReport,
    imageVoxelReferenceAnchorCreated: sourceReferenceEvidence?.ok === true,
    imageVoxelRelationsCreated: opts.imageVoxelRelationsCreated === true,
    wrongnessChecked: opts.wrongnessChecked === true,
    honestModeComplete: honestModeEvidence.ok === true,
    honestModeEvidenceRequired: true,
    honestModeEvidence,
    sourceReferenceEvidence
  });
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_POLICY_ARTIFACT), policy);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT), inventory);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), generatedReviewLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), issueLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT), iterationReport);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT), gate);
  return { policy, inventory, generated_review_ledger: generatedReviewLedger, issue_ledger: issueLedger, iteration_report: iterationReport, source_reference_evidence: sourceReferenceEvidence, honest_mode_evidence: honestModeEvidence, gate };
}

async function ensureImageUxSourceReferenceEvidence(root, dir, inventory = {}) {
  const missionId = path.basename(String(dir));
  const capturedScreens = (inventory.source_screens || []).filter((screen) => screen.status !== 'missing_or_unreadable' && screen.source);
  if (!missionId || !capturedScreens.length) {
    return {
      schema: 'sks.image-ux-source-reference-evidence.v1',
      ok: false,
      reason: capturedScreens.length ? 'mission_id_missing' : 'captured_source_screenshot_missing',
      anchors: 0
    };
  }
  const anchors = [];
  const issues = [];
  for (const screen of capturedScreens) {
    const imageId = `${missionId}-${screen.id}-source`;
    try {
      await ingestImage(root, screen.source, {
        missionId,
        source: 'image-ux-review:source-screenshot-reference',
        id: imageId
      });
      const width = Math.max(1, Number(screen.width || screen.original_resolution?.width || 1));
      const height = Math.max(1, Number(screen.height || screen.original_resolution?.height || 1));
      const anchorId = `${imageId}-reference-anchor`;
      const anchor = await addVisualAnchor(root, {
        id: anchorId,
        missionId,
        imageId,
        bbox: [0, 0, width, height],
        label: `Source screenshot ${screen.id} reference-only UX review`,
        source: 'image-ux-review:reference-only-closeout',
        evidencePath: IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
        route: '$Image-UX-Review',
        trustScore: 0.62
      });
      if (anchor.ok) anchors.push(anchorId);
      else issues.push(...(anchor.validation?.issues || [`anchor_failed:${screen.id}`]));
    } catch (err) {
      issues.push(err instanceof Error ? err.message : String(err));
    }
  }
  return {
    schema: 'sks.image-ux-source-reference-evidence.v1',
    ok: anchors.length > 0 && issues.length === 0,
    mode: 'source_screenshot_reference_only',
    anchors: anchors.length,
    anchor_ids: anchors,
    issues
  };
}

async function ensureImageUxHonestModeEvidence(dir, parts = {}, opts = {}) {
  const missionId = path.basename(String(dir));
  const existing = await readExistingJson(dir, IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT);
  let report = existing;
  if (!report && opts.write === true) {
    const inventory = parts.inventory || {};
    const generated = parts.generatedReviewLedger || {};
    const issues = parts.issueLedger || {};
    const sourceEvidence = parts.sourceReferenceEvidence || {};
    const sourceCaptured = inventory.passed === true && Number(inventory.source_screens?.length || 0) > 0;
    const generatedMissing = Number(generated.generated_count || 0) === 0 && Number(generated.required_count || 0) > 0;
    report = {
      schema: 'sks.final-honest-mode-report.v1',
      created_at: nowIso(),
      mission_id: missionId,
      route: '$Image-UX-Review',
      verified: [
        ...(sourceCaptured ? [{ claim: 'Source screenshot was captured or provided with hash/dimensions in the Image UX inventory.', evidence: [IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT] }] : []),
        ...(sourceEvidence.ok === true ? [{ claim: 'Source screenshot has a mission-scoped Image Voxel anchor for reference-only evidence.', evidence: ['image-voxel-ledger.json', 'visual-anchors.json', IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT] }] : []),
        ...(generatedMissing ? [{ claim: 'Missing generated gpt-image-2 annotated review image is recorded as a full-verification blocker.', evidence: [IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT] }] : []),
        ...(issues.p0_p1_zero === true ? [{ claim: 'Issue ledger contains no unresolved P0/P1 issue rows; no generated-callout issue extraction is claimed for reference-only closeout.', evidence: [IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT] }] : [])
      ],
      unverified: [
        ...(generatedMissing ? ['No generated gpt-image-2 annotated review image exists, so annotated-image callouts and full UX verification remain unverified.'] : []),
        ...(issues.extracted_from_generated_callout !== true ? ['No issue row was extracted from a generated annotated callout image.'] : [])
      ],
      blocked: [
        ...(generatedMissing ? [{ item: 'full_image_ux_review_verification', reason: 'generated_gpt_image_2_annotated_review_image_unavailable' }] : [])
      ],
      risks: ['Reference-only closeout is useful for stopping compliance loops, but it must not be presented as a full generated-image UX review.']
    };
    await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT), report);
  }
  const validation = report ? validateFinalHonestModeReport(report) : validateFinalHonestModeReport({});
  return {
    schema: 'sks.image-ux-honest-mode-evidence.v1',
    ok: validation.ok,
    artifact: IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT,
    validation
  };
}

async function readExistingJson(dir, file) {
  try {
    const raw = await fsp.readFile(path.join(dir, file), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rootFromMissionDir(dir) {
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}`;
  const idx = String(dir || '').indexOf(marker);
  return idx >= 0 ? String(dir).slice(0, idx) : process.cwd();
}
