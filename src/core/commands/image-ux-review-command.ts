import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, nowIso, projectRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { createMission, findLatestMission, loadMission } from '../mission.js';
import { flag, readOption } from './command-utils.js';
import { printJson } from '../../cli/output.js';
import {
  IMAGE_UX_REVIEW_FIX_LOOP_ARTIFACT,
  IMAGE_UX_REVIEW_FIX_TASK_PLAN_ARTIFACT,
  IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT,
  IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT,
  IMAGE_UX_REVIEW_GATE_ARTIFACT,
  IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT,
  IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT,
  IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT,
  IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
  IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_POLICY_ARTIFACT,
  IMAGE_UX_REVIEW_RECAPTURE_ARTIFACT,
  IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
  imageUxReviewProofEvidence,
  buildImageUxCalloutExtractionReport,
  writeImageUxReviewRouteArtifacts
} from '../image-ux-review.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { generatedImageMetadata, generateGptImage2CalloutReview } from '../image-ux-review/imagegen-adapter.js';
import { extractRealCallouts } from '../image-ux-review/real-callout-extractor.js';
import { addImageRelation, ingestImage } from '../wiki-image/image-voxel-ledger.js';
import { sha256File, imageDimensions } from '../wiki-image/image-hash.js';
import { writeRouteCollaborationArtifacts } from '../agents/route-collaboration-ledger.js';
import { codexChromeExtensionStatus } from '../codex-app.js';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';
const IMAGE_UX_REVIEW_ARTIFACT_PATHS: Record<string, string | Record<string, any>> = {
  policy: IMAGE_UX_REVIEW_POLICY_ARTIFACT,
  inventory: IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
  imagegen_request: IMAGE_UX_REVIEW_IMAGEGEN_REQUEST_ARTIFACT,
  gpt_image_2_request: IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT,
  imagegen_response: IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT,
  generated_review_ledger: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
  issue_ledger: IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
  callout_extraction_report: IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT,
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
  honest_mode_evidence: IMAGE_UX_REVIEW_HONEST_MODE_ARTIFACT,
  gate: IMAGE_UX_REVIEW_GATE_ARTIFACT
};

export async function imageUxReviewCommand(command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'fixture') return imageUxFixture(root, command, args);
  if (action === 'run') return runImageUxReview(root, command, args.slice(1));
  if (action === 'callouts') return calloutsImageUxReview(root, command, args.slice(1));
  if (action === 'extract-issues') return extractIssuesImageUxReview(root, command, args.slice(1));
  if (action === 'attach-generated') return attachGeneratedImageCommand(root, command, args.slice(1));
  if (action === 'attach-after') return attachAfterImageCommand(root, command, args.slice(1));
  if (action === 'fix') return rebuildExistingMission(root, command, args.slice(1), { fixRequested: true });
  if (action === 'recapture' || action === 'recheck') return rebuildExistingMission(root, command, args.slice(1), { recaptureRequested: true });
  if (action === 'proof') return rebuildExistingMission(root, command, args.slice(1), { proofRequested: true });
  if (action === 'explain') return explainImageUxReview(root, args.slice(1));
  return statusImageUxReview(root, args.slice(action === 'status' ? 1 : 0));
}

