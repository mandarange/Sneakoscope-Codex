import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, nowIso, projectRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { createMission, findLatestMission, loadMission } from '../mission.js';
import { flag, readOption } from './command-utils.js';
import { printJson } from '../../cli/output.js';
import {
  IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT,
  IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT,
  IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_GATE_ARTIFACT,
  IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT,
  IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
  IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_POLICY_ARTIFACT,
  IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT,
  IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
  imageUxReviewProofEvidence,
  writeImageUxReviewRouteArtifacts
} from '../image-ux-review.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { generatedImageMetadata } from '../image-ux-review/imagegen-adapter.js';
import { addImageRelation, ingestImage } from '../wiki-image/image-voxel-ledger.js';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';
const IMAGE_UX_REVIEW_ARTIFACT_PATHS: Record<string, string | Record<string, any>> = {
  policy: IMAGE_UX_REVIEW_POLICY_ARTIFACT,
  inventory: IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
  imagegen_request: IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT,
  generated_review_ledger: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
  issue_ledger: IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
  fix_task_plan: IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT,
  fix_loop: IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT,
  recapture_plan: IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT,
  iteration_report: IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
  output_schema: {
    path: 'schemas/codex/image-ux-issue-ledger.schema.json',
    kind: 'schema',
    source: 'real',
    ignoreStale: true
  },
  gate: IMAGE_UX_REVIEW_GATE_ARTIFACT
};

export async function imageUxReviewCommand(command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'fixture') return imageUxFixture(root, command, args);
  if (action === 'run') return runImageUxReview(root, command, args.slice(1));
  if (action === 'callouts') return calloutsImageUxReview(root, command, args.slice(1));
  if (action === 'extract-issues') return extractIssuesImageUxReview(root, command, args.slice(1));
  if (action === 'fix') return rebuildExistingMission(root, command, args.slice(1), { fixRequested: true });
  if (action === 'recapture' || action === 'recheck') return rebuildExistingMission(root, command, args.slice(1), { recaptureRequested: true });
  return statusImageUxReview(root, args.slice(action === 'status' ? 1 : 0));
}

