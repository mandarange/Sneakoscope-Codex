import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('runtime gate accepts Image UX reference-only partial closeout without generated-image fields', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const runtimeGates = await importDist('core/pipeline-internals/runtime-gates.js');
  const { root, imagePath } = await tempImageRoot('sks-ux-reference-gate-');
  const { contract, inventory } = await capturedInventory(imageUx, root, imagePath);
  const generated = imageUx.buildImageUxGeneratedReviewLedger(contract, inventory);
  const issueLedger = imageUx.buildImageUxIssueLedger(contract, generated);
  const policy = imageUx.buildImageUxReviewPolicy(contract);
  const iterationReport = imageUx.buildImageUxIterationReport(contract, policy, generated, issueLedger);
  const gate = imageUx.defaultImageUxReviewGate(contract, {
    inventory,
    generatedReviewLedger: generated,
    issueLedger,
    imageVoxelReferenceAnchorCreated: true,
    wrongnessChecked: true,
    honestModeComplete: true
  });
  const missionId = 'M-reference-closeout';
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(missionDir, { recursive: true });
  await fs.writeFile(path.join(missionDir, 'image-ux-review-policy.json'), JSON.stringify(policy, null, 2));
  await fs.writeFile(path.join(missionDir, 'image-ux-screen-inventory.json'), JSON.stringify(inventory, null, 2));
  await fs.writeFile(path.join(missionDir, 'image-ux-generated-review-ledger.json'), JSON.stringify(generated, null, 2));
  await fs.writeFile(path.join(missionDir, 'image-ux-issue-ledger.json'), JSON.stringify(issueLedger, null, 2));
  await fs.writeFile(path.join(missionDir, 'image-ux-iteration-report.json'), JSON.stringify(iterationReport, null, 2));
  await fs.writeFile(path.join(missionDir, 'final-honest-mode-report.json'), JSON.stringify({
    mission_id: missionId,
    verified: [{ claim: 'reference closeout fixture', evidence: ['image-ux-screen-inventory.json'] }],
    unverified: ['generated annotated image missing'],
    blocked: [{ item: 'full verification', reason: 'generated annotated image missing' }],
    risks: ['partial only']
  }, null, 2));
  await fs.writeFile(path.join(missionDir, 'image-ux-review-gate.json'), JSON.stringify(gate, null, 2));

  const status = await runtimeGates.projectGateStatus(root, {
    mission_id: missionId,
    mode: 'IMAGE_UX_REVIEW',
    stop_gate: 'image-ux-review-gate.json',
    proof_required: false,
    reflection_required: false,
    context7_required: false,
    subagents_required: false,
    scouts_required: false
  });

  assert.equal(status.ok, true);
  assert.deepEqual(status.blockers, []);
  assert.equal(gate.gpt_image_2_callout_generated, false);
  assert.equal(gate.generated_image_ingested, false);
  assert.equal(gate.issue_ledger_from_generated_callout, false);
});

test('completion proof accepts Image UX reference-only partial closeout with active wrongness recorded', async () => {
  const proofGate = await importDist('core/proof/route-proof-gate.js');
  const { root } = await tempImageRoot('sks-ux-reference-proof-');
  const missionId = 'M-reference-closeout-proof';
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(missionDir, { recursive: true });
  await fs.writeFile(path.join(missionDir, 'completion-proof.json'), JSON.stringify({
    schema: 'sks.completion-proof.v1',
    version: 'test',
    generated_at: new Date().toISOString(),
    mission_id: missionId,
    route: '$Image-UX-Review',
    status: 'verified_partial',
    summary: {
      files_changed: 0,
      commands_run: 1,
      tests_passed: 0,
      tests_failed: 0,
      manual_review_required: true
    },
    evidence: {
      image_ux_review: {
        schema: 'sks.image-ux-review-proof-evidence.v1',
        reference_only: true,
        full_review_passed: false
      },
      image_voxels: {
        schema: 'sks.image-voxel-summary.v1',
        status: 'verified_partial',
        ok: true,
        images: 1,
        anchors: 1,
        anchor_count: 1,
        relations: 0
      },
      wrongness: {
        schema: 'sks.wrongness-proof-evidence.v1',
        active_count: 1,
        high_severity_active: 1,
        medium_severity_active: 0
      }
    },
    claims: [],
    unverified: ['Generated annotated review image is missing; closeout is reference-only.'],
    blockers: [],
    next_human_actions: []
  }, null, 2));

  const status = await proofGate.validateRouteCompletionProof(root, {
    missionId,
    route: '$Image-UX-Review',
    state: { proof_required: true, scouts_required: false },
    visualClaim: true
  });

  assert.equal(status.ok, true);
  assert.deepEqual(status.issues, []);
});

test('trust report accepts Image UX reference-only partial closeout with active wrongness recorded', async () => {
  const trust = await importDist('core/trust-kernel/trust-report.js');
  const report = trust.buildTrustReport({
    proof: {
      mission_id: 'M-reference-closeout-trust',
      route: '$Image-UX-Review',
      status: 'verified_partial',
      evidence: {
        image_ux_review: {
          schema: 'sks.image-ux-review-proof-evidence.v1',
          status: 'verified_partial',
          reference_only: true,
          source_screenshots_count: 1,
          generated_gpt_image_2_callout_images_count: 0,
          generated_images_total: 0,
          callout_extraction_schema_status: 'valid',
          recapture_re_review_status: 'complete_or_not_applicable',
          full_verification_blockers: ['missing_generated_annotated_review_images'],
          blockers: []
        },
        image_voxels: {
          schema: 'sks.image-voxel-summary.v1',
          status: 'verified_partial',
          ok: true,
          anchors: 1,
          anchor_count: 1
        },
        wrongness: {
          schema: 'sks.wrongness-proof-evidence.v1',
          active_count: 1,
          high_severity_active: 1,
          medium_severity_active: 0
        }
      },
      claims: [],
      unverified: ['Reference-only closeout; full UX verification is not claimed.'],
      blockers: []
    },
    evidenceIndex: { status: 'verified_partial', records: [] },
    contract: { validation: { ok: true, status: 'verified_partial', issues: [] } }
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, 'verified_partial');
  assert.deepEqual(report.issues, []);
  assert.equal(report.image_ux_review.reference_only, true);
  assert.ok(report.image_ux_review.full_verification_blockers.includes('missing_generated_annotated_review_images'));
});