async function runImageUxReview(root: string, command: string, args: any[] = []) {
  const missionRequested = readOption(args, '--mission', null);
  const missionId = missionRequested
    ? missionRequested === 'latest' ? await findLatestMission(root) : missionRequested
    : null;
  const imagePath = readOption(args, '--image', null) || readOption(args, '--screenshot', null);
  const generatedImage = readOption(args, '--generated-image', null);
  const shouldGenerateCallouts = flag(args, '--generate-callouts') || flag(args, '--fix');
  if (missionId) return rebuildExistingMission(root, command, [missionId, ...args], { fixRequested: flag(args, '--fix') });
  const fromChromeExtension = flag(args, '--from-chrome-extension') || Boolean(readOption(args, '--from-chrome-extension', null));
  const fromComputerUse = flag(args, '--from-computer-use') || Boolean(readOption(args, '--from-computer-use', null));
  const chromePreflight = fromChromeExtension ? await codexChromeExtensionStatus() : null;
  if (chromePreflight && !chromePreflight.ok) {
    const result = {
      schema: 'sks.image-ux-review-run.v1',
      ok: false,
      status: 'blocked',
      blocker: 'codex_chrome_extension_setup_required',
      chrome_extension: chromePreflight,
      guidance: [
        'Install/enable the Codex Chrome Extension first, then tell SKS installation is complete before resuming web UX review.'
      ]
    };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.error('UX Review blocked: install/enable the Codex Chrome Extension first, then tell SKS installation is complete before resuming.');
    console.error(chromePreflight.docs_url);
    return result;
  }
  if (fromComputerUse && !flag(args, '--native') && !flag(args, '--non-web')) {
    const result = { schema: 'sks.image-ux-review-run.v1', ok: false, status: 'blocked', blocker: 'web_ux_review_requires_codex_chrome_extension_not_computer_use' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.error('UX Review blocked: web/browser UX review requires Codex Chrome Extension, not Computer Use. Use --from-chrome-extension after setup, or provide a screenshot with --image.');
    return result;
  }
  if (!imagePath && !fromChromeExtension && !fromComputerUse) {
    const result = { schema: 'sks.image-ux-review-run.v1', ok: false, status: 'blocked', blocker: 'screenshot_required' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.error('UX Review blocked: screenshot_required');
    return result;
  }
  const { id, dir, mission } = await createMission(root, { mode: 'image-ux-review', prompt: promptForRun(command, args) });
  const sourceRel = imagePath ? await stageSourceImage(root, dir, imagePath) : null;
  const contract = {
    prompt: mission.prompt,
    sealed_hash: `image-ux-${id}`,
    answers: {
      IMAGE_UX_REVIEW_SOURCE_IMAGES: sourceRel ? [sourceRel] : [],
      CHROME_EXTENSION_SCREENSHOT: fromChromeExtension,
      CHROME_EXTENSION_PREFLIGHT_PASSED: chromePreflight?.ok === true,
      CHROME_EXTENSION_PREFLIGHT: chromePreflight,
      COMPUTER_USE_SCREENSHOT: fromComputerUse,
      TARGET_SURFACE: readOption(args, '--target', mission.prompt),
      REMEDIATION_REQUESTED: flag(args, '--fix')
    }
  };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  if (generatedImage) await attachGeneratedReviewImage(root, dir, contract, generatedImage, { realGenerated: !flag(args, '--mock'), mock: flag(args, '--mock') });
  if (!generatedImage && shouldGenerateCallouts) {
    const outputDir = path.join(dir, 'generated-callouts');
    // Auto-discover the Codex App GUI $imagegen output from ~/.codex/generated_images.
    // --strict-generated-since limits discovery to images created at/after this run
    // started (use when an old GUI image could be mistaken for this run's output);
    // otherwise a max-age window guards against stale reuse.
    const missionStartMs = Date.parse(mission.created_at || '') || undefined;
    const maxAgeOverride = readOption(args, '--generated-image-max-age-min', null);
    const result = await generateGptImage2CalloutReview({
      mission_id: id,
      source_screen_id: 'screen-1',
      source_image_path: path.resolve(root, sourceRel || imagePath),
      output_dir: outputDir,
      prompt: promptForRun(command, args),
      requested_fidelity: 'original',
      privacy: 'local-only'
    }, {
      codexApp: {
        generatedImageSinceMs: flag(args, '--strict-generated-since') ? missionStartMs : null,
        generatedImageMaxAgeMs: maxAgeOverride ? Number(maxAgeOverride) * 60 * 1000 : 30 * 60 * 1000
      }
    });
    if (result.generated_image_path) {
      const fakeGenerated = result.provider === 'fake_imagegen_adapter';
      if (result.request_artifact) await fsp.copyFile(result.request_artifact, path.join(dir, IMAGE_UX_REVIEW_GPT_IMAGE_2_REQUEST_ARTIFACT)).catch(() => {});
      if (result.response_artifact) await fsp.copyFile(result.response_artifact, path.join(dir, IMAGE_UX_REVIEW_GPT_IMAGE_2_RESPONSE_ARTIFACT)).catch(() => {});
      await attachGeneratedReviewImage(root, dir, contract, result.generated_image_path, { realGenerated: !fakeGenerated, mock: fakeGenerated, providerSurface: result.provider });
      const extraction = await extractRealCallouts({
        root,
        generatedImagePath: result.generated_image_path,
        sourceScreenshot: { id: 'screen-1' },
        sessionId: readOption(args, '--session', null) || readOption(args, '--session-id', null)
      });
      await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), extraction.issue_ledger);
      await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT), await buildImageUxCalloutExtractionReport(root, extraction, {
        generatedImagePath: result.generated_image_path,
        sourceImagePath: sourceRel || imagePath,
        provider: extraction.provider
      }));
    }
  }
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true });
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} run` });
  const result = { schema: 'sks.image-ux-review-run.v1', ok: proof.ok && artifacts.gate?.passed === true, status: artifacts.gate?.status || (artifacts.gate?.passed ? 'passed' : 'blocked'), mission_id: id, artifacts, proof: proof.validation };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX review: ${result.ok ? 'ok' : 'blocked'} ${id}`);
  return result;
}

