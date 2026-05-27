import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'readme-architecture-imagegen-official-check.mjs');
const fixtureImage = path.join(repoRoot, 'docs', 'assets', 'sneakoscope-architecture-pipeline.jpg');

test('README architecture imagegen check blocks when official output is missing', async () => {
  const root = await tempWorkspace();
  const run = runCheck(root);
  assert.equal(run.status, 1);
  assert.equal(run.report.ok, false);
  assert.equal(run.report.blocker, 'official_codex_app_imagegen_output_missing');
  assert.equal(run.report.codex_app_image_generation_feature_detected, true);
  assert.equal(run.report.codex_app_builtin_tool_exposed_to_this_turn, false);
  assert.equal(run.report.existing_asset_overwritten, false);
});

test('README architecture imagegen check can print the official prompt without requiring output', async () => {
  const root = await tempWorkspace();
  const run = runCheck(root, {}, ['--print-prompt']);
  assert.equal(run.status, 0);
  assert.equal(run.report.ok, true);
  assert.equal(run.report.status, 'prompt_ready');
  assert.equal(run.report.input_contract.prompt_only, true);
  assert.equal(run.report.existing_asset_overwritten, false);
  assert.match(run.stdout, /Use ChatGPT Images 2\.0 \/ GPT Image 2\.0 with gpt-image-2/);
  assert.match(run.stdout, /SKS_CODEX_APP_IMAGEGEN_OUTPUT=<path>/);
});

test('README architecture imagegen check rejects old generated_images output', async () => {
  const root = await tempWorkspace();
  const first = runCheck(root);
  assert.equal(first.status, 1);

  const source = path.join(root, '.codex-home', 'generated_images', 'session-1', 'old-output.jpg');
  await fsp.mkdir(path.dirname(source), { recursive: true });
  await fsp.copyFile(fixtureImage, source);
  const old = new Date(Date.parse(first.report.prompt_contract.mtime) - 10_000);
  await fsp.utimes(source, old, old);

  const run = runCheck(root, {
    SKS_CODEX_APP_IMAGEGEN_OUTPUT: source,
    SKS_CODEX_APP_IMAGEGEN_OUTPUT_ID: 'ig_old'
  });
  assert.equal(run.status, 1);
  assert.equal(run.report.blocker, 'official_codex_app_imagegen_output_invalid');
  assert.deepEqual(run.report.validation.blockers, ['generated_image_older_than_prompt_contract']);
  assert.equal(run.report.existing_asset_overwritten, false);
});

test('README architecture imagegen check rejects moved output even with self-attested metadata', async () => {
  const root = await tempWorkspace();
  const first = runCheck(root);
  assert.equal(first.status, 1);

  const moved = path.join(root, 'tmp', 'moved-output.jpg');
  await fsp.mkdir(path.dirname(moved), { recursive: true });
  await fsp.copyFile(fixtureImage, moved);

  const run = runCheck(root, {
    SKS_CODEX_APP_IMAGEGEN_OUTPUT: moved,
    SKS_CODEX_APP_IMAGEGEN_OUTPUT_ID: 'ig_moved',
    SKS_CODEX_APP_IMAGEGEN_CREATED_AT: new Date().toISOString()
  });
  assert.equal(run.status, 1);
  assert.equal(run.report.blocker, 'official_codex_app_imagegen_output_invalid');
  assert.ok(run.report.validation.blockers.includes('codex_app_output_must_reside_under_generated_images'));
  assert.equal(run.report.existing_asset_overwritten, false);
});

test('README architecture imagegen check accepts current generated_images output', async () => {
  const root = await tempWorkspace();
  const first = runCheck(root);
  assert.equal(first.status, 1);

  const source = path.join(root, '.codex-home', 'generated_images', 'session-1', 'current-output.jpg');
  await fsp.mkdir(path.dirname(source), { recursive: true });
  await fsp.copyFile(fixtureImage, source);
  const current = new Date(Date.parse(first.report.prompt_contract.mtime) + 10_000);
  await fsp.utimes(source, current, current);

  const run = runCheck(root, {
    SKS_CODEX_APP_IMAGEGEN_OUTPUT: source,
    SKS_CODEX_APP_IMAGEGEN_MODEL: 'gpt-image-2',
    SKS_CODEX_APP_IMAGEGEN_SURFACE: 'codex_app_imagegen'
  });
  assert.equal(run.status, 0);
  assert.equal(run.report.ok, true);
  assert.equal(run.report.status, 'replaced');
  assert.equal(run.report.existing_asset_overwritten, true);
  assert.equal(run.report.validation.ok, true);
});

