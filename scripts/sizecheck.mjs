#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const limits = {
  packedBytes: Number(process.env.SKS_MAX_PACK_BYTES || 456 * 1024),
  unpackedBytes: Number(process.env.SKS_MAX_UNPACKED_BYTES || 1856 * 1024),
  packFiles: Number(process.env.SKS_MAX_PACK_FILES || 64),
  trackedFileBytes: Number(process.env.SKS_MAX_TRACKED_FILE_BYTES || 384 * 1024)
};

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message, detail = '') {
  console.error(`Size check failed: ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(2);
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    ...options
  });
}

function checkTrackedFiles() {
  const result = run('git', ['ls-files', '-z'], { encoding: 'buffer' });
  if (result.status !== 0) fail('unable to list tracked files', result.stderr?.toString('utf8') || '');
  const files = result.stdout.toString('utf8').split('\0').filter(Boolean);
  const oversized = [];
  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(path.join(root, file));
    } catch (err) {
      if (err?.code === 'ENOENT') continue;
      throw err;
    }
    if (stat.size > limits.trackedFileBytes) oversized.push(`${file} (${fmt(stat.size)})`);
  }
  if (oversized.length) {
    fail(`tracked file exceeds ${fmt(limits.trackedFileBytes)}`, oversized.join('\n'));
  }
}

function checkVersionSync() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const fsx = fs.readFileSync(path.join(root, 'src', 'core', 'fsx.mjs'), 'utf8');
  const sourceVersion = fsx.match(/export const PACKAGE_VERSION = ['"]([^'"]+)['"];/)?.[1];
  const lockRootVersion = lock.packages?.['']?.version;
  const mismatches = [
    ['package-lock.json version', lock.version],
    ['package-lock root package version', lockRootVersion],
    ['src/core/fsx.mjs PACKAGE_VERSION', sourceVersion]
  ].filter(([, version]) => version !== pkg.version);
  if (mismatches.length) {
    fail('package version metadata is not synchronized', [
      `package.json version: ${pkg.version}`,
      ...mismatches.map(([label, version]) => `${label}: ${version || 'missing'}`)
    ].join('\n'));
  }
}

function checkPackageFootprint() {
  const env = {
    ...process.env,
    npm_config_cache: process.env.SKS_SIZECHECK_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache')
  };
  const result = run(npmBin, ['pack', '--dry-run', '--json', '--ignore-scripts'], { env });
  if (result.status !== 0) fail('npm pack dry-run failed', `${result.stdout || ''}\n${result.stderr || ''}`);

  let info;
  try {
    info = JSON.parse(result.stdout)[0];
  } catch {
    fail('npm pack dry-run returned non-json output', result.stdout || '');
  }
  if (!info) fail('npm pack dry-run returned no package metadata');

  const forbiddenPatterns = [
    /^\.agents\//,
    /^\.codex\//,
    /^\.dcodex\//,
    /^\.omx\//,
    /^\.sneakoscope\//,
    /^crates\//,
    /^native\//,
    /^node_modules\//,
    /^scripts\//,
    /^tmp\//,
    /^logs\//,
    /\.(tgz|zip|tar|tar\.gz|log)$/i
  ];
  const forbidden = (info.files || [])
    .map((file) => file.path)
    .filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));
  if (forbidden.length) fail('npm package includes forbidden files', forbidden.join('\n'));
  if (info.size > limits.packedBytes) fail(`npm tarball exceeds ${fmt(limits.packedBytes)}`, `${info.filename}: ${fmt(info.size)}`);
  if (info.unpackedSize > limits.unpackedBytes) fail(`npm unpacked size exceeds ${fmt(limits.unpackedBytes)}`, `${info.filename}: ${fmt(info.unpackedSize)}`);
  if (info.entryCount > limits.packFiles) fail(`npm package file count exceeds ${limits.packFiles}`, `${info.entryCount} files`);

  console.log(`Size check passed: ${fmt(info.size)} packed, ${fmt(info.unpackedSize)} unpacked, ${info.entryCount} files.`);
}

checkTrackedFiles();
checkVersionSync();
checkPackageFootprint();