async function calloutsImageUxReview(root: string, command: string, args: any[] = []) {
  const imagePath = readOption(args, '--image', null) || readOption(args, '--screenshot', null);
  if (!imagePath) {
    const result = { schema: 'sks.image-ux-review-callouts.v1', ok: false, status: 'blocked', blocker: 'screenshot_required' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.error('Usage: sks ux-review callouts --image <path> --json');
    return result;
  }
  return runImageUxReview(root, command, ['--image', imagePath, '--generate-callouts', '--json', ...(flag(args, '--mock') ? ['--mock'] : [])]);
}

async function extractIssuesImageUxReview(root: string, command: string, args: any[] = []) {
  const generatedImage = readOption(args, '--generated-image', null);
  const sourceImage = readOption(args, '--image', null) || readOption(args, '--screenshot', null) || generatedImage;
  if (!generatedImage) {
    const result = { schema: 'sks.image-ux-review-extract-issues.v1', ok: false, status: 'blocked', blocker: 'generated_image_required' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.error('Usage: sks ux-review extract-issues --generated-image <path> --json');
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
  if (!flag(args, '--mock')) {
    const extraction = await extractRealCallouts({
      root,
      generatedImagePath: generatedImage,
      sourceScreenshot: { id: 'screen-1' },
      sessionId: readOption(args, '--session', null) || readOption(args, '--session-id', null)
    });
    await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), extraction.issue_ledger);
    await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT), await buildImageUxCalloutExtractionReport(root, extraction, {
      generatedImagePath: generatedImage,
      sourceImagePath: sourceRel || sourceImage,
      provider: extraction.provider
    }));
  }
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true });
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} extract-issues` });
  const result = { schema: 'sks.image-ux-review-extract-issues.v1', ok: proof.ok && artifacts.gate?.passed === true, status: artifacts.gate?.status || (artifacts.gate?.passed ? 'passed' : 'blocked'), mission_id: id, issue_ledger: artifacts.issue_ledger, proof: proof.validation };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX issue extraction: ${result.ok ? 'ok' : 'blocked'} ${id}`);
  return result;
}

