import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso, sha256, writeJsonAtomic } from './fsx.mjs';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_IMAGEGEN_REQUIRED_POLICY } from './routes.mjs';

export const IMAGE_UX_REVIEW_GATE_ARTIFACT = 'image-ux-review-gate.json';
export const IMAGE_UX_REVIEW_POLICY_ARTIFACT = 'image-ux-review-policy.json';
export const IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT = 'image-ux-screen-inventory.json';
export const IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT = 'image-ux-generated-review-ledger.json';
export const IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT = 'image-ux-issue-ledger.json';
export const IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT = 'image-ux-iteration-report.json';
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
      required_for_gate: true,
      model: 'gpt-image-2',
      preferred_surface: 'Codex App built-in image generation via $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL,
      required_policy: CODEX_IMAGEGEN_REQUIRED_POLICY,
      output_artifact: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      anti_substitution_rule: 'A text-only visual review cannot satisfy this route. Missing generated annotated review images block the gate instead of being simulated.',
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

export function buildImageUxGeneratedReviewLedger(contract = {}, inventory = buildImageUxScreenInventory(contract), existing = null) {
  const existingImages = Array.isArray(existing?.generated_review_images) ? existing.generated_review_images : [];
  const sourceScreens = inventory.source_screens || [];
  const missingScreens = sourceScreens.filter((screen) => !existingImages.some((image) => image.source_screen_id === screen.id));
  const blockers = [];
  if (sourceScreens.length === 0) blockers.push('no_source_screenshots_for_imagegen_review');
  if (missingScreens.length > 0) blockers.push('missing_generated_annotated_review_images');
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    provider: {
      model: 'gpt-image-2',
      preferred_surface: 'Codex App $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL
    },
    required: true,
    generated_review_images: existingImages,
    planned_reviews: sourceScreens.map((screen) => ({
      id: compactId('image-ux-review', `${screen.id}:${screen.source || screen.id}`),
      source_screen_id: screen.id,
      status: existingImages.some((image) => image.source_screen_id === screen.id) ? 'generated' : 'pending_imagegen',
      required_output: 'annotated_review_image_with_numbered_callouts_and_optional_mini_comp'
    })),
    generated_count: existingImages.length,
    required_count: sourceScreens.length,
    blockers,
    passed: sourceScreens.length > 0 && blockers.length === 0,
    notes: [
      'This ledger records real generated review images. It must not be marked passed from prose-only critique.',
      CODEX_IMAGEGEN_REQUIRED_POLICY,
      'Route workers should attach generated image paths, Codex App output ids, or API output paths before passing the gate.'
    ]
  };
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
        status: passed ? 'passed' : 'blocked'
      }
    ],
    stopped: true,
    stop_reason: passed ? 'score_threshold_met_and_no_p0_p1_issues' : 'imagegen_review_evidence_or_issue_resolution_required',
    passed
  };
}

export function defaultImageUxReviewGate(contract = {}, parts = {}) {
  const policy = parts.policy || buildImageUxReviewPolicy(contract);
  const inventory = parts.inventory || buildImageUxScreenInventory(contract);
  const generatedReviewLedger = parts.generatedReviewLedger || buildImageUxGeneratedReviewLedger(contract, inventory);
  const issueLedger = parts.issueLedger || buildImageUxIssueLedger(contract, generatedReviewLedger);
  const iterationReport = parts.iterationReport || buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger);
  return {
    schema_version: 1,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    passed: false,
    policy_created: true,
    screen_inventory_created: true,
    source_screenshots_captured: inventory.passed === true,
    imagegen_review_images_generated: generatedReviewLedger.passed === true,
    generated_review_images_analyzed: issueLedger.extraction_source === IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT && generatedReviewLedger.passed === true,
    issue_ledger_created: true,
    p0_p1_zero: issueLedger.p0_p1_zero === true && generatedReviewLedger.passed === true,
    bounded_iteration_complete: iterationReport.passed === true,
    changed_screens_rechecked_or_not_applicable: iterationReport.passed === true,
    honest_mode_complete: false,
    required_artifacts: [
      IMAGE_UX_REVIEW_POLICY_ARTIFACT,
      IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
      IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT
    ],
    blockers: [
      ...(inventory.blockers || []),
      ...(generatedReviewLedger.blockers || []),
      ...(issueLedger.blockers || [])
    ],
    notes: [
      'Do not pass this gate from direct text-only screenshot critique.',
      'Pass only after source screenshots have real generated annotated review images and those generated images are extracted into issue rows.'
    ]
  };
}

export async function writeImageUxReviewRouteArtifacts(dir, contract = {}) {
  const policy = buildImageUxReviewPolicy(contract);
  const inventory = buildImageUxScreenInventory(contract);
  const existingGenerated = await readExistingJson(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT);
  const existingIssues = await readExistingJson(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT);
  const generatedReviewLedger = buildImageUxGeneratedReviewLedger(contract, inventory, existingGenerated);
  const issueLedger = buildImageUxIssueLedger(contract, generatedReviewLedger, existingIssues);
  const iterationReport = buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger);
  const gate = defaultImageUxReviewGate(contract, { policy, inventory, generatedReviewLedger, issueLedger, iterationReport });
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_POLICY_ARTIFACT), policy);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT), inventory);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), generatedReviewLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), issueLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT), iterationReport);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT), gate);
  return { policy, inventory, generated_review_ledger: generatedReviewLedger, issue_ledger: issueLedger, iteration_report: iterationReport, gate };
}

async function readExistingJson(dir, file) {
  try {
    const raw = await fsp.readFile(path.join(dir, file), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
