#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { currentDistFreshness, sourceSnapshot } from './lib/ensure-dist-fresh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'dist', 'build-manifest.json');
const issues = [];
const freshness = currentDistFreshness();
const source = sourceSnapshot();
const manifest = readJson(manifestPath);
const pkg = readJson(path.join(root, 'package.json'));

if (!manifest) issues.push('build_manifest_missing');
if (!freshness.ok) issues.push(...freshness.issues);
if (manifest) {
  if (manifest.package_version !== pkg.version || manifest.version !== pkg.version) issues.push('manifest_version_mismatch');
  if (manifest.source_digest !== source.digest) issues.push('manifest_source_digest_stale');
  if (manifest.source_file_count !== source.file_count) issues.push('manifest_source_file_count_stale');
  if (manifest.source_list_hash !== sha256(source.files.join('\n'))) issues.push('manifest_source_list_hash_stale');
  if (Number(manifest.src_mjs_runtime_files) !== 0) issues.push(`manifest_src_mjs_runtime_files:${manifest.src_mjs_runtime_files}`);
  if (Number(manifest.compiled_js_count) <= 0) issues.push('manifest_compiled_js_count_missing');
  if (Number(manifest.compiled_dts_count) <= 0) issues.push('manifest_compiled_dts_count_missing');
}
const srcMjs = walk(path.join(root, 'src')).filter((file) => file.endsWith('.mjs'));
if (srcMjs.length) issues.push(`src_mjs_runtime_files:${srcMjs.length}`);
const distMjs = walk(path.join(root, 'dist')).filter((file) => file.endsWith('.mjs'));
if (distMjs.length) issues.push(`dist_mjs_runtime_files:${distMjs.length}`);

const result = {
  schema: 'sks.runtime-dist-parity.v1',
  ok: issues.length === 0,
  package_version: pkg.version,
  source_digest: source.digest,
  source_file_count: source.file_count,
  src_mjs_runtime_files: srcMjs.length,
  dist_mjs_runtime_files: distMjs.length,
  manifest,
  issues
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