async function attachGeneratedImageCommand(root: string, command: string, args: any[] = []) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  const imagePath = readOption(args, '--image', null) || readOption(args, '--generated-image', null);
  if (!missionId || !imagePath) {
    const result = { schema: 'sks.image-ux-review-attach-generated.v1', ok: false, status: 'blocked', blocker: !missionId ? 'mission_required' : 'generated_image_required' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    return result;
  }
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  const ledger = await attachGeneratedReviewImage(root, dir, contract, imagePath, { realGenerated: !flag(args, '--mock'), mock: flag(args, '--mock') });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true });
  const result = { schema: 'sks.image-ux-review-attach-generated.v1', ok: artifacts.gate.generated_image_ingested === true, mission_id: missionId, generated_review_ledger: ledger, gate: artifacts.gate };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Generated image attached: ${missionId}`);
  return result;
}

async function attachAfterImageCommand(root: string, command: string, args: any[] = []) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  const imagePath = readOption(args, '--image', null) || readOption(args, '--screenshot', null);
  if (!missionId || !imagePath) {
    const result = { schema: 'sks.image-ux-review-attach-after.v1', ok: false, status: 'blocked', blocker: !missionId ? 'mission_required' : 'after_image_required' };
    process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    return result;
  }
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  const staged = await stageImage(root, dir, imagePath, 'after-screens');
  const absolute = path.resolve(root, staged);
  const dims = await imageDimensions(absolute);
  const sha = await sha256File(absolute);
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, {
    root,
    wrongnessChecked: true,
    recapture: { userScreenshot: staged, recapturedSha256: sha, recapturedDimensions: dims }
  });
  const result = { schema: 'sks.image-ux-review-attach-after.v1', ok: true, mission_id: missionId, after_screenshot: { path: staged, sha256: sha, dimensions: dims, privacy: 'local-only' }, recapture_plan: artifacts.recapture_plan };
  if (flag(args, '--json')) return printJson(result);
  console.log(`After screenshot attached: ${missionId}`);
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
    recapture: { computerUseAvailable: false },
    honestModeComplete: opts.proofRequested === true
  });
  const proof = await finalizeImageUx(root, missionId, command, artifacts, { mock: flag(args, '--mock'), cmd: `sks ${command} ${opts.fixRequested ? 'fix' : opts.recaptureRequested ? 'recapture' : 'build'}` });
  const result = { schema: 'sks.image-ux-review-build.v2', ok: proof.ok && artifacts.gate?.passed === true, status: artifacts.gate?.status || (artifacts.gate?.passed ? 'passed' : 'blocked'), mission_id: missionId, artifacts, proof: proof.validation };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX review: ${result.ok ? 'ok' : 'blocked'} ${missionId}`);
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
  console.log(`Gate: ${gate?.status || (gate?.passed ? 'passed' : gate ? 'present' : 'missing')}`);
  if (gate?.verified_level) console.log(`Verified level: ${gate.verified_level}`);
  return result;
}

