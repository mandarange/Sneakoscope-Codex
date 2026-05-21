import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso, sha256, writeJsonAtomic } from './fsx.js';
import { imageDimensions, sha256File } from './wiki-image/image-hash.js';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_IMAGEGEN_REQUIRED_POLICY } from './routes.js';
import { codex0132Matrix } from './codex-compat/codex-0-132.js';
import { detectCodexExecResumeOutputSchema } from './codex-exec-output-schema.js';
import { buildCalloutPrompt, imagegenCapabilityBlocker } from './image-ux-review/imagegen-adapter.js';
import { buildIssueLedgerFromGeneratedCallouts } from './image-ux-review/callout-extraction.js';
import { planImageUxFixTasks } from './image-ux-review/fix-task-planner.js';
import { runImageUxFixLoop } from './image-ux-review/fix-loop.js';
import { buildRecapturePlan } from './image-ux-review/recapture.js';

export const IMAGE_UX_REVIEW_GATE_ARTIFACT = 'image-ux-review-gate.json';
export const IMAGE_UX_REVIEW_POLICY_ARTIFACT = 'image-ux-review-policy.json';
export const IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT = 'image-ux-screen-inventory.json';
export const IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT = 'image-ux-generated-review-ledger.json';
export const IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT = 'image-ux-issue-ledger.json';
export const IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT = 'image-ux-fix-task-plan.json';
export const IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT = 'image-ux-fix-loop.json';
export const IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT = 'image-ux-recapture-plan.json';
export const IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT = 'image-ux-iteration-report.json';
export const IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT = 'image-ux-imagegen-request.json';
export const IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT = 'image-ux-gpt-image-2-request.json';
export const IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT = 'image-ux-gpt-image-2-response.json';
export const IMAGE_UX_REVIEW_API_DOC_URL = 'https://developers.openai.com/api/docs/guides/image-generation';
export const GPT_IMAGE_2_MODEL_DOC_URL = 'https://developers.openai.com/api/docs/models/gpt-image-2';
export const STRUCTURED_OUTPUTS_DOC_URL = 'https://developers.openai.com/api/docs/guides/structured-outputs';

export const IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS = Object.freeze([
  'real_source_screenshot_present',
  'computer_use_or_user_screenshot_source',
  'gpt_image_2_callout_generated',
  'generated_image_ingested',
  'callout_extraction_schema_valid',
  'issue_ledger_from_generated_callout',
  'p0_p1_zero_after_fix',
  'fix_loop_executed_or_not_needed',
  'changed_screens_rechecked',
  'image_voxel_relations_created',
  'wrongness_checked',
  'honest_mode_complete'
]);