test('README architecture imagegen check can auto-pick one current generated_images output when explicitly enabled', async () => {
  const root = await tempWorkspace();
  const first = runCheck(root);
  assert.equal(first.status, 1);

  const source = path.join(root, '.codex-home', 'generated_images', 'session-1', 'auto-current-output.jpg');
  await fsp.mkdir(path.dirname(source), { recursive: true });
  await fsp.copyFile(fixtureImage, source);
  const current = new Date(Date.parse(first.report.prompt_contract.mtime) + 10_000);
  await fsp.utimes(source, current, current);

  const run = runCheck(root, {
    SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST: '1'
  });
  assert.equal(run.status, 0);
  assert.equal(run.report.ok, true);
  assert.equal(run.report.status, 'replaced');
  assert.equal(run.report.input_contract.auto_pick_latest, true);
  assert.equal(run.report.input_contract.auto_pick_result.absolute_path, source);
  assert.equal(run.report.existing_asset_overwritten, true);
});

test('README architecture imagegen check preserves prompt mtime before auto-pick rerun', async () => {
  const root = await tempWorkspace();
  const first = runCheck(root);
  assert.equal(first.status, 1);
  await delay(100);

  const source = path.join(root, '.codex-home', 'generated_images', 'session-1', 'prompt-preserved-output.jpg');
  await fsp.mkdir(path.dirname(source), { recursive: true });
  await fsp.copyFile(fixtureImage, source);
  await delay(100);

  const run = runCheck(root, {
    SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST: '1'
  });
  assert.equal(run.status, 0);
  assert.equal(run.report.ok, true);
  assert.equal(run.report.prompt_contract.write.reason, 'unchanged');
  assert.equal(run.report.input_contract.auto_pick_result.absolute_path, source);
});

test('README architecture imagegen check waits for one current generated_images output when enabled', async () => {
  const root = await tempWorkspace();
  const source = path.join(root, '.codex-home', 'generated_images', 'session-1', 'waited-output.jpg');
  const pending = runCheckAsync(root, {
    SKS_CODEX_APP_IMAGEGEN_WAIT_MS: '2000',
    SKS_CODEX_APP_IMAGEGEN_POLL_MS: '50'
  });
  await waitForFile(path.join(root, '.sneakoscope', 'reports', 'readme-architecture-imagegen-prompt-1.18.7.txt'));
  await delay(50);
  await fsp.mkdir(path.dirname(source), { recursive: true });
  await fsp.copyFile(fixtureImage, source);

  const run = await pending;
  assert.equal(run.status, 0);
  assert.equal(run.report.ok, true);
  assert.equal(run.report.status, 'replaced');
  assert.equal(run.report.input_contract.wait_result.timed_out, false);
  assert.equal(run.report.input_contract.wait_result.output.absolute_path, source);
});

async function tempWorkspace() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-readme-imagegen-'));
  await fsp.mkdir(path.join(root, 'docs', 'assets'), { recursive: true });
  await fsp.copyFile(fixtureImage, path.join(root, 'docs', 'assets', 'sneakoscope-architecture-pipeline.jpg'));
  await writeFakeCodex(root);
  return root;
}

async function writeFakeCodex(root) {
  const bin = path.join(root, 'bin');
  await fsp.mkdir(bin, { recursive: true });
  await fsp.writeFile(path.join(bin, 'codex'), `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') === 'features list') {
  process.stdout.write('image_generation                        stable             true\\n');
  process.exit(0);
}
process.exit(64);
`, { mode: 0o755 });
}

function runCheck(root, extraEnv = {}, scriptArgs = []) {
  const env = {
    ...process.env,
    PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
    CODEX_HOME: path.join(root, '.codex-home'),
    ...extraEnv
  };
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: root,
    env,
    encoding: 'utf8'
  });
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'readme-architecture-imagegen-attempt-1.18.7.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

function runCheckAsync(root, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
    CODEX_HOME: path.join(root, '.codex-home'),
    ...extraEnv
  };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      const reportPath = path.join(root, '.sneakoscope', 'reports', 'readme-architecture-imagegen-attempt-1.18.7.json');
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      resolve({ status, stdout, stderr, report });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(file, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file)) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${file}`);
}
