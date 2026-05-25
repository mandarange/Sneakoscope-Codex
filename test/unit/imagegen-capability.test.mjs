import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectImagegenCapability } from '../../dist/core/imagegen/imagegen-capability.js';

test('imagegen capability records gpt-image-2 fidelity policy', async () => {
  const capability = await detectImagegenCapability({ fake: true });
  assert.equal(capability.ok, true);
  assert.equal(capability.model, 'gpt-image-2');
  assert.equal(capability.input_fidelity_must_be_omitted, true);
  assert.equal(capability.gpt_image_2_input_fidelity_automatic, true);
  assert.equal(capability.fake_adapter.available, true);
});

test('imagegen capability falls back to plain codex features list output', async () => {
  const codexBin = await writeFakeCodex(`
codex_git_commit                    stable             true
image_generation                    stable             true
remote_control                      stable             false
`);
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({ codexBin, timeoutMs: 1000 }));
  assert.equal(capability.codex_app.available, true);
  assert.equal(capability.codex_app.detector, 'codex_features_list');
  assert.match(String(capability.codex_app.raw), /image_generation\s+stable\s+true/);
  assert.equal(capability.supported_workflows.ux_review_callouts, true);
});

test('imagegen capability plain feature fallback respects disabled value', async () => {
  const codexBin = await writeFakeCodex(`
codex_git_commit                    stable             true
image_generation                    stable             false
remote_control                      stable             true
`);
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({ codexBin, timeoutMs: 1000 }));
  assert.equal(capability.codex_app.available, false);
  assert.equal(capability.codex_app.blocker, 'codex_app_imagegen_not_detected');
});

test('imagegen capability accepts selected codex-lb env_key auth without OpenAI OAuth', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-codex-lb-'));
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({
    codexBin: path.join(home, 'missing-codex'),
    timeoutMs: 100,
    env: { HOME: home, CODEX_LB_API_KEY: 'sk-clb-test' },
    configText: codexLbConfig('false')
  }));
  assert.equal(capability.codex_lb.available, true);
  assert.equal(capability.codex_lb.openai_auth_disabled, true);
  assert.equal(capability.openai_images_api.available, true);
  assert.equal(capability.openai_images_api.auth_source, 'CODEX_LB_API_KEY');
  assert.equal(capability.supported_workflows.ppt_slide_callouts, true);
  assert.deepEqual(capability.blockers, []);
});

test('imagegen capability rejects codex-lb when provider still requires OpenAI OAuth', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-codex-lb-oauth-'));
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({
    codexBin: path.join(home, 'missing-codex'),
    timeoutMs: 100,
    env: { HOME: home, CODEX_LB_API_KEY: 'sk-clb-test' },
    configText: codexLbConfig('true')
  }));
  assert.equal(capability.codex_lb.available, false);
  assert.equal(capability.codex_lb.blocker, 'codex_lb_requires_openai_auth');
  assert.equal(capability.openai_images_api.available, false);
  assert.deepEqual(capability.blockers, ['imagegen_capability_missing']);
});

async function writeFakeCodex(featuresOutput) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-capability-'));
  const codexBin = path.join(dir, 'codex');
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(' ') === 'features list --json') {
  console.error("error: unexpected argument '--json'");
  process.exit(2);
}
if (args.join(' ') === 'features list') {
  process.stdout.write(${JSON.stringify(featuresOutput.trimStart())});
  process.exit(0);
}
console.error('unexpected args: ' + args.join(' '));
process.exit(64);
`;
  await fsp.writeFile(codexBin, script, { mode: 0o755 });
  return codexBin;
}

function codexLbConfig(requiresOpenAiAuth) {
  return `model_provider = "codex-lb"

[model_providers.codex-lb]
name = "OpenAI"
base_url = "https://lb.example.test/backend-api/codex"
wire_api = "responses"
env_key = "CODEX_LB_API_KEY"
supports_websockets = true
requires_openai_auth = ${requiresOpenAiAuth}
`;
}

async function withoutCodexImagegenEnv(fn) {
  const previous = process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
  const previousFake = process.env.SKS_TEST_FAKE_IMAGEGEN;
  delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
  delete process.env.SKS_TEST_FAKE_IMAGEGEN;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
    } else {
      process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE = previous;
    }
    if (previousFake === undefined) {
      delete process.env.SKS_TEST_FAKE_IMAGEGEN;
    } else {
      process.env.SKS_TEST_FAKE_IMAGEGEN = previousFake;
    }
  }
}