function cleanText(value: any, fallback: any = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function contractText(contract: any = {}) {
  return cleanText(`${contract.prompt || ''} ${JSON.stringify(contract.answers || {})}`);
}

function compactId(prefix: any, text: any) {
  return `${prefix}-${sha256(cleanText(text, prefix)).slice(0, 10)}`;
}

export function buildImageUxReviewPolicy(contract: any = {}) {
  const outputSchema = {
    preferred_for_codex_0_132: true,
    schemas: [
      'schemas/codex/ux-review-callout-extraction.schema.json',
      'schemas/codex/image-ux-issue-ledger.schema.json',
      'schemas/codex/completion-proof.schema.json',
      'schemas/codex/wrongness-record.schema.json',
      'schemas/codex/scout-result.schema.json',
      'schemas/codex/computer-use-live-evidence.schema.json'
    ]
  };
  return {
    schema: 'sks.image-ux-review-policy.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    policy: 'real_gpt_image_2_callout_fix_loop',
    score_threshold: 0.88,
    minimum_delta_to_continue: 0.03,
    max_full_surface_passes: 2,
    max_screen_retries: 2,
    codex_compatibility: codex0132Matrix(),
    output_schema: outputSchema,
    source_capture: {
      required: true,
      original_resolution_required: true,
      local_only_default: true,
      accepted_sources: ['codex_computer_use_screenshot', 'user_provided_screenshot', 'exported_static_artifact_image'],
      privacy: 'Computer Use screenshots and gpt-image-2 outputs are local-only by default; shared TriWiki publishes metadata only unless explicitly opted in.'
    },
    image_generation_review: {
      required_for_gate: true,
      model: 'gpt-image-2',
      preferred_surface: 'Codex App built-in image generation via $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL,
      gpt_image_2_model_doc: GPT_IMAGE_2_MODEL_DOC_URL,
      image_input_fidelity_note: 'high_fidelity_automatic',
      unsupported_parameters_omitted: ['input_fidelity'],
      required_policy: CODEX_IMAGEGEN_REQUIRED_POLICY,
      output_artifact: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      anti_substitution_rule: 'A text-only visual review cannot satisfy this route. Missing generated annotated review images block the gate instead of being simulated.',
      prompt_contract: [
        'numbered callouts',
        'P0/P1/P2/P3 severity labels',
        'concrete UI region overlays',
        'visual hierarchy markers',
        'contrast markers',
        'alignment markers',
        'density markers',
        'affordance markers',
        'eye-flow arrows',
        'corrected mini-comp or before/after strip',
        'visible evidence only',
        'no invented product requirements',
        'screenshot source id',
        'output must be image artifact',
        'text-only response invalid'
      ],
      review_prompt_template: buildCalloutPrompt('{{source_screen_id}}', { target: contract.answers?.TARGET_SURFACE || contract.prompt })
    },
    extraction_policy: {
      input_artifact: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      output_artifact: IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      preferred_path: 'codex exec resume --output-schema schemas/codex/image-ux-issue-ledger.schema.json',
      fallback_path: 'OpenAI Responses Structured Outputs text.format json_schema strict true',
      structured_outputs_doc: STRUCTURED_OUTPUTS_DOC_URL,
      fallback_cap: 'verified_partial',
      required_issue_fields: ['id', 'severity', 'source_screen_id', 'generated_review_image_id', 'callout_id', 'bbox', 'region', 'title', 'detail', 'likely_cause', 'fix_action', 'target_surface', 'status', 'confidence', 'source', 'extraction_provider', 'generated_image_sha256', 'bbox_coordinate_space', 'bbox_confidence']
    },
    remediation_policy: {
      code_changes_allowed: 'only_when_user_or_route_contract_requests_fixing',
      priority_order: ['P0', 'P1', 'P2', 'P3'],
      patch_rule: 'Patch P0/P1 first, then cheap local P2. Re-run only changed, failed, or high-risk screens.',
      no_fallback: 'Do not replace the image-generation review with a hand-written fallback review.',
      repeated_blocker_stop_threshold: 2,
      db_destructive_operations_allowed: false
    },
    evidence_artifacts: [
      IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
      IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT,
      IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT,
      IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT,
      IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT,
      IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT,
      IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
      IMAGE_UX_REVIEW_GATE_ARTIFACT
    ]
  };
}

export function buildImageUxScreenInventory(contract: any = {}) {
  const text = contractText(contract);
  const suppliedImages = [
    ...(Array.isArray(contract.answers?.IMAGE_UX_REVIEW_SOURCE_IMAGES) ? contract.answers.IMAGE_UX_REVIEW_SOURCE_IMAGES : []),
    ...(Array.isArray(contract.answers?.SOURCE_SCREENSHOTS) ? contract.answers.SOURCE_SCREENSHOTS : []),
    ...(contract.answers?.IMAGE_UX_REVIEW_SOURCE_IMAGE ? [contract.answers.IMAGE_UX_REVIEW_SOURCE_IMAGE] : [])
  ].map((item: any) => cleanText(item)).filter(Boolean);
  const target = cleanText(contract.answers?.TARGET_URL || contract.answers?.TARGET_SURFACE || contract.prompt, 'UI surface to review');
  return {
    schema: 'sks.image-ux-screen-inventory.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    target,
    task_signature: compactId('image-ux-target', text),
    capture_required: suppliedImages.length === 0,
    source_screens: suppliedImages.map((source: any, index: number) => ({
      id: `screen-${index + 1}`,
      source,
      source_type: /^https?:\/\//i.test(source) ? 'url_or_remote_image' : 'local_or_named_image',
      capture_source: contract.answers?.COMPUTER_USE_SCREENSHOT ? 'codex_computer_use_screenshot' : 'user_provided_screenshot',
      status: 'provided_unverified',
      original_resolution: true,
      width: null,
      height: null,
      sha256: null,
      exif_orientation_normalized: 'not_applicable_or_pending',
      privacy: 'local-only'
    })),
    capture_policy: 'Capture actual UI screens with Codex Computer Use when live, or user-provided screenshots for static review. Preserve original image resolution metadata.',
    passed: suppliedImages.length > 0,
    blockers: suppliedImages.length > 0 ? [] : ['screenshot_required']
  };
}

export async function hydrateImageUxScreenInventory(root: string, inventory: any) {
  const sourceScreens = [];
  for (const screen of inventory.source_screens || []) {
    const file = resolveImagePath(root, screen.source);
    let next = { ...screen };
    try {
      const dims = await imageDimensions(file);
      next = {
        ...next,
        source: path.relative(root, file).split(path.sep).join('/'),
        width: dims.width,
        height: dims.height,
        format: dims.format,
        sha256: await sha256File(file),
        status: 'captured',
        original_resolution: {
          preserved: true,
          width: dims.width,
          height: dims.height
        },
        exif_orientation_normalized: 'recorded_not_rotated'
      };
    } catch (err) {
      next = {
        ...next,
        status: 'missing_or_unreadable',
        blocker: err instanceof Error ? err.message : String(err)
      };
    }
    sourceScreens.push(next);
  }
  const blockers = [
    ...(inventory.blockers || []),
    ...sourceScreens.filter((screen: any) => screen.status !== 'captured').map((screen: any) => `source_screenshot_unreadable:${screen.id}`)
  ];
  return {
    ...inventory,
    source_screens: sourceScreens,
    passed: sourceScreens.length > 0 && blockers.length === 0,
    blockers: [...new Set(blockers)]
  };
}

export function buildImageUxGeneratedReviewLedger(contract: any = {}, inventory: any = buildImageUxScreenInventory(contract), existing: any = null) {
  const existingImages = Array.isArray(existing?.generated_review_images) ? existing.generated_review_images : [];
  const sourceScreens = inventory.source_screens || [];
  const normalizedImages = existingImages.map((image: any, index: number) => normalizeGeneratedReviewImage(image, sourceScreens[index] || {}));
  const missingScreens = sourceScreens.filter((screen: any) => !normalizedImages.some((image: any) => image.source_screen_id === screen.id));
  const realGeneratedCount = normalizedImages.filter((image: any) => image.real_generated === true && image.mock !== true).length;
  const textOnlyCount = normalizedImages.filter((image: any) => image.text_only === true).length;
  const blockers: string[] = [];
  if (sourceScreens.length === 0) blockers.push('no_source_screenshots_for_imagegen_review');
  if (missingScreens.length > 0) blockers.push('missing_generated_annotated_review_images');
  if (textOnlyCount > 0) blockers.push('ux_review_text_only_fallback');
  if (normalizedImages.some((image: any) => image.mock === true && image.real_generated === true)) blockers.push('mock_fixture_marked_real');
  return {
    schema: 'sks.image-ux-generated-review-ledger.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    provider: {
      model: 'gpt-image-2',
      preferred_surface: 'Codex App $imagegen',
      codex_app_imagegen_doc: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      api_image_generation_doc: IMAGE_UX_REVIEW_API_DOC_URL,
      gpt_image_2_model_doc: GPT_IMAGE_2_MODEL_DOC_URL
    },
    required: true,
    generated_review_images: normalizedImages,
    planned_reviews: sourceScreens.map((screen: any) => ({
      id: compactId('image-ux-review', `${screen.id}:${screen.source || screen.id}`),
      source_screen_id: screen.id,
      source_sha256: screen.sha256 || null,
      prompt: buildCalloutPrompt(screen.id, { target: inventory.target }),
      status: normalizedImages.some((image: any) => image.source_screen_id === screen.id) ? 'generated_or_attached' : 'pending_imagegen',
      required_output: 'annotated_review_image_with_numbered_callouts_severity_labels_markers_arrows_and_mini_comp',
      requested_fidelity: 'high_fidelity_automatic',
      image_input_fidelity_note: 'gpt-image-2 processes image inputs at high fidelity automatically; SKS omits unsupported input_fidelity.',
      privacy: 'local-only'
    })),
    generated_count: normalizedImages.length,
    real_generated_count: realGeneratedCount,
    required_count: sourceScreens.length,
    text_only_count: textOnlyCount,
    blockers,
    passed: sourceScreens.length > 0 && blockers.length === 0 && realGeneratedCount === sourceScreens.length,
    imagegen_blocker: blockers.includes('missing_generated_annotated_review_images') ? imagegenCapabilityBlocker() : null,
    notes: [
      'This ledger records real generated review images. It must not be marked passed from prose-only critique.',
      CODEX_IMAGEGEN_REQUIRED_POLICY
    ]
  };
}

