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
  delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE;
    } else {
      process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE = previous;
    }
  }
}
