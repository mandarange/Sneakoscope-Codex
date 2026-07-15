#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PACKAGE_VERSION, writeTextAtomic } from '../core/fsx.js';

const root = process.cwd();
const args = process.argv.slice(2);
const reportPath = path.join(root, '.sneakoscope', 'reports', `readme-architecture-imagegen-attempt-${PACKAGE_VERSION}.json`);
const promptPath = path.join(root, '.sneakoscope', 'reports', `readme-architecture-imagegen-prompt-${PACKAGE_VERSION}.txt`);
const assetPath = path.join(root, 'docs', 'assets', 'sneakoscope-architecture-pipeline.jpg');
const promptOnly = hasFlag('--print-prompt') || hasFlag('--prompt-only');
const suppliedOutput = String(argValue('--output', process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT || '')).trim();
const suppliedModel = String(argValue('--model', process.env.SKS_CODEX_APP_IMAGEGEN_MODEL || 'gpt-image-2')).trim();
const suppliedSurface = String(argValue('--surface', process.env.SKS_CODEX_APP_IMAGEGEN_SURFACE || 'codex_app_imagegen')).trim();
const suppliedOutputId = String(argValue('--output-id', process.env.SKS_CODEX_APP_IMAGEGEN_OUTPUT_ID || '')).trim() || null;
const suppliedCreatedAt = String(argValue('--created-at', process.env.SKS_CODEX_APP_IMAGEGEN_CREATED_AT || '')).trim() || null;
const autoPickLatest = hasFlag('--auto-pick-latest') || String(process.env.SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST || '').trim() === '1';
const waitMs = nonNegativeInt(argValue('--wait-ms', process.env.SKS_CODEX_APP_IMAGEGEN_WAIT_MS), 0);
const pollMs = Math.max(50, nonNegativeInt(argValue('--poll-ms', process.env.SKS_CODEX_APP_IMAGEGEN_POLL_MS), 1000));
const hostToolExposed = String(process.env.SKS_CODEX_APP_IMAGEGEN_TOOL_EXPOSED || '').trim() === '1';
const codexHome = String(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const generatedImagesRoot = path.join(codexHome, 'generated_images');
const promptExistedBeforeRun = fs.existsSync(promptPath);
const codexFeatureEvidence = detectCodexImageGenerationFeature();

const prompt = `Use case: infographic-diagram
Asset type: README architecture hero image for Sneakoscope Codex
Primary request: Use ChatGPT Images 2.0 / GPT Image 2.0 with gpt-image-2 to generate a polished, abstract architecture flow summary image for SKS ${PACKAGE_VERSION}.
Content intent: Show Codex App, SKS runtime, Naruto/Goal routing, MAD-SKS scoped permission widening, gpt-image-2 image evidence, validation gates, and release readiness as connected layers.
Visual constraints: 16:9 or wide landscape, premium technical product style, no logos, no mascot, no tiny unreadable text, no fake UI screenshots, no dark stock-photo look, no placeholder glyph soup.
Output requirement: real Codex App $imagegen/gpt-image-2 raster output. Save the selected output path, then run:
SKS_CODEX_APP_IMAGEGEN_OUTPUT=<path> SKS_CODEX_APP_IMAGEGEN_MODEL=gpt-image-2 SKS_CODEX_APP_IMAGEGEN_SURFACE=codex_app_imagegen npm run imagegen:readme-architecture
Use the selected file directly under $CODEX_HOME/generated_images; moved or copied files are not accepted as provenance evidence.
`;

await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
const promptWrite = await ensurePromptContract();
const promptMeta = await textArtifactMeta(promptPath, promptWrite);

const previousAsset = await imageMeta(assetPath).catch((err) => ({
  ok: false,
  path: assetPath,
  error: err instanceof Error ? err.message : String(err)
}));
let generatedImagesAudit = await scanGeneratedImages(generatedImagesRoot);
let autoPickedOutput = null;
let waitResult = null;
if (promptOnly) {
  const report = baseReport({
    ok: true,
    status: 'prompt_ready',
    blocker: null,
    prompt_path: relative(promptPath),
    setup_guidance: 'Paste this prompt into Codex App $imagegen. After a real gpt-image-2 output appears under $CODEX_HOME/generated_images, rerun this script with --output <path> or --auto-pick-latest when exactly one current candidate exists.',
    previous_asset: previousAsset,
    existing_asset_overwritten: false
  });
  await writeReport(report);
  console.log(JSON.stringify({ ...report, prompt }, null, 2));
  process.exit(0);
}
if (promptWrite.changed && suppliedOutput) {
  const report = baseReport({
    ok: false,
    status: 'blocked',
    blocker: 'prompt_contract_changed_regenerate_image_required',
    prompt_path: relative(promptPath),
    setup_guidance: 'The README architecture image prompt changed. Regenerate with Codex App $imagegen/gpt-image-2 using the updated prompt artifact, then rerun this script.',
    previous_asset: previousAsset,
    existing_asset_overwritten: false
  });
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
autoPickedOutput = !suppliedOutput && autoPickLatest ? autoPickCurrentGeneratedImage(generatedImagesAudit) : null;
if (!suppliedOutput && !autoPickedOutput && waitMs > 0) {
  waitResult = await waitForCurrentGeneratedImage(waitMs, pollMs);
  generatedImagesAudit = waitResult.audit;
  autoPickedOutput = waitResult.output;
}
const effectiveOutput = suppliedOutput || autoPickedOutput?.absolute_path || '';

if (!effectiveOutput) {
  const blocker = missingOutputBlocker(generatedImagesAudit);
  const report = baseReport({
    ok: false,
    status: 'blocked',
    blocker,
    prompt_path: relative(promptPath),
    setup_guidance: blocker === 'official_codex_app_imagegen_output_ambiguous'
      ? 'Multiple current generated_images candidates exist. Rerun with SKS_CODEX_APP_IMAGEGEN_OUTPUT pointing at the selected Codex App $imagegen/gpt-image-2 raster file.'
      : 'Invoke Codex App $imagegen/gpt-image-2 with the prompt artifact, then rerun this script with SKS_CODEX_APP_IMAGEGEN_OUTPUT pointing at the generated raster file or SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST=1 when exactly one current candidate exists.',
    previous_asset: previousAsset,
    existing_asset_overwritten: false
  });
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  const sourcePath = path.resolve(root, effectiveOutput);
  const source = await imageMeta(sourcePath).catch((err) => ({
    ok: false,
    path: sourcePath,
    error: err instanceof Error ? err.message : String(err)
  }));
  const validation = validateSource(source, suppliedModel, suppliedSurface);
  if (!validation.ok) {
    const report = baseReport({
      ok: false,
      status: 'blocked',
      blocker: 'official_codex_app_imagegen_output_invalid',
      prompt_path: relative(promptPath),
      validation,
      supplied_output: source,
      previous_asset: previousAsset,
      existing_asset_overwritten: false
    });
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    await fs.promises.copyFile(sourcePath, assetPath);
    const updatedAsset = await imageMeta(assetPath);
    const report = baseReport({
      ok: true,
      status: 'replaced',
      blocker: null,
      prompt_path: relative(promptPath),
      validation,
      supplied_output: source,
      previous_asset: previousAsset,
      updated_asset: updatedAsset,
      existing_asset_overwritten: true
    });
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
  }
}

async function ensurePromptContract() {
  if (!promptExistedBeforeRun) {
    await writeTextAtomic(promptPath, prompt);
    return { changed: true, reason: 'created' };
  }
  const existing = await fs.promises.readFile(promptPath, 'utf8').catch(() => null);
  if (existing !== prompt) {
    await writeTextAtomic(promptPath, prompt);
    return { changed: true, reason: 'refreshed_prompt_changed' };
  }
  return { changed: false, reason: 'unchanged' };
}

async function waitForCurrentGeneratedImage(timeoutMs, intervalMs) {
  const startedAt = Date.now();
  let audit = generatedImagesAudit;
  let output = autoPickCurrentGeneratedImage(audit);
  while (!output && Date.now() - startedAt < timeoutMs) {
    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
    audit = await scanGeneratedImages(generatedImagesRoot);
    output = autoPickCurrentGeneratedImage(audit);
  }
  return {
    waited_ms: Date.now() - startedAt,
    timeout_ms: timeoutMs,
    poll_ms: intervalMs,
    timed_out: !output,
    output,
    audit
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function missingOutputBlocker(audit) {
  if ((autoPickLatest || waitMs > 0) && Number(audit?.current_request_candidate_count || 0) > 1) {
    return 'official_codex_app_imagegen_output_ambiguous';
  }
  return 'official_codex_app_imagegen_output_missing';
}

function nonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function baseReport(extra) {
  return {
    schema: 'sks.readme-architecture-imagegen-attempt.v1',
    generated_at: new Date().toISOString(),
    requested_asset: 'docs/assets/sneakoscope-architecture-pipeline.jpg',
    model: 'gpt-image-2',
    skill_surface: 'Official Codex App $imagegen/gpt-image-2 required; API/codex-lb fallback is non-Codex evidence',
    codex_app_image_generation_feature_detected: codexFeatureEvidence.image_generation === true,
    codex_app_image_generation_feature_evidence: codexFeatureEvidence,
    codex_app_builtin_tool_exposed_to_this_turn: hostToolExposed,
    codex_app_builtin_tool_exposure_source: hostToolExposed
      ? 'SKS_CODEX_APP_IMAGEGEN_TOOL_EXPOSED=1'
      : 'not exposed to this script/tool context; only an actual Codex App $imagegen output can satisfy replacement evidence',
    official_docs_checked: [
      'https://learn.chatgpt.com/docs/image-generation',
      'https://deploymentsafety.openai.com/chatgpt-images-2-0',
      'https://openai.com/index/introducing-chatgpt-images-2-0/',
      'https://developers.openai.com/api/docs/guides/image-generation',
      'https://developers.openai.com/api/docs/guides/tools-image-generation?lang=javascript',
      'https://developers.openai.com/api/docs/models/gpt-image-2'
    ],
    input_contract: {
      env_output: 'SKS_CODEX_APP_IMAGEGEN_OUTPUT',
      env_model: 'SKS_CODEX_APP_IMAGEGEN_MODEL=gpt-image-2',
      env_surface: 'SKS_CODEX_APP_IMAGEGEN_SURFACE=codex_app_imagegen',
      env_output_id: 'SKS_CODEX_APP_IMAGEGEN_OUTPUT_ID optional_metadata_only',
      env_created_at: 'SKS_CODEX_APP_IMAGEGEN_CREATED_AT optional_metadata_only',
      env_auto_pick_latest: 'SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST=1 optional_after_prompt_generated_images_pick',
      env_wait_ms: 'SKS_CODEX_APP_IMAGEGEN_WAIT_MS optional_wait_for_after_prompt_generated_images_candidate',
      env_poll_ms: 'SKS_CODEX_APP_IMAGEGEN_POLL_MS optional_wait_poll_interval',
      cli_prompt_only: '--print-prompt or --prompt-only',
      cli_output: '--output <path>',
      cli_model: '--model gpt-image-2',
      cli_surface: '--surface codex_app_imagegen',
      cli_auto_pick_latest: '--auto-pick-latest',
      cli_wait_ms: '--wait-ms <milliseconds>',
      cli_poll_ms: '--poll-ms <milliseconds>',
      output_id: suppliedOutputId,
      created_at: suppliedCreatedAt,
      prompt_only: promptOnly,
      auto_pick_latest: autoPickLatest,
      auto_pick_result: autoPickedOutput,
      wait_ms: waitMs,
      poll_ms: pollMs,
      wait_result: waitResult,
      moved_outputs_accepted: false,
      api_or_codex_lb_fallback_allowed: false
    },
    prompt_contract: promptMeta,
    codex_generated_images_audit: generatedImagesAudit,
    ...extra
  };
}

function autoPickCurrentGeneratedImage(audit) {
  const candidates = Array.isArray(audit.current_request_candidates) ? audit.current_request_candidates : [];
  if (candidates.length !== 1) return null;
  return candidates[0];
}

function hasFlag(name) {
  return args.includes(name);
}

function argValue(name, fallback = '') {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0 && exactIndex + 1 < args.length) return args[exactIndex + 1];
  const prefix = `${name}=`;
  const found = args.find((arg) => String(arg).startsWith(prefix));
  return found ? String(found).slice(prefix.length) : fallback;
}

function detectCodexImageGenerationFeature() {
  try {
    const stdout = execFileSync('codex', ['features', 'list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const imageLine = stdout.split(/\r?\n/).find((line) => /^image_generation\s+/i.test(line.trim())) || '';
    return {
      checked: true,
      detector: 'codex features list',
      image_generation: /\bstable\b\s+true\b/i.test(imageLine),
      image_generation_line: imageLine || null
    };
  } catch (err) {
    return {
      checked: true,
      detector: 'codex features list',
      image_generation: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function validateSource(source, model, surface) {
  const blockers = [];
  const sourceUnderGeneratedImages = source.absolute_path
    ? source.absolute_path.startsWith(`${path.resolve(generatedImagesRoot)}${path.sep}`)
    : false;
  if (source.ok !== true) blockers.push('source_image_missing_or_unreadable');
  if (model !== 'gpt-image-2') blockers.push('model_must_be_gpt_image_2');
  if (surface !== 'codex_app_imagegen') blockers.push('surface_must_be_codex_app_imagegen');
  if (!sourceUnderGeneratedImages) blockers.push('codex_app_output_must_reside_under_generated_images');
  const createdAtMs = suppliedCreatedAt ? Date.parse(suppliedCreatedAt) : null;
  if (suppliedCreatedAt && !Number.isFinite(createdAtMs)) blockers.push('codex_app_created_at_must_be_iso8601');
  if (sourceUnderGeneratedImages && Number(source.mtime_ms || 0) < Number(promptMeta.mtime_ms || 0)) blockers.push('generated_image_older_than_prompt_contract');
  if (!['jpeg', 'png', 'webp'].includes(String(source.format || ''))) blockers.push('unsupported_image_format');
  if (Number(source.width || 0) < 1000 || Number(source.height || 0) < 600) blockers.push('image_too_small_for_readme_architecture_asset');
  return {
    ok: blockers.length === 0,
    blockers,
    required_surface: 'codex_app_imagegen',
    required_model: 'gpt-image-2',
    generated_images_root: generatedImagesRoot,
    source_under_generated_images: sourceUnderGeneratedImages,
    output_id_present: Boolean(suppliedOutputId),
    created_at_present: Boolean(suppliedCreatedAt),
    created_at_ms: Number.isFinite(createdAtMs) ? createdAtMs : null,
    prompt_mtime: promptMeta.mtime,
    min_dimensions: { width: 1000, height: 600 }
  };
}

async function imageMeta(file) {
  const stats = await fs.promises.stat(file);
  const dims = await imageDimensions(file);
  return {
    ok: true,
    path: relative(file),
    absolute_path: path.resolve(file),
    sha256: await sha256File(file),
    bytes: stats.size,
    mtime: stats.mtime.toISOString(),
    mtime_ms: stats.mtimeMs,
    ...dims
  };
}

async function textArtifactMeta(file, promptWrite = null) {
  const stats = await fs.promises.stat(file);
  return {
    path: relative(file),
    absolute_path: path.resolve(file),
    sha256: await sha256File(file),
    bytes: stats.size,
    mtime: stats.mtime.toISOString(),
    mtime_ms: stats.mtimeMs,
    existed_before_run: promptExistedBeforeRun,
    write: promptWrite
  };
}

async function writeReport(report) {
  await writeTextAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function imageDimensions(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead >= 24 && header.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), format: 'png' };
    }
    if (bytesRead >= 12 && header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP') {
      return await webpDimensions(file);
    }
    if (bytesRead >= 10 && header[0] === 0xff && header[1] === 0xd8) return await jpegDimensions(file);
    return { width: null, height: null, format: 'unknown' };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function jpegDimensions(file) {
  const buf = await fs.promises.readFile(file);
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf.readUInt8(offset + 1);
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5), format: 'jpeg' };
    }
    offset += 2 + length;
  }
  return { width: null, height: null, format: 'jpeg' };
}

async function webpDimensions(file) {
  const buf = await fs.promises.readFile(file);
  const chunk = buf.slice(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buf.length >= 30) {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
      format: 'webp'
    };
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: 'webp' };
  }
  return { width: null, height: null, format: 'webp' };
}

async function scanGeneratedImages(rootDir) {
  const files = await listGeneratedImageFiles(rootDir).catch(() => []);
  const rows = [];
  for (const file of files) {
    const stats = await fs.promises.stat(file).catch(() => null);
    if (!stats) continue;
    rows.push({
      path: relative(file),
      absolute_path: path.resolve(file),
      mtime: stats.mtime.toISOString(),
      mtime_ms: stats.mtimeMs,
      bytes: stats.size
    });
  }
  rows.sort((a, b) => b.mtime_ms - a.mtime_ms);
  const currentRequestCandidates = rows.filter((row) => Number(row.mtime_ms || 0) >= Number(promptMeta.mtime_ms || 0));
  return {
    root: rootDir,
    total_png_candidates: rows.length,
    latest_candidates: rows.slice(0, 5).map(({ mtime_ms, ...row }) => row),
    current_request_candidates: currentRequestCandidates.slice(0, 5),
    current_request_candidate_count: currentRequestCandidates.length,
    latest_is_current_request_output: currentRequestCandidates.length > 0 && rows[0]?.absolute_path === currentRequestCandidates[0]?.absolute_path,
    auto_pick_latest_available: currentRequestCandidates.length === 1,
    note: 'Existing files under generated_images are discoverable, but SKS does not treat them as this README replacement unless the user provides SKS_CODEX_APP_IMAGEGEN_OUTPUT or opts into SKS_CODEX_APP_IMAGEGEN_AUTOPICK_LATEST=1 with exactly one generated_images candidate newer than the prompt contract.'
  };
}

async function listGeneratedImageFiles(rootDir) {
  const out = [];
  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const first = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await fs.promises.readdir(first, { withFileTypes: true }).catch(() => []);
      for (const child of nested) {
        if (child.isFile() && /\.(png|jpe?g|webp)$/i.test(child.name)) out.push(path.join(first, child.name));
      }
    } else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) {
      out.push(first);
    }
  }
  return out;
}

function relative(file) {
  const rel = path.relative(root, path.resolve(file));
  return rel.startsWith('..') ? path.resolve(file) : rel;
}