export function buildImageUxIssueLedger(contract: any = {}, generatedReviewLedger: any = buildImageUxGeneratedReviewLedger(contract), existing: any = null) {
  const ledger = buildIssueLedgerFromGeneratedCallouts(generatedReviewLedger, existing);
  return {
    ...ledger,
    contract_hash: contract.sealed_hash || null,
    output_schema: 'schemas/codex/image-ux-issue-ledger.schema.json',
    scorecard: {
      visual_review_completion: generatedReviewLedger.passed ? 0.92 : 0.25,
      issue_extraction_integrity: ledger.validation.ok && ledger.issues.length > 0 ? 0.9 : 0.35,
      p0_p1_resolution: ledger.p0_p1_zero ? 0.9 : 0.4,
      overall_score: Number((generatedReviewLedger.passed && ledger.validation.ok && ledger.p0_p1_zero ? 0.9 : 0.42).toFixed(3))
    }
  };
}

export function buildImageUxIterationReport(
  contract: any = {},
  policy: any = buildImageUxReviewPolicy(contract),
  generatedReviewLedger: any = buildImageUxGeneratedReviewLedger(contract),
  issueLedger: any = buildImageUxIssueLedger(contract, generatedReviewLedger),
  fixTaskPlan: any = planImageUxFixTasks(issueLedger),
  fixLoop: any = runImageUxFixLoop(issueLedger, fixTaskPlan),
  recapturePlan: any = buildRecapturePlan(fixLoop)
) {
  const passed = generatedReviewLedger.passed === true
    && issueLedger.passed === true
    && fixLoop.passed === true
    && recapturePlan.passed === true
    && Number(issueLedger.scorecard?.overall_score || 0) >= Number(policy.score_threshold || 0.88);
  return {
    schema: 'sks.image-ux-iteration-report.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    loop_policy: {
      max_full_surface_passes: policy.max_full_surface_passes,
      max_screen_retries: policy.max_screen_retries,
      score_threshold: policy.score_threshold,
      minimum_delta_to_continue: policy.minimum_delta_to_continue,
      repeated_blocker_stop_threshold: policy.remediation_policy?.repeated_blocker_stop_threshold || 2
    },
    passes: [
      {
        pass: 1,
        type: generatedReviewLedger.passed ? 'real_gpt_image_2_callout_extraction' : 'waiting_for_gpt_image_2_callout_image',
        generated_review_images: generatedReviewLedger.generated_count || 0,
        real_generated_review_images: generatedReviewLedger.real_generated_count || 0,
        blocking_issue_count: issueLedger.blocking_issue_count || 0,
        fix_tasks: fixTaskPlan.tasks?.length || 0,
        score: issueLedger.scorecard?.overall_score || 0,
        status: passed ? 'passed' : 'blocked'
      }
    ],
    stopped: true,
    stop_reason: passed ? 'score_threshold_met_and_no_p0_p1_issues' : 'imagegen_review_evidence_or_issue_resolution_required',
    passed
  };
}

