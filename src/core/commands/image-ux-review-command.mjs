import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, nowIso, projectRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { createMission, findLatestMission, loadMission } from '../mission.mjs';
import { flag } from '../../cli/args.mjs';
import { printJson } from '../../cli/output.mjs';
import { IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT, writeImageUxReviewRouteArtifacts } from '../image-ux-review.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';

export async function imageUxReviewCommand(command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'fixture') return imageUxFixture(root, command, args);
  const missionArg = args[1] && !String(args[1]).startsWith('--') ? args[1] : 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    const result = { schema: 'sks.image-ux-review-status.v1', ok: false, status: 'missing_mission' };
    if (flag(args, '--json')) return printJson(result);
    console.error('No mission found.');
    process.exitCode = 1;
    return;
  }
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  if (action === 'build' || action === 'run' || action === 'proof' || (action === 'status' && flag(args, '--mock'))) {
    const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, wrongnessChecked: true, honestModeComplete: action === 'proof' });
    const route = routeForCommand(command);
    const artifactList = Object.entries(artifacts)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key]) => key === 'honest_mode_evidence' ? 'final-honest-mode-report.json' : key);
    const visualEvidence = {
      image_ux_review: {
        schema: 'sks.image-ux-review-proof-evidence.v1',
        status: artifacts.gate?.verified_level || (artifacts.gate?.passed ? 'verified_partial' : 'blocked'),
        gate_status: artifacts.gate?.status || null,
        reference_only: artifacts.gate?.reference_only === true,
        full_review_passed: artifacts.gate?.full_review_passed === true,
        full_verification_blockers: artifacts.gate?.full_verification_blockers || []
      }
    };
    const proof = await maybeFinalizeRoute(root, { missionId, route, gateFile: 'image-ux-review-gate.json', gate: artifacts.gate, mock: flag(args, '--mock'), visual: true, visualEvidence, artifacts: artifactList, claims: [{ id: 'image-ux-review-fixture', status: 'verified_partial' }], scouts: artifacts.gate?.full_review_passed === true ? undefined : false, allowActiveWrongnessPartial: artifacts.gate?.reference_only === true, command: { cmd: `sks ${command} ${action}`, status: 0 } });
    const result = { schema: 'sks.image-ux-review-build.v1', ok: proof.ok && artifacts.gate?.passed === true, status: artifacts.gate?.status || (artifacts.gate?.passed ? 'passed' : 'blocked'), mission_id: missionId, artifacts, proof: proof.validation };
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image UX review: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
    if (!proof.ok) process.exitCode = 1;
    return;
  }
  const gate = await readJson(path.join(dir, 'image-ux-review-gate.json'), null);
  const result = { schema: 'sks.image-ux-review-status.v1', ok: true, mission_id: missionId, status: gate?.status || (gate?.passed ? 'passed' : gate ? 'blocked' : 'missing'), verified_level: gate?.verified_level || null, reference_only: gate?.reference_only === true, gate };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX Review mission: ${missionId}`);
  console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
}

async function imageUxFixture(root, command, args) {
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
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), {
    schema_version: 1,
    created_at: nowIso(),
    provider: { model: 'gpt-image-2', preferred_surface: 'Codex App $imagegen' },
    generated_review_images: [{ id: 'generated-review-fixture-1', source_screen_id: 'screen-1', path: relImage, status: 'generated', callouts: [{ id: 'callout-1', severity: 'P2', region: [0, 0, 1, 1] }] }],
    generated_count: 1,
    required_count: 1,
    blockers: [],
    passed: true
  });
  await writeJsonAtomic(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), {
    schema_version: 1,
    issues: [{ id: 'issue-fixture-1', severity: 'P2', screen_id: 'screen-1', callout_id: 'callout-1', region: [0, 0, 1, 1], evidence_image_id: 'generated-review-fixture-1', title: 'Fixture density note', detail: 'Mock fixture issue extracted from generated review ledger.', fix_action: 'No-op fixture recheck', status: 'fixed' }]
  });
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract, { root, imageVoxelRelationsCreated: true, wrongnessChecked: true, honestModeComplete: true });
  const gate = { ...artifacts.gate, passed: true, honest_mode_complete: true, blockers: [] };
  artifacts.gate = gate;
  await writeJsonAtomic(path.join(dir, 'image-ux-review-gate.json'), gate);
  const route = routeForCommand(command);
  const proof = await maybeFinalizeRoute(root, { missionId: id, route, gateFile: 'image-ux-review-gate.json', gate, mock: true, visual: true, requireRelation: flag(args, '--require-relation'), artifacts: ['image-ux-screen-inventory.json', 'image-ux-generated-review-ledger.json', 'image-ux-issue-ledger.json', 'image-voxel-ledger.json', 'visual-anchors.json', 'completion-proof.json'], claims: [{ id: 'image-ux-review-fixture', status: 'verified_partial' }], command: { cmd: `sks ${command} fixture --mock`, status: 0 } });
  const result = { schema: 'sks.image-ux-review-fixture.v1', ok: proof.ok, mission_id: id, artifacts, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX fixture: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
}

function routeForCommand(command) {
  return command === 'ux-review' ? '$UX-Review' : command === 'visual-review' ? '$Visual-Review' : command === 'ui-ux-review' ? '$UI-UX-Review' : '$Image-UX-Review';
}
