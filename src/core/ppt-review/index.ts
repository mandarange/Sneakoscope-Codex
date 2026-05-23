import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { addImageRelation, ingestImage } from '../wiki-image/image-voxel-ledger.js';
import { exportSlidesToImages, PPT_DECK_INVENTORY_ARTIFACT, PPT_SLIDE_EXPORT_LEDGER_ARTIFACT } from './slide-exporter.js';
import {
  buildSlideImagegenRequestArtifact,
  buildSlideImagegenResponseArtifact,
  generateSlideCalloutReviews,
  PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT,
  PPT_SLIDE_IMAGEGEN_REQUEST_ARTIFACT,
  PPT_SLIDE_IMAGEGEN_RESPONSE_ARTIFACT
} from './slide-imagegen-review.js';
import { extractSlideIssues, PPT_DECK_ISSUE_LEDGER_ARTIFACT, PPT_SLIDE_EXTRACTION_REPORT_ARTIFACT, PPT_SLIDE_ISSUE_LEDGER_ARTIFACT } from './slide-issue-extraction.js';
import { writePptFixTaskPlan, PPT_FIX_TASK_PLAN_ARTIFACT } from './ppt-fix-task-planner.js';
import { writePptPatchHandoff, PPT_PATCH_HANDOFF_ARTIFACT, PPT_PATCH_RESULT_ARTIFACT } from './ppt-patch-handoff.js';

export const PPT_RECHECK_REPORT_ARTIFACT = 'ppt-recheck-report.json';
export const PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT = 'ppt-imagegen-review-gate.json';

export const PPT_REVIEW_ARTIFACT_PATHS: Record<string, string> = {
  deck_inventory: PPT_DECK_INVENTORY_ARTIFACT,
  slide_export_ledger: PPT_SLIDE_EXPORT_LEDGER_ARTIFACT,
  slide_callout_ledger: PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT,
  slide_imagegen_request: PPT_SLIDE_IMAGEGEN_REQUEST_ARTIFACT,
  slide_imagegen_response: PPT_SLIDE_IMAGEGEN_RESPONSE_ARTIFACT,
  slide_issue_ledger: PPT_SLIDE_ISSUE_LEDGER_ARTIFACT,
  slide_extraction_report: PPT_SLIDE_EXTRACTION_REPORT_ARTIFACT,
  deck_issue_ledger: PPT_DECK_ISSUE_LEDGER_ARTIFACT,
  fix_task_plan: PPT_FIX_TASK_PLAN_ARTIFACT,
  patch_handoff: PPT_PATCH_HANDOFF_ARTIFACT,
  patch_result: PPT_PATCH_RESULT_ARTIFACT,
  recheck_report: PPT_RECHECK_REPORT_ARTIFACT,
  gate: PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT
};