export function defaultImageUxReviewGate(contract: any = {}, parts: any = {}) {
  const policy = parts.policy || buildImageUxReviewPolicy(contract);
  const inventory = parts.inventory || buildImageUxScreenInventory(contract);
  const generatedReviewLedger = parts.generatedReviewLedger || buildImageUxGeneratedReviewLedger(contract, inventory);
  const issueLedger = parts.issueLedger || buildImageUxIssueLedger(contract, generatedReviewLedger);
  const fixTaskPlan = parts.fixTaskPlan || planImageUxFixTasks(issueLedger);
  const fixLoop = parts.fixLoop || runImageUxFixLoop(issueLedger, fixTaskPlan);
  const recapturePlan = parts.recapturePlan || buildRecapturePlan(fixLoop);
  const iterationReport = parts.iterationReport || buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger, fixTaskPlan, fixLoop, recapturePlan);
  const gate = {
    schema: 'sks.image-ux-review-gate.v2',
    schema_version: 2,
    created_at: nowIso(),
    contract_hash: contract.sealed_hash || null,
    passed: false,
    real_source_screenshot_present: inventory.passed === true,
    computer_use_or_user_screenshot_source: (inventory.source_screens || []).some((screen: any) => ['codex_computer_use_screenshot', 'user_provided_screenshot', 'exported_static_artifact_image'].includes(screen.capture_source || screen.source_type)),
    gpt_image_2_callout_generated: generatedReviewLedger.passed === true && Number(generatedReviewLedger.real_generated_count || 0) > 0,
    generated_image_ingested: Number(generatedReviewLedger.generated_count || 0) > 0,
    callout_extraction_schema_valid: issueLedger.validation?.ok === true,
    issue_ledger_from_generated_callout: issueLedger.extracted_from_generated_callout === true,
    p0_p1_zero_after_fix: issueLedger.p0_p1_zero === true && (fixLoop.passed === true || fixTaskPlan.tasks?.length === 0),
    fix_loop_executed_or_not_needed: fixLoop.passed === true || fixTaskPlan.tasks?.length === 0,
    changed_screens_rechecked: recapturePlan.changed_screens_rechecked_or_not_applicable === true,
    image_voxel_relations_created: parts.imageVoxelRelationsCreated === true || generatedReviewLedger.generated_review_images?.some((image: any) => image.image_voxel_relation === 'generated_callout_review_of') === true,
    wrongness_checked: parts.wrongnessChecked === true || generatedReviewLedger.blockers?.length === 0,
    honest_mode_complete: parts.honestModeComplete === true,
    required_artifacts: [
      IMAGE_UX_REVIEW_POLICY_ARTIFACT,
      IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
      IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT,
      IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT,
      IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
      IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT,
      IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT,
      IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT,
      IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT
    ],
    blockers: [
      ...(inventory.blockers || []),
      ...(generatedReviewLedger.blockers || []),
      ...(issueLedger.blockers || []),
      ...(fixTaskPlan.blockers || []).filter((blocker: any) => blocker !== 'no_fixable_issues' || (issueLedger.issues || []).some((issue: any) => ['P0', 'P1'].includes(issue.severity) && !['fixed', 'accepted_not_applicable'].includes(issue.status))),
      ...(fixLoop.blockers || []),
      ...(recapturePlan.blockers || [])
    ],
    verification_caps: {
      text_only_review: 'blocked',
      mock_fixture: 'verified_partial_or_lower',
      codex_less_than_0_132_fallback: 'verified_partial_or_lower'
    },
    notes: [
      'Do not pass this gate from direct text-only screenshot critique.',
      'Pass only after source screenshots have real generated gpt-image-2 annotated review images and those generated images are extracted into issue rows.'
    ]
  };
  const required = IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS.filter((field) => field !== 'honest_mode_complete');
  const corePassed = required.every((field) => (gate as any)[field] === true);
  return {
    ...gate,
    passed: corePassed && gate.honest_mode_complete === true && gate.blockers.length === 0
  };
}

