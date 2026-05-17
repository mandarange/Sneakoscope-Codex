import path from 'node:path';
import { exists, packageRoot, readText, runProcess, which } from './fsx.mjs';
import { sha256File } from './wiki-image/image-hash.mjs';
import { validateImageVoxelLedger } from './wiki-image/validation.mjs';
import { readImageVoxelLedger } from './wiki-image/image-voxel-ledger.mjs';

export async function findRustAccelerator() {
  const env = process.env.SKS_RS_BIN || process.env.DCODEX_RS_BIN;
  if (env && await exists(env)) return env;
  const global = await which(process.platform === 'win32' ? 'sks-rs.exe' : 'sks-rs');
  if (global) return global;
  const candidate = path.join(packageRoot(), 'crates', 'sks-core', 'target', 'release', process.platform === 'win32' ? 'sks-rs.exe' : 'sks-rs');
  if (await exists(candidate)) return candidate;
  return null;
}

export async function runRustOrFallback(command, args = [], fallbackFn = async () => null) {
  const bin = await findRustAccelerator();
  if (!bin) return normalizeAcceleratorResult(command, { engine: 'js', available: false, result: await fallbackFn() });
  const result = await runProcess(bin, [command, ...args], { timeoutMs: 10000, maxOutputBytes: 1024 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (result.code !== 0) return normalizeAcceleratorResult(command, { engine: 'js', available: true, rust_error: classifyRustError(command, result.stderr || result.stdout), result: await fallbackFn() });
  return normalizeAcceleratorResult(command, { engine: 'rust', available: true, stdout: result.stdout.trim(), result: parseRustJson(result.stdout) });
}

export async function rustImageHash(file) {
  return runRustOrFallback('image-hash', [file], async () => ({ ok: true, engine: 'js', path: file, sha256: await sha256File(file) }));
}

export async function rustVoxelValidate(file) {
  return runRustOrFallback('voxel-validate', [file], async () => {
    const validation = validateImageVoxelLedger(await readImageVoxelLedger(packageRoot(), file));
    return { ok: validation.ok, engine: 'js', schema: 'sks.image-voxel-ledger.v1', images: validation.summary.images, anchors: validation.summary.anchors, issues: validation.issues };
  });
}

export async function rustSecretScan(file) {
  return runRustOrFallback('secret-scan', [file], async () => {
    const text = await readText(file, '');
    return { ok: !/(CODEX_ACCESS_TOKEN|OPENAI_API_KEY|CODEX_LB_API_KEY|sk-proj-|sk-clb-|github_pat_)/.test(text) };
  });
}

export async function rustInfo() {
  const bin = await findRustAccelerator();
  const capabilities = ['compact-info', 'jsonl-tail', 'secret-scan', 'image-hash', 'voxel-validate'];
  if (!bin) return { available: false, capabilities, packaging: 'source_checkout_or_optional_path', note: 'Rust accelerator available only from source checkout or SKS_RS_BIN until prebuilt packages exist.' };
  const result = await runProcess(bin, ['--version'], { timeoutMs: 3000, maxOutputBytes: 20_000 });
  return { available: result.code === 0, bin, version: `${result.stdout}${result.stderr}`.trim(), capabilities, packaging: 'source_checkout_or_optional_path' };
}

function parseRustJson(text = '') {
  try { return JSON.parse(text); } catch { return text.trim(); }
}

function classifyRustError(command, text = '') {
  const s = String(text || '');
  if (/unknown|Commands:|optional accelerator/i.test(s)) return { kind: 'command_missing', command, message: s };
  return { kind: 'runtime_error', command, message: s };
}

function normalizeAcceleratorResult(command, value) {
  const result = value.result && typeof value.result === 'object' ? value.result : { ok: false, value: value.result };
  return {
    command,
    engine: value.engine,
    available: Boolean(value.available),
    rust_error: value.rust_error || null,
    stdout: value.stdout || null,
    result
  };
}