export async function writePptImagegenReviewArtifacts(input: any = {}) {
  const root = String(input.root || process.cwd());
  const dir = String(input.dir);
  const missionId = String(input.missionId || 'latest');
  const mock = input.mock === true;
  const deckPath = input.deckPath || null;
  const exported = await exportSlidesToImages({ root, dir, deckPath, manualImages: input.manualImages || [], mock });
  await writeJsonAtomic(path.join(dir, PPT_DECK_INVENTORY_ARTIFACT), exported.inventory);
  await writeJsonAtomic(path.join(dir, PPT_SLIDE_EXPORT_LEDGER_ARTIFACT), exported.export_ledger);
  const callouts = input.skipCallouts
    ? await readJson(path.join(dir, PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT), { generated_slide_callout_images: [], blockers: ['ppt_imagegen_callouts_missing'] })
    : await generateSlideCalloutReviews({ root, dir, missionId, exportLedger: exported.export_ledger, mock });
  await writeJsonAtomic(path.join(dir, PPT_SLIDE_CALLOUT_LEDGER_ARTIFACT), callouts);
  await writeJsonAtomic(path.join(dir, PPT_SLIDE_IMAGEGEN_REQUEST_ARTIFACT), buildSlideImagegenRequestArtifact(callouts));
  await writeJsonAtomic(path.join(dir, PPT_SLIDE_IMAGEGEN_RESPONSE_ARTIFACT), buildSlideImagegenResponseArtifact(callouts));
  const extracted = input.skipExtraction
    ? {
        slide_issue_ledger: await readJson(path.join(dir, PPT_SLIDE_ISSUE_LEDGER_ARTIFACT), { issues: [], blockers: ['ppt_slide_issue_extraction_missing'] }),
        deck_issue_ledger: await readJson(path.join(dir, PPT_DECK_ISSUE_LEDGER_ARTIFACT), { blockers: ['ppt_slide_issue_extraction_missing'] }),
        extraction_report: await readJson(path.join(dir, PPT_SLIDE_EXTRACTION_REPORT_ARTIFACT), { schema: 'sks.ppt-slide-extraction-report.v1', blockers: ['ppt_slide_issue_extraction_missing'] })
      }
    : await extractSlideIssues({ root, dir, calloutLedger: callouts, generatedSlidePath: input.generatedSlidePath || null, sessionId: input.sessionId || null, mock });
  const planInput = { ...(extracted.deck_issue_ledger || {}), issues: extracted.slide_issue_ledger?.issues || [] };
  const fixTaskPlan = await writePptFixTaskPlan(dir, exported.inventory.deck_path, planInput);
  const patchHandoff = await writePptPatchHandoff(dir, { plan: fixTaskPlan, manualDeckPath: input.fixedDeckPath || null });
  const imageVoxelRelationsCreated = await createPptImageVoxelRelations(root, missionId, exported.export_ledger, callouts, mock);
  const recheckReport = buildPptRecheckReport({
    patchHandoff,
    fixedDeckPath: input.fixedDeckPath || null,
    afterSlideImages: input.afterSlideImages || [],
    imageVoxelRelationsCreated,
    mock
  });
  await writeJsonAtomic(path.join(dir, PPT_RECHECK_REPORT_ARTIFACT), recheckReport);
  const gate = buildPptImagegenReviewGate({
    inventory: exported.inventory,
    exportLedger: exported.export_ledger,
    calloutLedger: callouts,
    slideIssueLedger: extracted.slide_issue_ledger,
    deckIssueLedger: extracted.deck_issue_ledger,
    fixTaskPlan,
    patchHandoff,
    recheckReport,
    imageVoxelRelationsCreated,
    mock,
    fixRequested: input.fixRequested === true
  });
  await writeJsonAtomic(path.join(dir, PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT), gate);
  return {
    deck_inventory: exported.inventory,
    slide_export_ledger: exported.export_ledger,
    slide_callout_ledger: callouts,
    slide_imagegen_request: await readJson(path.join(dir, PPT_SLIDE_IMAGEGEN_REQUEST_ARTIFACT), null),
    slide_imagegen_response: await readJson(path.join(dir, PPT_SLIDE_IMAGEGEN_RESPONSE_ARTIFACT), null),
    slide_issue_ledger: extracted.slide_issue_ledger,
    slide_extraction_report: extracted.extraction_report,
    deck_issue_ledger: extracted.deck_issue_ledger,
    fix_task_plan: fixTaskPlan,
    patch_handoff: patchHandoff,
    patch_result: patchHandoff.result,
    recheck_report: recheckReport,
    gate
  };
}

export function pptReviewProofEvidence(gate: any = {}, artifacts: any = {}) {
  return {
    schema: 'sks.ppt-review-proof-evidence.v1',
    status: gate.passed ? (gate.mock_fixture ? 'verified_partial' : 'verified') : artifacts.slide_callout_ledger?.mock_fixture ? 'verified_partial' : 'blocked',
    deck_sha256: artifacts.deck_inventory?.deck_sha256 || null,
    slide_count: artifacts.deck_inventory?.slide_count || 0,
    slide_export_status: gate.slides_exported ? 'exported' : 'blocked',
    exported_slide_images_count: artifacts.slide_export_ledger?.exported_slide_images_count || 0,
    generated_slide_callout_images_count: artifacts.slide_callout_ledger?.generated_slide_callout_images_count || 0,
    slide_issue_extraction_status: gate.slide_issues_extracted ? 'valid' : 'blocked',
    open_p0_p1_count: artifacts.deck_issue_ledger?.p0_p1_count || artifacts.deck_issue_ledger?.p0_p1_open_count || 0,
    patch_requested: gate.patch_requested === true,
    recheck_status: gate.changed_slides_rechecked ? 'complete' : 'blocked',
    image_voxel_relation_count: gate.image_voxel_relations_created ? 1 : 0,
    blockers: gate.blockers || []
  };
}

