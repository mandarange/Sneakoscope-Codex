import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildNativeCapabilityRepairMatrix } from '../../codex-native/native-capability-repair-matrix.js';
import { postcheckNativeCapabilities } from '../../codex-native/native-capability-postcheck.js';
import { defaultImageUxReviewGate } from '../../image-ux-review.js';
import { requireCodexImagegen } from '../../imagegen/require-imagegen.js';
import { repairCodexImagegen } from '../imagegen-repair.js';

test('feature and auth readiness do not verify built-in ImageGen output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-imagegen-trust-'));
  await withEnv({
    SKS_CODEX_APP_IMAGEGEN_AVAILABLE: '1',
    OPENAI_API_KEY: 'sk-test-not-real-proof'
  }, async () => {
    const matrix = await buildNativeCapabilityRepairMatrix({
      root,
      capabilities: ['image_generation'],
      reportPath: null
    });
    const imagegen = matrix.capabilities[0];
    assert.equal(matrix.ok, true, 'an optional manual route must not block core CLI readiness');
    assert.deepEqual(matrix.core_blockers, []);
    assert.deepEqual(matrix.blockers, []);
    assert.deepEqual(matrix.optional_manual_required, ['image_generation']);
    assert.equal(imagegen?.before, 'degraded');
    assert.equal(imagegen?.availability, 'manual-required');
    assert.equal(imagegen?.evidence_level, 'configuration');
    assert.equal(imagegen?.real_interaction_verified, false);
    assert.deepEqual(imagegen?.route_blockers['route-image'], ['codex_imagegen_real_output_unverified']);

    const postcheck = await postcheckNativeCapabilities({ root, matrix, reportPath: null });
    const checked = postcheck.capabilities[0];
    assert.equal(postcheck.ok, true);
    assert.equal(checked?.after, 'unknown');
    assert.equal(checked?.availability, 'manual-required');
    assert.deepEqual(postcheck.route_blockers['route-image'], ['codex_imagegen_real_output_unverified']);
  });
});

test('Computer Use and Chrome environment hints remain manual until a real interaction', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-env-hint-trust-'));
  await withEnv({
    SKS_COMPUTER_USE_CAPABILITY: 'verified',
    SKS_CHROME_EXTENSION_READY: '1'
  }, async () => {
    const matrix = await buildNativeCapabilityRepairMatrix({
      root,
      capabilities: ['computer_use', 'chrome_web_review'],
      reportPath: null
    });
    const computer = matrix.capabilities.find((state) => state.id === 'computer_use');
    const chrome = matrix.capabilities.find((state) => state.id === 'chrome_web_review');
    assert.equal(matrix.ok, true);
    assert.equal(computer?.before, 'degraded');
    assert.equal(computer?.availability, 'manual-required');
    assert.equal(computer?.real_interaction_verified, false);
    assert.deepEqual(computer?.route_blockers['route-computer-use'], ['computer_use_os_permission_or_capability_unknown']);
    assert.equal(chrome?.before, 'degraded');
    assert.equal(chrome?.availability, 'manual-required');
    assert.equal(chrome?.real_interaction_verified, false);
    assert.deepEqual(chrome?.route_blockers['route-chrome-web-review'], ['codex_chrome_extension_readiness_not_verified']);

    const postcheck = await postcheckNativeCapabilities({ root, matrix, reportPath: null });
    assert.equal(postcheck.capabilities.find((state) => state.id === 'computer_use')?.after, 'unknown');
    assert.equal(postcheck.capabilities.find((state) => state.id === 'chrome_web_review')?.after, 'unknown');
  });
});

test('explicit all-repairable fixture stays isolated from production evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-explicit-fixture-'));
  const matrix = await buildNativeCapabilityRepairMatrix({ root, fixture: 'all-repairable', reportPath: null });
  const postcheck = await postcheckNativeCapabilities({ root, matrix, fixture: 'all-repairable', reportPath: null });
  for (const id of ['image_generation', 'computer_use', 'chrome_web_review']) {
    const state = postcheck.capabilities.find((candidate) => candidate.id === id);
    assert.equal(state?.after, 'verified');
    assert.equal(state?.evidence_level, 'fixture');
    assert.equal(state?.real_interaction_verified, false);
  }
  assert.equal(postcheck.optional_manual_required.includes('image_generation'), false);
  assert.equal(postcheck.optional_manual_required.includes('computer_use'), false);
  assert.equal(postcheck.optional_manual_required.includes('chrome_web_review'), false);
});

test('ImageGen doctor records configuration repair without fabricating route recovery', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-config-only-repair-'));
  const stateFile = path.join(root, 'imagegen-enabled');
  const codexBin = await writeFakeCodex(root, stateFile);
  const report = await withEnv({ SKS_CODEX_APP_IMAGEGEN_AVAILABLE: undefined }, () => repairCodexImagegen({
    root,
    apply: true,
    codexBin,
    reportPath: null,
    timeoutMs: 5000
  }));
  assert.equal(report.configuration_recovered, true);
  assert.equal(report.capability_ready, true);
  assert.equal(report.route_ready, false);
  assert.equal(report.real_generation_verified, false);
  assert.equal(report.recovered, false);
  assert.equal(report.ok, false);
  assert.equal(report.communication_test.ok, false);
  assert.equal(report.communication_test.real_generation_round_trip_performed, false);
  assert.ok(report.blockers.includes('codex_imagegen_real_output_unverified'));
  assert.ok(report.manual_actions.some((action: string) => action.includes('selected raster output path')));
});

test('ImageGen capability preflight starts the route but cannot satisfy final output proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-route-trust-'));
  const result = await withEnv({ SKS_CODEX_APP_IMAGEGEN_AVAILABLE: '1' }, () => requireCodexImagegen(root));
  assert.equal(result.capability_ready, true);
  assert.equal(result.preflight_ready, true);
  assert.equal(result.preflight_only, true);
  assert.equal(result.preflight_does_not_satisfy_generated_output_proof, true);
  assert.equal(result.route_ready, false);
  assert.equal(result.current_task_tool_manifest_verified, false);
  assert.equal(result.generated_output_verified, false);
  assert.equal(result.ok, true);
  assert.equal(result.blocker, null);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.completion_blockers.includes('codex_imagegen_real_output_unverified'));

  const finalGate = defaultImageUxReviewGate({
    sealed_hash: 'capability-preflight-is-not-output-proof',
    prompt: 'Generate an annotated UX review image with gpt-image-2.'
  });
  assert.equal(finalGate.passed, false);
  assert.equal(finalGate.status, 'blocked');
  assert.equal(finalGate.full_review_passed, false);
  assert.equal(finalGate.gpt_image_2_callout_generated, false);
  assert.equal(finalGate.generated_image_ingested, false);
  assert.ok(finalGate.blockers.includes('generated_review_image_missing'));
});

async function writeFakeCodex(root: string, stateFile: string): Promise<string> {
  const codexBin = path.join(root, 'codex');
  await fs.writeFile(codexBin, `#!/usr/bin/env node
const fs = require('fs');
const stateFile = ${JSON.stringify(stateFile)};
const args = process.argv.slice(2).join(' ');
if (args === '--version') process.exit(0);
if (args === 'features enable image_generation') {
  fs.writeFileSync(stateFile, '1');
  process.exit(0);
}
if (args === 'features list') {
  console.log('image_generation stable ' + (fs.existsSync(stateFile) ? 'true' : 'false'));
  process.exit(0);
}
process.exit(64);
`, { mode: 0o755 });
  return codexBin;
}

async function withEnv<T>(
  changes: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> {
  const previous = new Map(Object.keys(changes).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