export async function writeImageUxReviewRouteArtifacts(dir: any, contract: any = {}, opts: any = {}) {
  const root = opts.root || rootFromMissionDir(String(dir));
  const policy = buildImageUxReviewPolicy(contract);
  let inventory = buildImageUxScreenInventory(contract);
  inventory = await hydrateImageUxScreenInventory(root, inventory);
  const existingGenerated = await readExistingJson(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT);
  const existingIssues = await readExistingJson(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT);
  const generatedReviewLedger = buildImageUxGeneratedReviewLedger(contract, inventory, existingGenerated);
  const issueLedger = buildImageUxIssueLedger(contract, generatedReviewLedger, existingIssues);
  const fixTaskPlan = planImageUxFixTasks(issueLedger);
  const fixLoop = runImageUxFixLoop(issueLedger, fixTaskPlan, opts.fixLoop || {});
  const recapturePlan = buildRecapturePlan(fixLoop, opts.recapture || {});
  const iterationReport = buildImageUxIterationReport(contract, policy, generatedReviewLedger, issueLedger, fixTaskPlan, fixLoop, recapturePlan);
  const outputSchema = await detectCodexExecResumeOutputSchema().catch((err: any) => ({ ok: true, status: 'integration_optional', warnings: [err.message] }));
  const gate = defaultImageUxReviewGate(contract, {
    policy,
    inventory,
    generatedReviewLedger,
    issueLedger,
    fixTaskPlan,
    fixLoop,
    recapturePlan,
    iterationReport,
    imageVoxelRelationsCreated: opts.imageVoxelRelationsCreated === true,
    wrongnessChecked: opts.wrongnessChecked === true,
    honestModeComplete: opts.honestModeComplete === true
  });
  const imagegenRequest = buildImagegenRequestArtifact(contract, inventory);
  const imagegenResponse = buildImagegenResponseArtifact(generatedReviewLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_POLICY_ARTIFACT), policy);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT), inventory);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT), imagegenRequest);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT), imagegenRequest);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT), imagegenResponse);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), generatedReviewLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), issueLedger);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT), fixTaskPlan);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT), fixLoop);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT), recapturePlan);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT), iterationReport);
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT), gate);
  return {
    policy,
    inventory,
    imagegen_request: imagegenRequest,
    imagegen_response: imagegenResponse,
    generated_review_ledger: generatedReviewLedger,
    issue_ledger: issueLedger,
    fix_task_plan: fixTaskPlan,
    fix_loop: fixLoop,
    recapture_plan: recapturePlan,
    iteration_report: iterationReport,
    output_schema: outputSchema,
    gate
  };
}

