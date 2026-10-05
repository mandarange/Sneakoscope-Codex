import '../../dist/core/__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareRoute } from '../../dist/core/pipeline.js';
import { resolveVerificationProfile } from '../../dist/core/verification-profile.js';
import {
  ENGINEERING_SANITY_CODE_STRUCTURE_REPORT,
  ENGINEERING_SANITY_REVIEW_ARTIFACT
} from '../../dist/core/engineering-sanity-review.js';

// Deliberately no strict pin: this file proves what the suite default, and the
// product default, actually do. Files that assert strict-only behavior import
// helpers/strict-verification-profile instead.
delete process.env.SKS_VERIFICATION_PROFILE;

test('the suite resolves the product default profile', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-essential-default-'));
  assert.equal(resolveVerificationProfile(root), 'essential');
});

test('essential: a Naruto route seeds none of the strict-only rituals', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-essential-route-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });

  const result = await prepareRoute(root, '$Naruto 실제 코드를 수정하고 검증까지 완료해줘', {});
  assert.ok(result.additionalContext);
  const [missionId] = await fsp.readdir(path.join(root, '.sneakoscope', 'missions'));
  assert.ok(missionId);
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const plan = JSON.parse(await fsp.readFile(path.join(dir, 'pipeline-plan.json'), 'utf8'));
  const written = new Set(await fsp.readdir(dir));

  assert.equal(plan.finalization, 'essential');
  assert.equal(plan.request_intake.status, 'not_attached');
  assert.equal(written.has('request-intake.json'), false);
  assert.equal(plan.engineering_sanity_review, null);
  assert.equal(written.has(ENGINEERING_SANITY_REVIEW_ARTIFACT), false);
  assert.equal(written.has(ENGINEERING_SANITY_CODE_STRUCTURE_REPORT), false);
  assert.equal(plan.architecture_map, null);
  assert.doesNotMatch(String(plan.execution_prompt || ''), /SKS Wiki-Informed Execution Prompt/);
});