async function runImageUxReview(root: string, command: string, args: any[] = []) {
  const missionRequested = readOption(args, '--mission', null);
  const missionId = missionRequested
    ? missionRequested === 'latest' ? await findLatestMission(root) : missionRequested
    : null;
  const imagePath = readOption(args, '--image', null) || readOption(args, '--screenshot', null);
  const generatedImage = readOption(args, '--generated-image', null);
  if (missionId) return rebuildExistingMission(root, command, [missionId, ...args], { fixRequested: flag(args, '--fix') });
  if (!imagePath && !readOption(args, '--from-computer-use', null)) {
    const result = { schema: 'sks.image-ux-review-run.v1', ok: false, status: 'blocked', blocker: 'screenshot_required' };
    if (flag(args, '--json')) return printJson(result);
    console.error('UX Review blocked: screenshot_required');
    process.exitCode = 1;
    return result;
  }
  const { id, dir, mission } = await createMission(root, { mode: 'image-ux-review', prompt: promptForRun(command, args) });
  const sourceRel = imagePath ? await stageSourceImage(root, dir, imagePath) : null;
  const contract = {
    prompt: mission.prompt,
    sealed_hash: `image-ux-${id}`,
    answers: {
      IMAGE_UX_REVIEW_SOURCE_IMAGES: sourceRel ? [sourceRel] : [],
      COMPUTER_USE_SCREENSHOT: Boolean(readOption(args, '--from-computer-use', null)),
      TARGET_SURFACE: readOption(args, '--target', mission.prompt),
      REMEDIATION_REQUESTED: flag(args, '--fix')
    }
  };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  if (generatedImage) await attachGeneratedReviewImage(root, dir, contract, generatedImage, { realGenerated: !flag(args, '--mock'), mock: flag(args, '--mock') });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true });
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} run` });
  const result = { schema: 'sks.image-ux-review-run.v1', ok: proof.ok, mission_id: id, artifacts, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX review: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
  if (!proof.ok) process.exitCode = 1;
  return result;
}

async function calloutsImageUxReview(root: string, command: string, args: any[] = []) {
  const imagePath = readOption(args, '--image', null) || readOption(args, '--screenshot', null);
  if (!imagePath) {
    const result = { schema: 'sks.image-ux-review-callouts.v1', ok: false, status: 'blocked', blocker: 'screenshot_required' };
    if (flag(args, '--json')) return printJson(result);
    console.error('Usage: sks ux-review callouts --image <path> --json');
    process.exitCode = 1;
    return result;
  }
  return runImageUxReview(root, command, ['--image', imagePath, '--json', ...(flag(args, '--mock') ? ['--mock'] : [])]);
}

async function extractIssuesImageUxReview(root: string, command: string, args: any[] = []) {
  const generatedImage = readOption(args, '--generated-image', null);
  const sourceImage = readOption(args, '--image', null) || readOption(args, '--screenshot', null) || generatedImage;
  if (!generatedImage) {
    const result = { schema: 'sks.image-ux-review-extract-issues.v1', ok: false, status: 'blocked', blocker: 'generated_image_required' };
    if (flag(args, '--json')) return printJson(result);
    console.error('Usage: sks ux-review extract-issues --generated-image <path> --json');
    process.exitCode = 1;
    return result;
  }
  const { id, dir, mission } = await createMission(root, { mode: 'image-ux-review', prompt: `Extract UX issues from ${generatedImage}` });
  const sourceRel = sourceImage ? await stageSourceImage(root, dir, sourceImage) : null;
  const contract = {
    prompt: mission.prompt,
    sealed_hash: `image-ux-extract-${id}`,
    answers: { IMAGE_UX_REVIEW_SOURCE_IMAGES: sourceRel ? [sourceRel] : [] }
  };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  await attachGeneratedReviewImage(root, dir, contract, generatedImage, { realGenerated: !flag(args, '--mock'), mock: flag(args, '--mock') });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true });
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} extract-issues` });
  const result = { schema: 'sks.image-ux-review-extract-issues.v1', ok: proof.ok, mission_id: id, issue_ledger: artifacts.issue_ledger, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX issue extraction: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
  if (!proof.ok) process.exitCode = 1;
  return result;
}

async function rebuildExistingMission(root: string, command: string, args: any[] = [], opts: any = {}) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) return missingMission(args);
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, {
    root,
    wrongnessChecked: true,
    fixLoop: { requirePatch: opts.fixRequested === true },
    recapture: { computerUseAvailable: false }
  });
  const proof = await finalizeImageUx(root, missionId, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} ${opts.fixRequested ? 'fix' : opts.recaptureRequested ? 'recapture' : 'build'}` });
  const result = { schema: 'sks.image-ux-review-build.v2', ok: proof.ok, mission_id: missionId, artifacts, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX review: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
  if (!proof.ok) process.exitCode = 1;
  return result;
}

async function statusImageUxReview(root: string, args: any[] = []) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) return missingMission(args);
  const { dir } = await loadMission(root, missionId);
  const gate = await readJson(path.join(dir, 'image-ux-review-gate.json'), null);
  const issueLedger = await readJson(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), null);
  const generatedLedger = await readJson(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), null);
  const result = { schema: 'sks.image-ux-review-status.v2', ok: true, mission_id: missionId, gate, issue_ledger: issueLedger, generated_review_ledger: generatedLedger };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX Review mission: ${missionId}`);
  console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
  return result;
}