export function imageUxReviewProofEvidence(gate: any = {}, artifacts: any = {}) {
  const issueLedger = artifacts.issue_ledger || {};
  const generated = artifacts.generated_review_ledger || {};
  return {
    schema: 'sks.image-ux-review-proof-evidence.v1',
    status: gate.passed ? 'verified' : generated.generated_count ? 'verified_partial' : 'blocked',
    source_screenshots_count: artifacts.inventory?.source_screens?.length || 0,
    generated_gpt_image_2_callout_images_count: generated.real_generated_count || 0,
    generated_images_total: generated.generated_count || 0,
    callout_extraction_schema_status: issueLedger.validation?.ok ? 'valid' : 'blocked',
    open_p0_p1_count: issueLedger.blocking_issue_count || 0,
    fixed_p0_p1_count: (issueLedger.issues || []).filter((issue: any) => ['P0', 'P1'].includes(issue.severity) && issue.status === 'fixed').length,
    recapture_re_review_status: artifacts.recapture_plan?.changed_screens_rechecked_or_not_applicable ? 'complete_or_not_applicable' : 'blocked',
    image_voxel_relation_count: generated.generated_review_images?.filter((image: any) => image.image_voxel_relation).length || 0,
    computer_use_evidence_mode: artifacts.inventory?.source_screens?.some((screen: any) => screen.capture_source === 'codex_computer_use_screenshot') ? 'source_screenshot' : 'user_or_static_screenshot',
    claims: {
      ux_review_source_screenshot_verified: artifacts.inventory?.passed === true,
      ux_review_gpt_image_2_callouts_generated: (generated.real_generated_count || 0) > 0,
      ux_review_issues_extracted_from_callout_image: issueLedger.extracted_from_generated_callout === true,
      ux_review_p0_p1_fixed_or_blocked: (issueLedger.blocking_issue_count || 0) === 0 || (gate.blockers || []).length > 0,
      ux_review_changed_screens_rechecked: artifacts.recapture_plan?.changed_screens_rechecked_or_not_applicable === true,
      ux_review_image_voxel_relations_verified: (generated.generated_review_images || []).some((image: any) => image.image_voxel_relation)
    },
    blockers: gate.blockers || []
  };
}