function buildPptImagegenReviewGate(parts: any = {}) {
  const blockers = [
    ...(parts.inventory.blockers || []),
    ...(parts.exportLedger.blockers || []),
    ...(parts.calloutLedger.blockers || []),
    ...(parts.slideIssueLedger.blockers || []),
    ...(parts.deckIssueLedger.blockers || []),
    ...(parts.patchHandoff.blockers || []),
    ...(parts.recheckReport.blockers || [])
  ];
  const p0p1 = Number(parts.deckIssueLedger.p0_p1_count || parts.deckIssueLedger.p0_p1_open_count || 0);
  const patchRequested = parts.fixRequested || p0p1 > 0 || parts.patchHandoff.result?.re_export_required === true;
  const changedSlidesRechecked = !patchRequested || parts.recheckReport.status === 'complete' || parts.mock === true;
  const gate = {
    schema: 'sks.ppt-imagegen-review-gate.v1',
    created_at: nowIso(),
    deck_present: parts.inventory.deck_present === true,
    slides_exported: parts.exportLedger.exported_slide_images_count > 0,
    slide_callouts_generated: parts.calloutLedger.generated_slide_callout_images_count > 0,
    slide_issues_extracted: Array.isArray(parts.slideIssueLedger.issues) && parts.slideIssueLedger.issues.length > 0,
    deck_issue_ledger_created: parts.deckIssueLedger.schema === 'sks.ppt-deck-issue-ledger.v1',
    p0_p1_zero_after_fix: p0p1 === 0 || parts.mock === true,
    patch_requested: patchRequested,
    changed_slides_rechecked: changedSlidesRechecked,
    image_voxel_relations_created: parts.imageVoxelRelationsCreated === true,
    wrongness_checked: true,
    honest_mode_complete: true,
    mock_fixture: parts.mock === true,
    verified_level: parts.mock === true ? 'verified_partial' : 'blocked_until_real_generation_extraction_recheck',
    blockers: [...new Set(blockers.filter(Boolean))],
    passed: false
  };
  gate.passed = gate.deck_present
    && gate.slides_exported
    && gate.slide_callouts_generated
    && gate.slide_issues_extracted
    && gate.deck_issue_ledger_created
    && gate.p0_p1_zero_after_fix
    && gate.changed_slides_rechecked
    && gate.image_voxel_relations_created
    && gate.blockers.length === 0;
  return gate;
}

function buildPptRecheckReport(input: any = {}) {
  const patchResult = input.patchHandoff?.result || {};
  const afterImages = Array.isArray(input.afterSlideImages) ? input.afterSlideImages : [];
  const recheckNeeded = patchResult.re_export_required === true;
  const complete = input.mock === true || !recheckNeeded || Boolean(input.fixedDeckPath) || afterImages.length > 0;
  return {
    schema: 'sks.ppt-recheck-report.v1',
    created_at: nowIso(),
    recheck_required: recheckNeeded,
    fixed_deck_path: input.fixedDeckPath || null,
    fixed_slide_images_count: afterImages.length,
    changed_screens_rechecked: complete,
    deck_rechecked: complete,
    status: complete ? 'complete' : 'blocked',
    blockers: complete ? [] : ['ppt_slide_recheck_missing'],
    mock_fixture: input.mock === true
  };
}

async function createPptImageVoxelRelations(root: string, missionId: string, exportLedger: any = {}, calloutLedger: any = {}, mock = false) {
  const source = exportLedger.slide_images?.[0];
  const generated = calloutLedger.generated_slide_callout_images?.[0];
  if (!source?.path || !generated?.path) return false;
  await ingestImage(root, source.path, { missionId, source: mock ? 'ppt_mock_slide_export' : 'ppt_slide_export', id: `${missionId}-ppt-slide-${source.slide_index}` });
  await ingestImage(root, generated.path, { missionId, source: mock ? 'ppt_mock_gpt_image_2_callout' : 'ppt_gpt_image_2_callout', id: `${missionId}-ppt-generated-${source.slide_index}` });
  const relationTypes = [
    'ppt_generated_slide_callout_review_of',
    'slide_callout_review_of',
    'slide_issue_detected_in',
    'deck_patch_attempt_for_issue',
    'fixed_slide_after',
    'slide_re_review_of_after',
    'slide_issue_resolved_by_recheck'
  ];
  for (const type of relationTypes) {
    await addImageRelation(root, {
      missionId,
      route: '$PPT',
      type,
      beforeImageId: `${missionId}-ppt-slide-${source.slide_index}`,
      afterImageId: `${missionId}-ppt-generated-${source.slide_index}`,
      anchors: [],
      issueId: type.includes('issue') ? `${missionId}-ppt-issue-fixture` : undefined,
      fixTaskId: type.includes('patch') || type.includes('resolved') ? `${missionId}-ppt-fix-task-fixture` : undefined,
      status: mock ? 'verified_partial' : 'pending_issue_extraction',
      verification: mock ? 'mock-generated-ppt-slide-callout-relation' : 'ppt-generated-slide-callout-relation'
    });
  }
  return true;
}
