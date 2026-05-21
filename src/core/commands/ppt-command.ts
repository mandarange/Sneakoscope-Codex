import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { createMission, findLatestMission, loadMission } from '../mission.js';
import { flag, readOption } from './command-utils.js';
import { printJson } from '../../cli/output.js';
import { writePptBuildArtifacts, writePptRouteArtifacts } from '../ppt.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { writePptImagegenReviewFixture } from '../ppt-imagegen-review.js';
import {
  PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT,
  PPT_REVIEW_ARTIFACT_PATHS,
  pptReviewProofEvidence,
  writePptImagegenReviewArtifacts
} from '../ppt-review/index.js';

export async function pptCommand(command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'fixture') return pptFixture(root, command, args);
  if (['review', 'export-slides', 'slide-export', 'callouts', 'extract-issues', 'fix', 'attach-after', 'attach-fixed-deck', 'recheck', 'proof'].includes(action)) {
    return pptImagegenReview(root, command, action, args.slice(1));
  }
  if (action === 'explain') return pptExplain(root, args.slice(1));

  const missionArg = args[1] && !String(args[1]).startsWith('--') ? args[1] : 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) return missingMission(args);
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: fixtureAnswers(), sealed_hash: 'ppt-fixture-contract' });
  if (action === 'build') {
    await writePptRouteArtifacts(dir, contract);
    const build = await writePptBuildArtifacts(dir, contract);
    const proof = await maybeFinalizeRoute(root, { missionId, route: '$PPT', gateFile: 'ppt-gate.json', gate: build.gate, mock: flag(args, '--mock'), visual: true, artifacts: Object.keys(build.files || {}), claims: [{ id: 'ppt-build-fixture', status: 'verified_partial' }], command: { cmd: `sks ppt build ${missionId}`, status: 0 } });
    const result = { schema: 'sks.ppt-build.v1', ok: proof.ok, mission_id: missionId, build, proof: proof.validation };
    if (flag(args, '--json')) return printJson(result);
    console.log(`PPT build: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
    if (!proof.ok) process.exitCode = 1;
    return result;
  }
  if (action === 'status') {
    const gate = await readJson(path.join(dir, 'ppt-gate.json'), null);
    const imagegenGate = await readJson(path.join(dir, PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT), null);
    const result = { schema: 'sks.ppt-status.v2', ok: true, mission_id: missionId, gate, imagegen_review_gate: imagegenGate };
    if (flag(args, '--json')) return printJson(result);
    console.log(`PPT mission: ${missionId}`);
    console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
    console.log(`Imagegen review: ${imagegenGate?.passed ? 'passed' : imagegenGate ? 'present' : 'missing'}`);
    return result;
  }
  await writeJsonAtomic(path.join(dir, 'ppt-command-error.json'), { action, args });
  console.error('Usage: sks ppt fixture|build|status|review|export-slides|callouts|extract-issues|fix|attach-after|attach-fixed-deck|recheck|proof|explain [mission-id|latest] [--deck <pptx>] [--json] [--mock]');
  process.exitCode = 1;
  return null;
}

async function pptImagegenReview(root: string, command: any, action: string, args: any[] = []) {
  const deckPath = readOption(args, '--deck', null);
  const fixtureMode = flag(args, '--fixture');
  const mockMode = flag(args, '--mock') || fixtureMode;
  const missionArg = firstPptPositional(args);
  const shouldCreate = Boolean(deckPath || mockMode || action === 'review' || action === 'export-slides' || action === 'slide-export' || action === 'callouts' || action === 'extract-issues');
  const missionId = shouldCreate && !missionArg
    ? null
    : missionArg === 'latest' || !missionArg ? await findLatestMission(root) : missionArg;
  const loaded = missionId ? await loadMission(root, missionId) : await createMission(root, { mode: 'ppt', prompt: `PPT imagegen review ${deckPath || 'fixture'}` });
  const id = 'id' in loaded ? loaded.id : missionId;
  const dir = loaded.dir;
  const mission = 'mission' in loaded ? loaded.mission : (loaded as any).mission;
  const contract = await readJson(path.join(dir, 'decision-contract.json'), {
    prompt: mission?.prompt || `PPT imagegen review ${deckPath || 'latest'}`,
    route: '$PPT',
    sealed_hash: `ppt-review-${id}`,
    answers: { PPT_DECK_PATH: deckPath }
  });
  if (!await readJson(path.join(dir, 'decision-contract.json'), null)) {
    await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  }
  if (fixtureMode) {
    const fixture = await writePptImagegenReviewFixture(root, dir, id, { source: 'ppt-command-fixture' });
    const proof = await maybeFinalizeRoute(root, {
      missionId: id,
      route: '$PPT',
      gateFile: PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT,
      gate: fixture.artifacts.gate,
      mock: true,
      visual: true,
      visualEvidence: { ppt_review: fixture.proof_evidence },
      artifacts: Object.values(PPT_REVIEW_ARTIFACT_PATHS),
      claims: [{ id: 'ppt-imagegen-review-loop', status: 'verified_partial' }],
      blockers: fixture.artifacts.gate?.blockers || [],
      command: { cmd: `sks ${command} ${action} --fixture`, status: fixture.artifacts.gate?.passed ? 0 : 1 },
      scouts: false
    });
    const result = {
      schema: 'sks.ppt-imagegen-review.v1',
      ok: proof.ok && fixture.artifacts.gate?.passed === true,
      status: fixture.artifacts.gate?.passed ? 'passed' : 'blocked',
      mission_id: id,
      artifacts: fixture.artifacts,
      proof_evidence: fixture.proof_evidence,
      proof: proof.validation
    };
    if (!result.ok) process.exitCode = 1;
    if (flag(args, '--json')) return printJson(result);
    console.log(`PPT imagegen review: ${result.ok ? 'ok' : 'blocked'} ${id}`);
    return result;
  }
  const artifacts = await writePptImagegenReviewArtifacts({
    root,
    dir,
    missionId: id,
    deckPath: deckPath || contract.answers?.PPT_DECK_PATH || null,
    manualImages: readOption(args, '--manual-slide-images', null) || readOption(args, '--slide-images', null),
    generatedSlidePath: readOption(args, '--generated-slide', null),
    sessionId: readOption(args, '--session', null) || readOption(args, '--session-id', null),
    fixedDeckPath: action === 'attach-fixed-deck' ? deckPath : readOption(args, '--fixed-deck', null),
    afterSlideImages: readOption(args, '--image', null) ? [readOption(args, '--image', null)] : [],
    fixRequested: flag(args, '--fix') || action === 'fix',
    skipCallouts: action === 'export-slides' || action === 'slide-export',
    skipExtraction: action === 'export-slides' || action === 'slide-export' || action === 'callouts',
    mock: mockMode
  });
  const proofEvidence = pptReviewProofEvidence(artifacts.gate, artifacts);
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route: '$PPT',
    gateFile: PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT,
    gate: artifacts.gate,
    mock: mockMode,
    visual: true,
    visualEvidence: { ppt_review: proofEvidence },
    artifacts: Object.values(PPT_REVIEW_ARTIFACT_PATHS),
    claims: [{ id: 'ppt-imagegen-review-loop', status: mockMode ? 'verified_partial' : artifacts.gate?.passed ? 'verified' : 'blocked' }],
    blockers: artifacts.gate?.blockers || [],
    command: { cmd: `sks ${command} ${action}`, status: artifacts.gate?.passed ? 0 : 1 },
    scouts: false
  });
  const result = { schema: 'sks.ppt-imagegen-review.v1', ok: proof.ok && artifacts.gate?.passed === true, status: artifacts.gate?.passed ? 'passed' : 'blocked', mission_id: id, artifacts: pptArtifactAliases(artifacts), proof_evidence: proofEvidence, proof: proof.validation };
  if (!result.ok && !mockMode) process.exitCode = 1;
  if (flag(args, '--json')) return printJson(result);
  console.log(`PPT imagegen review: ${result.ok ? 'ok' : 'blocked'} ${id}`);
  return result;
}

async function pptFixture(root: string, command: any, args: any[]) {
  const { id, dir, mission } = await createMission(root, { mode: 'ppt', prompt: 'PPT fixture route build' });
  const contract = { prompt: mission.prompt, answers: fixtureAnswers(), sealed_hash: 'ppt-fixture-contract' };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  await writePptRouteArtifacts(dir, contract);
  const build = await writePptBuildArtifacts(dir, contract);
  const gate = mockPptFixtureGate(build.gate);
  await writeJsonAtomic(path.join(dir, 'ppt-gate.json'), gate);
  const review = await writePptImagegenReviewArtifacts({ root, dir, missionId: id, mock: true });
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route: '$PPT',
    gateFile: PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT,
    gate: review.gate,
    mock: true,
    visual: true,
    visualEvidence: { ppt_review: pptReviewProofEvidence(review.gate, review) },
    artifacts: [...Object.keys(build.files || {}), ...Object.values(PPT_REVIEW_ARTIFACT_PATHS)],
    claims: [{ id: 'ppt-fixture', status: 'verified_partial' }],
    command: { cmd: `sks ${command} fixture --mock`, status: 0 },
    scouts: false
  });
  const result = { schema: 'sks.ppt-fixture.v2', ok: proof.ok, mission_id: id, build: { ...build, ok: true, gate }, imagegen_review: review, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`PPT fixture: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
  return result;
}

async function pptExplain(root: string, args: any[] = []) {
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) return missingMission(args);
  const { dir } = await loadMission(root, missionId);
  const gate = await readJson(path.join(dir, PPT_IMAGEGEN_REVIEW_GATE_ARTIFACT), null);
  const result = { schema: 'sks.ppt-explain.v1', ok: Boolean(gate), mission_id: missionId, status: gate?.passed ? 'passed' : 'blocked', blockers: gate?.blockers || [], next_action: nextActionForPptGate(gate) };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Status: ${result.status}`);
  console.log(`Next: ${result.next_action}`);
  return result;
}

function nextActionForPptGate(gate: any = {}) {
  const blockers = gate?.blockers || [];
  if (blockers.includes('deck_required')) return 'Run `sks ppt review --deck <pptx> --json`, or use --mock only for fixture evidence.';
  if (blockers.includes('slide_export_unavailable')) return 'Attach exported slide images with --manual-slide-images, then rerun the PPT review.';
  if (blockers.includes('ppt_imagegen_callouts_missing')) return 'Generate slide callout review images with Codex App $imagegen/gpt-image-2 and rerun extraction.';
  if (blockers.includes('ppt_slide_issue_extraction_missing')) return 'Run `sks ppt extract-issues --generated-slide <path> --session <id> --json`, or configure Structured Outputs fallback.';
  if (blockers.includes('ppt_slide_recheck_missing')) return 'Attach a fixed deck or fixed slide image, then rerun `sks ppt recheck latest --json`.';
  return blockers.length ? 'Resolve listed blockers and rerun `sks ppt proof latest --json`.' : 'No blockers recorded.';
}

function pptArtifactAliases(artifacts: any = {}) {
  return {
    ...artifacts,
    deckInventory: artifacts.deck_inventory,
    slideExport: artifacts.slide_export_ledger,
    callouts: artifacts.slide_callout_ledger,
    slideIssues: artifacts.slide_issue_ledger,
    deckIssues: artifacts.deck_issue_ledger,
    fixPlan: artifacts.fix_task_plan,
    handoff: artifacts.patch_handoff,
    patch: artifacts.patch_result,
    recheck: artifacts.recheck_report
  };
}

function firstPptPositional(args: any[] = []) {
  const valueFlags = new Set([
    '--deck',
    '--manual-slide-images',
    '--slide-images',
    '--generated-slide',
    '--session',
    '--session-id',
    '--fixed-deck',
    '--image',
    '--slide'
  ]);
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (valueFlags.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('--')) return arg;
  }
  return null;
}

function missingMission(args: any[]) {
  const result = { schema: 'sks.ppt-status.v1', ok: false, status: 'missing_mission' };
  if (flag(args, '--json')) return printJson(result);
  console.error('No mission found.');
  process.exitCode = 1;
  return result;
}

function mockPptFixtureGate(gate: any = {}) {
  return {
    ...gate,
    passed: true,
    mock_fixture: true,
    unsupported_critical_claims_zero: true,
    image_asset_policy_satisfied: true,
    bounded_iteration_complete: true,
    critical_review_issues_zero: true,
    render_report_passed: true,
    fact_ledger_passed: true,
    image_asset_ledger_passed: true,
    review_ledger_passed: true,
    iteration_report_passed: true,
    cleanup_report_passed: true,
    parallel_report_passed: true,
    honest_mode_complete: true,
    blockers: []
  };
}

function fixtureAnswers() {
  return {
    PRESENTATION_AUDIENCE_PROFILE: 'Release reviewer validating SKS route evidence.',
    PRESENTATION_STP_STRATEGY: 'Segment: developer tooling. Target: Codex trust-layer maintainers. Positioning: proof-first release readiness.',
    PRESENTATION_DELIVERY_CONTEXT: 'Mock release gate fixture.',
    PRESENTATION_PAINPOINT_SOLUTION_MAP: [
      'Route proof gaps -> automatic completion proof',
      'Visual evidence ambiguity -> image voxel anchors',
      'Fixture placeholders -> actual artifact validation'
    ]
  };
}