function buildImagegenRequestArtifact(contract: any, inventory: any) {
  return {
    schema: 'sks.image-ux-gpt-image-2-request.v1',
    created_at: nowIso(),
    model: 'gpt-image-2',
    surface: 'Codex App $imagegen',
    endpoint: 'Codex App $imagegen or OpenAI /v1/images/edits fallback',
    api_docs: IMAGE_UX_REVIEW_API_DOC_URL,
    privacy: 'local-only',
    requests: (inventory.source_screens || []).map((screen: any) => ({
      source_screen_id: screen.id,
      source_image_path: screen.source,
      source_sha256: screen.sha256 || null,
      requested_fidelity: 'high_fidelity_automatic',
      image_input_fidelity_note: 'gpt-image-2 high-fidelity image input is automatic; do not send input_fidelity.',
      output_dir: 'mission',
      prompt: buildCalloutPrompt(screen.id, { target: inventory.target || contract.prompt })
    })),
    blocker_if_unavailable: imagegenCapabilityBlocker()
  };
}

function buildImagegenResponseArtifact(generatedReviewLedger: any = {}) {
  const image = (generatedReviewLedger.generated_review_images || [])[0] || null;
  return {
    schema: 'sks.image-ux-gpt-image-2-response.v1',
    created_at: nowIso(),
    provider: image?.provider_surface || generatedReviewLedger.provider?.preferred_surface || 'none',
    model: 'gpt-image-2',
    ok: generatedReviewLedger.passed === true,
    status: generatedReviewLedger.passed === true ? 'generated' : 'blocked_or_pending',
    output_image_path: image?.path || null,
    output_image_sha256: image?.sha256 || null,
    output_id: image?.output_id || null,
    dimensions: image ? { width: image.width || null, height: image.height || null, format: image.format || null } : null,
    latency_ms: image?.latency_ms || null,
    token_cost_metadata: image?.token_cost_metadata || null,
    local_only: true,
    blockers: generatedReviewLedger.blockers || []
  };
}

function normalizeGeneratedReviewImage(image: any = {}, screen: any = {}) {
  const sourceScreenId = image.source_screen_id || screen.id || 'screen-1';
  const realGenerated = image.real_generated === true && image.mock !== true && image.source !== 'mock_fixture';
  return {
    ...image,
    id: image.id || compactId('generated-review', `${sourceScreenId}:${image.path || nowIso()}`),
    source_screen_id: sourceScreenId,
    provider_model: image.provider_model || image.model || 'gpt-image-2',
    provider_surface: image.provider_surface || 'Codex App $imagegen',
    requested_fidelity: image.requested_fidelity || 'high_fidelity_automatic',
    image_input_fidelity_note: image.image_input_fidelity_note || 'gpt-image-2 high-fidelity image input is automatic',
    privacy: image.privacy || 'local-only',
    real_generated: realGenerated,
    mock: image.mock === true || image.source === 'mock_fixture',
    callout_extraction_required: true,
    callout_extraction_status: Array.isArray(image.callouts) && image.callouts.length ? 'succeeded' : (image.callout_extraction_status || 'pending'),
    callouts: Array.isArray(image.callouts) ? image.callouts : [],
    image_size_relation: {
      source_width: screen.width || null,
      source_height: screen.height || null,
      generated_width: image.width || null,
      generated_height: image.height || null,
      coordinate_transform: image.width && screen.width && image.height && screen.height
        ? image.width === screen.width && image.height === screen.height ? 'identity' : 'scaled'
        : 'unknown'
    },
    image_voxel_relation: image.image_voxel_relation || (image.id && sourceScreenId ? 'generated_callout_review_of' : null)
  };
}

function resolveImagePath(root: string, source: any) {
  const raw = String(source || '');
  return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
}

function rootFromMissionDir(dir: string) {
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}`;
  const idx = dir.indexOf(marker);
  return idx >= 0 ? dir.slice(0, idx) : process.cwd();
}

async function readExistingJson(dir: any, file: any) {
  try {
    const raw = await fsp.readFile(path.join(dir, file), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
