import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import { evaluateQaGate } from '../../dist/core/qa-loop.js';
import { sha256File } from '../../dist/core/wiki-image/image-hash.js';

test('QA Loop route runs in a hermetic temp project root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture API QA', '--json']);
  assert.equal(prepared.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(prepared.native_agent_plan.verifier_personas_read_only_by_default, true);
  assert.ok(prepared.native_agent_plan.personas.every((persona) => persona.read_only === true));
  await fs.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'agents', 'agent-events.jsonl'));
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  const status = await runSksInRoot(root, ['qa-loop', 'status', prepared.mission_id, '--json']);
  assert.equal(status.native_agent_plan.central_ledger, 'agents/agent-events.jsonl');
  const sessions = Object.values(status.agent_sessions || {});
  assert.ok(sessions.length >= 3);
  assert.ok(sessions.every((session) => session.status === 'closed'));
});

test('QA Loop mock does not pass live web UI evidence gate', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-ui-mock' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  assert.equal(json.ok, false);
  assert.equal(json.status, 'verified_partial_mock_no_live_web_evidence');
  assert.equal(json.mock_only, true);
  assert.equal(json.live_web_evidence, false);
  assert.equal(json.gate.gate.passed, false);
  assert.equal(json.gate.gate.chrome_extension_preflight_passed, false);
  assert.equal(json.gate.gate.ui_chrome_extension_evidence, false);
  assert.equal(json.gate.gate.ui_evidence_source, 'mock_codex_chrome_extension_fixture_not_live');
});

test('QA Loop blocks requested visual review without Chrome screenshot and gpt-image-2 annotated image artifacts', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-visual-evidence' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA with Chrome Extension screenshot and gpt-image-2 annotated review image', '--json']);
  const missionDir = path.join(root, '.sneakoscope', 'missions', prepared.mission_id);
  const gate = JSON.parse(await fs.readFile(path.join(missionDir, 'qa-gate.json'), 'utf8'));
  const visual = JSON.parse(await fs.readFile(path.join(missionDir, 'qa-loop', 'visual-evidence.json'), 'utf8'));
  assert.equal(gate.ui_chrome_extension_screenshot_required, true);
  assert.equal(gate.gpt_image_2_annotated_review_required, true);
  assert.equal(visual.chrome_extension_screenshot.required, true);
  assert.equal(visual.gpt_image_2_annotated_review.required, true);

  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  assert.equal(json.ok, false);
  assert.ok(json.gate.reasons.includes('ui_chrome_extension_screenshot_missing'));
  assert.ok(json.gate.reasons.includes('ui_chrome_extension_screenshot_artifact_missing'));
  assert.ok(json.gate.reasons.includes('gpt_image_2_annotated_review_image_missing'));
  assert.ok(json.gate.reasons.includes('gpt_image_2_annotated_review_artifact_missing'));
});

test('QA Loop visual evidence gate accepts real Chrome screenshot and Codex App gpt-image-2 review files', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-visual-evidence-pass' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA with Chrome Extension screenshot and gpt-image-2 annotated review image', '--json']);
  const missionDir = path.join(root, '.sneakoscope', 'missions', prepared.mission_id);
  const sourceImage = path.join(root, 'test', 'fixtures', 'images', 'one-by-one.png');
  const screenshot = path.join(missionDir, 'qa-loop', 'chrome-extension-screenshot.png');
  const review = path.join(missionDir, 'qa-loop', 'gpt-image-2-annotated-review.png');
  await fs.copyFile(sourceImage, screenshot);
  await fs.copyFile(sourceImage, review);
  const screenshotSha = await sha256File(screenshot);
  const reviewSha = await sha256File(review);
  const gate = JSON.parse(await fs.readFile(path.join(missionDir, 'qa-gate.json'), 'utf8'));
  await fs.writeFile(path.join(missionDir, 'qa-gate.json'), `${JSON.stringify({
    ...gate,
    passed: true,
    clarification_contract_sealed: true,
    qa_report_written: true,
    qa_ledger_complete: true,
    checklist_completed: true,
    safety_reviewed: true,
    deployed_destructive_tests_blocked: true,
    credentials_not_persisted: true,
    chrome_extension_preflight_passed: true,
    ui_chrome_extension_evidence: true,
    ui_evidence_source: 'codex_chrome_extension',
    ui_chrome_extension_screenshot_required: true,
    ui_chrome_extension_screenshot_captured: true,
    ui_chrome_extension_screenshot_artifact: 'qa-loop/chrome-extension-screenshot.png',
    ui_chrome_extension_screenshot_sha256: screenshotSha,
    gpt_image_2_annotated_review_required: true,
    gpt_image_2_annotated_review_generated: true,
    gpt_image_2_annotated_review_artifact: 'qa-loop/gpt-image-2-annotated-review.png',
    gpt_image_2_annotated_review_sha256: reviewSha,
    gpt_image_2_annotated_review_model: 'gpt-image-2',
    gpt_image_2_annotated_review_provider: 'Codex App $imagegen',
    gpt_image_2_source_screenshot_artifact: 'qa-loop/chrome-extension-screenshot.png',
    corrective_loop_enabled: true,
    safe_remediation_required: true,
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_or_deferred_findings: 0,
    post_fix_verification_complete: true,
    honest_mode_complete: true
  }, null, 2)}\n`);
  await fs.writeFile(path.join(missionDir, 'qa-loop', 'visual-evidence.json'), `${JSON.stringify({
    schema: 'sks.qa-loop-visual-evidence.v1',
    chrome_extension_screenshot: {
      required: true,
      status: 'captured',
      evidence_source: 'codex_chrome_extension',
      artifact_path: 'qa-loop/chrome-extension-screenshot.png',
      sha256: screenshotSha,
      width: 1,
      height: 1
    },
    gpt_image_2_annotated_review: {
      required: true,
      status: 'generated',
      model: 'gpt-image-2',
      provider: 'Codex App $imagegen',
      source_screenshot_artifact: 'qa-loop/chrome-extension-screenshot.png',
      artifact_path: 'qa-loop/gpt-image-2-annotated-review.png',
      sha256: reviewSha,
      width: 1,
      height: 1
    }
  }, null, 2)}\n`);

  const evaluated = await evaluateQaGate(missionDir);
  assert.equal(evaluated.passed, true);
  assert.deepEqual(evaluated.reasons, []);
});