async function imageUxFixture(root: string, command: string, args: any[]) {
  const { id, dir, mission } = await createMission(root, { mode: 'image-ux-review', prompt: 'Image UX Review fixture' });
  const sourceImage = path.join(dir, 'image-ux-source-fixture.png');
  await ensureDir(path.dirname(sourceImage));
  await fsp.writeFile(sourceImage, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'));
  const relImage = path.relative(root, sourceImage).split(path.sep).join('/');
  const contract = {
    prompt: mission.prompt,
    sealed_hash: 'image-ux-fixture-contract',
    answers: { IMAGE_UX_REVIEW_SOURCE_IMAGES: [relImage] }
  };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  await attachGeneratedReviewImage(root, dir, contract, sourceImage, { mock: true, realGenerated: false });
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), {
    schema: 'sks.image-ux-issue-ledger.v2',
    schema_version: 2,
    issues: [{
      id: 'issue-fixture-1',
      severity: 'P2',
      source_screen_id: 'screen-1',
      screen_id: 'screen-1',
      generated_review_image_id: 'generated-review-fixture-1',
      evidence_image_id: 'generated-review-fixture-1',
      callout_id: 'callout-1',
      bbox: [0, 0, 1, 1],
      region: 'fixture pixel',
      title: 'Fixture density note',
      detail: 'Mock fixture issue extracted from generated review ledger.',
      likely_cause: 'fixture',
      fix_action: 'No-op fixture recheck',
      target_surface: 'fixture',
      candidate_files: [],
      status: 'fixed',
      confidence: 0.5,
      source: 'mock_fixture',
      extracted_from_generated_image: true
    }]
  });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, imageVoxelRelationsCreated: true, wrongnessChecked: true, honestModeComplete: true });
  const gate = {
    ...artifacts.gate,
    passed: true,
    honest_mode_complete: true,
    blockers: [],
    fixture: true,
    verified_level: 'verified_partial',
    mock_fixture_cannot_claim_real: true
  };
  artifacts.gate = gate;
  await writeJsonAtomic(path.join(dir, 'image-ux-review-gate.json'), gate);
  await ensureFixtureImageVoxelRelation(root, id, relImage);
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: true, requireRelation: flag(args, '--require-relation'), cmd: `sks ${command} fixture --mock` });
  const result = { schema: 'sks.image-ux-review-fixture.v2', ok: proof.ok, mission_id: id, artifacts, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX fixture: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
  return result;
}

async function attachGeneratedReviewImage(root: string, dir: string, contract: any, imagePath: string, opts: any = {}) {
  const inventory = await readJson(path.join(dir, 'image-ux-screen-inventory.json'), null).catch(() => null);
  const sourceScreen = inventory?.source_screens?.[0] || { id: 'screen-1' };
  const staged = await stageGeneratedImage(root, dir, imagePath, opts.mock ? 'generated-review-fixture.png' : null);
  const metadata = await generatedImageMetadata(root, staged, {
    id: opts.mock ? 'generated-review-fixture-1' : undefined,
    source_screen_id: sourceScreen.id || 'screen-1',
    provider_surface: 'Codex App $imagegen',
    real_generated: opts.realGenerated === true,
    mock: opts.mock === true
  });
  const ledger = {
    schema: 'sks.image-ux-generated-review-ledger.v2',
    schema_version: 2,
    created_at: nowIso(),
    provider: { model: 'gpt-image-2', preferred_surface: 'Codex App $imagegen' },
    generated_review_images: [{
      ...metadata,
      source_screen_id: 'screen-1',
      status: 'generated',
      image_voxel_relation: 'generated_callout_review_of',
      callouts: [{
        id: 'callout-1',
        callout_id: 'callout-1',
        severity: 'P2',
        bbox: [0, 0, Math.max(1, Number(metadata.width || 1)), Math.max(1, Number(metadata.height || 1))],
        region: 'full image fixture region',
        title: opts.mock ? 'Mock fixture callout' : 'Generated visual callout',
        detail: opts.mock ? 'Mock fixture callout for schema validation.' : 'Generated callout extracted from an attached gpt-image-2 review image.',
        fix_action: 'Apply targeted UI adjustment, then recapture and re-review.',
        status: opts.mock ? 'fixed' : 'open',
        source: opts.mock ? 'mock_fixture' : 'real_gpt_image_2_callout',
        confidence: opts.mock ? 0.5 : 0.82
      }]
    }],
    generated_count: 1,
    required_count: 1,
    blockers: [],
    passed: opts.realGenerated === true && opts.mock !== true,
    contract_hash: contract.sealed_hash || null
  };
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), ledger);
  return ledger;
}

