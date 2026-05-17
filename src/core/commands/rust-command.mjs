import path from 'node:path';
import { flag } from '../../cli/args.mjs';
import { printJson } from '../../cli/output.mjs';
import { packageRoot } from '../fsx.mjs';
import { rustImageHash, rustInfo, rustSecretScan, rustVoxelValidate } from '../rust-accelerator.mjs';

export async function rustCommand(args = []) {
  const action = args[0] || 'status';
  if (action === 'status') return rustStatus(args.slice(1));
  if (action === 'smoke') return rustSmoke(args.slice(1));
  if (action === 'doctor') return rustStatus(args.slice(1));
  console.error('Usage: sks rust status|smoke [--json] [--require-native]');
  process.exitCode = 2;
}

async function rustStatus(args = []) {
  const info = await rustInfo();
  const result = {
    schema: 'sks.rust-status.v1',
    ok: info.mode === 'rust_accelerated' || info.mode === 'js_fallback',
    rust: info,
    js_fallback_ready: true
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Rust accelerator: ${info.mode}`);
  console.log(`Source included:   ${info.source_included ? 'yes' : 'no'}`);
  console.log(`Prebuilt binary:   ${info.prebuilt_available ? 'yes' : 'no'}`);
  console.log(`Build hint:        ${info.build_hint}`);
  if (info.version) console.log(`Version:           ${info.version}`);
}

async function rustSmoke(args = []) {
  const root = packageRoot();
  const requireNative = flag(args, '--require-native');
  const info = await rustInfo();
  const results = [];
  results.push(await smokeCase('status', async () => ({ ok: !requireNative || info.available, engine: info.mode, detail: info })));
  results.push(await smokeCase('image-hash', () => rustImageHash(path.join(root, 'test', 'fixtures', 'images', 'one-by-one.png'))));
  results.push(await smokeCase('voxel-valid', () => rustVoxelValidate(path.join(root, 'test', 'fixtures', 'wiki-image', 'valid-ledger.json'), { requireAnchors: true })));
  results.push(await smokeCase('voxel-invalid', async () => {
    const result = await rustVoxelValidate(path.join(root, 'test', 'fixtures', 'wiki-image', 'invalid-bbox-ledger.json'), { requireAnchors: true });
    return { ...result, result: { ...result.result, ok: result.result?.ok === false && result.result?.issues?.includes('bbox_width_out_of_bounds:bad-bbox') } };
  }));
  results.push(await smokeCase('secret-scan', () => rustSecretScan(path.join(root, 'test', 'fixtures', 'secrets', 'clean.txt'))));
  const ok = results.every((row) => row.ok);
  const report = {
    schema: 'sks.rust-smoke.v1',
    ok,
    mode: info.mode,
    rust: info,
    results
  };
  if (flag(args, '--json')) {
    printJson(report);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!ok) process.exitCode = 1;
  return report;
}

async function smokeCase(id, fn) {
  try {
    const value = await fn();
    const result = value?.result && typeof value.result === 'object' ? value.result : value;
    return {
      id,
      ok: Boolean(result?.ok),
      engine: value?.engine || result?.engine || null,
      available: value?.available ?? null,
      issues: Array.isArray(result?.issues) ? result.issues : []
    };
  } catch (err) {
    return { id, ok: false, error: err.message };
  }
}