async function explainImageUxReview(root: string, args: any[] = []) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) return missingMission(args);
  const { dir } = await loadMission(root, missionId);
  const gate = await readJson(path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT), null);
  const result = {
    schema: 'sks.image-ux-review-explain.v1',
    ok: Boolean(gate),
    mission_id: missionId,
    status: gate?.status || (gate?.passed ? 'passed' : 'blocked'),
    verified_level: gate?.verified_level || null,
    reference_only: gate?.reference_only === true,
    blockers: gate?.blockers || [],
    next_action: nextActionForGate(gate)
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Status: ${result.status}`);
  console.log(`Next: ${result.next_action}`);
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
    schema: 'sks.image-ux-issue-ledger.v3',
    schema_version: 3,
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
      extracted_from_generated_image: true,
      extraction_provider: 'mock_fixture',
      extraction_schema: 'sks.image-ux-issue-ledger.v3',
      generated_image_sha256: 'mock_fixture_sha256',
      bbox_coordinate_space: 'generated_image',
      bbox_confidence: 0.5,
      severity_visible: true,
      callout_number_visible: true,
      text_ocr_confidence: 0.5,
      fix_verification_status: 'recheck_verified',
      post_fix_recheck_issue_id: null
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
  const native = await writeRouteCollaborationArtifacts(root, {
    missionId: id,
    route: routeForCommand(command),
    routeKey: 'UX-Collab',
    prompt: 'UX collaboration route native agent plan for generated review images, issue extraction, safety, and proof closure.',
    mode: 'IMAGE_UX_REVIEW'
  });
  const proof = await finalizeImageUx(root, id, command, artifacts, { mock: true, requireRelation: flag(args, '--require-relation'), cmd: `sks ${command} fixture --mock` });
  const result = { schema: 'sks.image-ux-review-fixture.v2', ok: proof.ok && native.ok, mission_id: id, artifacts, native_agent_collaboration: native, proof: proof.validation };
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
    provider_surface: opts.providerSurface || 'Codex App $imagegen',
    real_generated: opts.realGenerated === true,
    mock: opts.mock === true
  });
  const ledger = {
    schema: 'sks.image-ux-generated-review-ledger.v2',
    schema_version: 2,
    created_at: nowIso(),
    status: 'generated',
    provider: { model: 'gpt-image-2', preferred_surface: 'Codex App $imagegen' },
    generated_review_images: [{
      ...metadata,
      source_screen_id: 'screen-1',
      status: 'generated',
      image_voxel_relation: 'generated_callout_review_of',
      callout_extraction_status: opts.mock ? 'succeeded' : 'pending',
      callouts: opts.mock ? [{
        id: 'callout-1',
        callout_id: 'callout-1',
        severity: 'P2',
        bbox: [0, 0, Math.max(1, Number(metadata.width || 1)), Math.max(1, Number(metadata.height || 1))],
        region: 'full image fixture region',
        title: 'Mock fixture callout',
        detail: 'Mock fixture callout for schema validation.',
        fix_action: 'Apply targeted UI adjustment, then recapture and re-review.',
        status: opts.mock ? 'fixed' : 'open',
        source: opts.mock ? 'mock_fixture' : 'real_gpt_image_2_callout',
        confidence: opts.mock ? 0.5 : 0.82,
        extraction_provider: 'mock_fixture',
        extraction_schema: 'sks.image-ux-issue-ledger.v3',
        generated_image_sha256: metadata.sha256,
        bbox_coordinate_space: 'generated_image',
        bbox_confidence: 0.5,
        severity_visible: true,
        callout_number_visible: true,
        text_ocr_confidence: 0.5,
        fix_verification_status: 'recheck_verified',
        post_fix_recheck_issue_id: null
      }] : []
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

function nextActionForGate(gate: any = {}) {
  const blockers = gate?.blockers || [];
  if (blockers.includes('missing_generated_annotated_review_images')) return 'Run `sks ux-review run --image <path> --generate-callouts --json` or attach a real generated image.';
  if (blockers.includes('callout_extraction_pending')) return 'Run `sks ux-review extract-issues --generated-image <path> --json` with Codex output-schema session or OpenAI API fallback.';
  if (blockers.includes('manual_recapture_required')) return 'Run `sks ux-review attach-after --image <path> --json` after applying patches.';
  return blockers.length ? 'Resolve listed blockers, then rerun `sks ux-review proof latest --json`.' : 'No blockers recorded.';
}

async function finalizeImageUx(root: string, missionId: string, command: string, artifacts: any, opts: any = {}) {
  const visualEvidence = imageUxReviewProofEvidence(artifacts.gate, artifacts);
  const claimStatus = artifacts.gate?.verified_level || (opts.mock ? 'verified_partial' : artifacts.gate?.passed ? 'verified' : 'blocked');
  const artifactList = Object.entries(artifacts)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key]) => IMAGE_UX_REVIEW_ARTIFACT_PATHS[key] || key);
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
    artifacts: artifactList,
    claims: [{ id: 'image-ux-review-callout-loop', status: claimStatus }],
    blockers: artifacts.gate?.blockers || [],
    allowActiveWrongnessPartial: artifacts.gate?.reference_only === true,
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
  const source = readOption(args, '--image', null) || readOption(args, '--screenshot', null) || readOption(args, '--mission', null) || 'latest Codex Chrome Extension or native Computer Use screenshot';
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