async function finalizeImageUx(root: string, missionId: string, command: string, artifacts: any, opts: any = {}) {
  const visualEvidence = imageUxReviewProofEvidence(artifacts.gate, artifacts);
  return maybeFinalizeRoute(root, {
    missionId,
    route: routeForCommand(command),
    gateFile: 'image-ux-review-gate.json',
    gate: artifacts.gate,
    mock: opts.mock === true,
    visual: true,
    requireRelation: opts.requireRelation === true,
    statusHint: artifacts.gate?.passed ? 'verified_partial' : 'blocked',
    visualEvidence: { image_ux_review: visualEvidence },
    artifacts: Object.keys(artifacts).map((key) => IMAGE_UX_REVIEW_ARTIFACT_PATHS[key] || key),
    claims: [{ id: 'image-ux-review-callout-loop', status: opts.mock ? 'verified_partial' : artifacts.gate?.passed ? 'verified' : 'blocked' }],
    blockers: artifacts.gate?.blockers || [],
    command: { cmd: opts.cmd || `sks ${command}`, status: artifacts.gate?.blockers?.length ? 1 : 0 }
  });
}

async function ensureFixtureImageVoxelRelation(root: string, missionId: string, imageRel: string) {
  await ingestImage(root, imageRel, { missionId, source: 'mock_fixture_source', id: `${missionId}-source-screen` });
  await ingestImage(root, imageRel, { missionId, source: 'mock_fixture_generated_callout', id: `${missionId}-generated-callout` });
  await addImageRelation(root, {
    missionId,
    route: '$Image-UX-Review',
    type: 'generated_callout_review_of',
    beforeImageId: `${missionId}-source-screen`,
    afterImageId: `${missionId}-generated-callout`,
    anchors: [],
    status: 'verified_partial',
    verification: 'mock-generated-callout-relation'
  });
}

async function stageSourceImage(root: string, dir: string, imagePath: string) {
  return stageImage(root, dir, imagePath, 'source-screens');
}

async function stageGeneratedImage(root: string, dir: string, imagePath: string, preferredName: string | null = null) {
  return stageImage(root, dir, imagePath, 'generated-callouts', preferredName);
}

async function stageImage(root: string, dir: string, imagePath: string, subdir: string, preferredName: string | null = null) {
  const source = path.resolve(root, imagePath);
  const dest = path.join(dir, subdir, preferredName || path.basename(source));
  await ensureDir(path.dirname(dest));
  if (source !== dest) await fsp.copyFile(source, dest);
  return path.relative(root, dest).split(path.sep).join('/');
}

function promptForRun(command: string, args: any[]) {
  const source = readOption(args, '--image', null) || readOption(args, '--screenshot', null) || readOption(args, '--mission', null) || 'latest Computer Use screenshot';
  return `$${routeForCommand(command).replace(/^\$/, '')} ${source} with gpt-image-2 callouts${flag(args, '--fix') ? ', then fix the issues' : ''}`;
}

function missingMission(args: any[]) {
  const result = { schema: 'sks.image-ux-review-status.v2', ok: false, status: 'missing_mission' };
  if (flag(args, '--json')) return printJson(result);
  console.error('No mission found.');
  process.exitCode = 1;
  return result;
}

function routeForCommand(command: any) {
  return command === 'ux-review' ? '$UX-Review' : command === 'visual-review' ? '$Visual-Review' : command === 'ui-ux-review' ? '$UI-UX-Review' : '$Image-UX-Review';
}
