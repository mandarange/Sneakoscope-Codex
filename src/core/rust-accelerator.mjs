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
  if (!bin) return { engine: 'js', available: false, result: await fallbackFn() };
  const result = await runProcess(bin, [command, ...args], { timeoutMs: 10000, maxOutputBytes: 1024 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (result.code !== 0) return { engine: 'js', available: true, rust_error: result.stderr || result.stdout, result: await fallbackFn() };
  return { engine: 'rust', available: true, stdout: result.stdout.trim(), result: parseRustJson(result.stdout) };
}

export async function rustImageHash(file) {
  return runRustOrFallback('image-hash', [file], async () => ({ sha256: await sha256File(file) }));
}

export async function rustVoxelValidate(file) {
  return runRustOrFallback('voxel-validate', [file], async () => validateImageVoxelLedger(await readImageVoxelLedger(packageRoot(), file)));
}

export async function rustSecretScan(file) {
  return runRustOrFallback('secret-scan', [file], async () => {
    const text = await readText(file, '');
    return { ok: !/(CODEX_ACCESS_TOKEN|OPENAI_API_KEY|CODEX_LB_API_KEY|sk-proj-|sk-clb-|github_pat_)/.test(text) };
  });
}

export async function rustInfo() {
  const bin = await findRustAccelerator();
  if (!bin) return { available: false, packaging: 'source_checkout_or_optional_path', note: 'Rust accelerator available only from source checkout or SKS_RS_BIN until prebuilt packages exist.' };
  const result = await runProcess(bin, ['--version'], { timeoutMs: 3000, maxOutputBytes: 20_000 });
  return { available: result.code === 0, bin, version: `${result.stdout}${result.stderr}`.trim(), packaging: 'source_checkout_or_optional_path' };
}

function parseRustJson(text = '') {
  try { return JSON.parse(text); } catch { return text.trim(); }
}
