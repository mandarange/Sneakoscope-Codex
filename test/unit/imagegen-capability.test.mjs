import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectImagegenCapability } from '../../dist/core/imagegen/imagegen-capability.js';
import { writeImagegenConfig } from '../../dist/core/imagegen/imagegen-config.js';

test('Codex default mode pins no image model, and a fake adapter never makes it ready', async (t) => {
  const { env, home } = await tempHome(t);
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({
    fake: true,
    codexBin: path.join(home, 'missing-codex'),
    env,
    desktopBridgeStatus: null
  }));
  assert.equal(capability.mode, 'codex');
  assert.equal(capability.model, 'codex-default');
  assert.equal(capability.image_model_pinned, false);
  assert.equal(capability.current_imagegen_model_required, false);
  assert.equal(capability.input_fidelity_must_be_omitted, true);
  assert.equal(capability.fake_adapter.available, true);
  assert.equal(capability.fake_adapter.accepted_for_route_readiness, false);
  assert.equal(capability.core_ready, false);
  assert.equal(capability.capability_detection_is_not_output_proof, true);
  assert.deepEqual(capability.core_blockers, ['codex_app_builtin_imagegen_capability_missing', 'desktop_bridge_status_unavailable']);
  assert.deepEqual(capability.route_generation_blockers, ['imagegen_capability_missing']);
});

test('the plain codex features list makes the built-in tool a ready Codex default path', async (t) => {
  const { env } = await tempHome(t);
  const codexBin = await writeFakeCodex(`
codex_git_commit                    stable             true
image_generation                    stable             true
remote_control                      stable             false
`);
  // The shebang starts a second Node process; under the parallel canonical
  // runner its cold start can exceed 1s, so use the production probe budget.
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({ codexBin, timeoutMs: 5000, env, desktopBridgeStatus: null }));
  assert.equal(capability.codex_app.available, true);
  assert.equal(capability.codex_app.detector, 'codex_features_list');
  assert.equal(capability.codex_app.model_selectable, false);
  assert.match(String(capability.codex_app.raw), /image_generation\s+stable\s+true/);
  assert.equal(capability.core_ready, true);
  assert.equal(capability.real_generation_available, true);
  assert.equal(capability.sks_surface_generation_available, false, 'sks imagegen needs the bridge route, not the in-turn tool');
  assert.equal(capability.real_output_verified_by_capability_check, false);
  assert.equal(capability.api_fallback_satisfies_codex_app_evidence, false);
  assert.deepEqual(capability.blockers, []);
});

test('the plain codex features list reader respects a disabled value', async (t) => {
  const { env } = await tempHome(t);
  const codexBin = await writeFakeCodex(`
codex_git_commit                    stable             true
image_generation                    stable             false
remote_control                      stable             true
`);
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({ codexBin, timeoutMs: 5000, env, desktopBridgeStatus: null }));
  assert.equal(capability.codex_app.available, false);
  assert.equal(capability.codex_app.detector, 'codex_features_list');
  assert.equal(capability.codex_app.blocker, 'codex_app_imagegen_not_detected');
  assert.equal(capability.core_ready, false);
});

test('an explicit OpenAI API key is fallback evidence only and never Codex readiness', async (t) => {
  const { env, home } = await tempHome(t);
  const capability = await withoutCodexImagegenEnv(() => detectImagegenCapability({
    codexBin: path.join(home, 'missing-codex'),
    env: { ...env, OPENAI_API_KEY: 'sk-test' },
    desktopBridgeStatus: null
  }));
  assert.equal(capability.openai_images_api.available, true);
  assert.equal(capability.openai_images_api.auth_source, 'OPENAI_API_KEY');
  assert.equal(capability.openai_images_api.official_codex_app_substitute, false);
  assert.equal(capability.core_ready, false);
  assert.equal(capability.supported_workflows.ux_review_callouts, false);
});

test('custom mode decides alone: its OpenRouter key makes it ready, and Codex paths never stand in', async (t) => {
  const { env, home } = await tempHome(t);
  await writeImagegenConfig({ mode: 'openrouter', openrouterModel: 'google/gemini-3.1-flash-image' }, env);
  const detect = (openrouterKeyPresent) => withoutCodexImagegenEnv(() => detectImagegenCapability({
    codexBin: path.join(home, 'missing-codex'),
    codexAppAvailable: true,
    env,
    desktopBridgeStatus: null,
    openrouterKeyPresent
  }));
  const withoutKey = await detect(false);
  assert.equal(withoutKey.mode, 'openrouter');
  assert.equal(withoutKey.model, 'google/gemini-3.1-flash-image');
  assert.equal(withoutKey.codex_app.available, true);
  assert.equal(withoutKey.core_ready, false);
  assert.deepEqual(withoutKey.core_blockers, ['openrouter_key_missing']);
  const withKey = await detect(true);
  assert.equal(withKey.core_ready, true);
  assert.equal(withKey.custom_model.ready, true);
  assert.equal(withKey.sks_surface_generation_available, true);
  assert.deepEqual(withKey.blockers, []);
});

async function tempHome(t) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-capability-home-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  await fsp.mkdir(path.join(home, '.codex'), { recursive: true });
  await fsp.writeFile(path.join(home, '.codex', 'config.toml'), 'model = "gpt-6-astra"\n');
  return { home, env: { HOME: home, CODEX_HOME: path.join(home, '.codex') } };
}

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

async function withoutCodexImagegenEnv(fn) {
  const previous = process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
  const previousFake = process.env.SKS_TEST_FAKE_IMAGEGEN;
  delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
  delete process.env.SKS_TEST_FAKE_IMAGEGEN;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
    else process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE = previous;
    if (previousFake === undefined) delete process.env.SKS_TEST_FAKE_IMAGEGEN;
    else process.env.SKS_TEST_FAKE_IMAGEGEN = previousFake;
  }
}
