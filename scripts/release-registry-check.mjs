#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedRegistry = 'https://registry.npmjs.org/';
const requireUnpublished = process.argv.includes('--require-unpublished');
const skipNetwork = process.env.SKS_SKIP_REGISTRY_NETWORK_CHECK === '1';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message, detail = '') {
  console.error(`Release registry check failed: ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(2);
}

function normalizeRegistry(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/?$/, '/');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (err) {
    fail(`unable to read ${file}`, err.message);
  }
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    ...options
  });
}

function checkPackagePublishConfig(pkg) {
  if (pkg.private) fail('package.json private=true would block public npm publication');
  if (pkg.publishConfig?.access !== 'public') {
    fail('package.json publishConfig.access must be public', `found: ${pkg.publishConfig?.access || 'missing'}`);
  }
  const registry = normalizeRegistry(pkg.publishConfig?.registry);
  if (registry !== expectedRegistry) {
    fail('package.json publishConfig.registry must target npmjs', `found: ${registry || 'missing'}\nexpected: ${expectedRegistry}`);
  }
}

function checkRootNpmrc() {
  const npmrcPath = path.join(root, '.npmrc');
  if (!fs.existsSync(npmrcPath)) return;
  const text = fs.readFileSync(npmrcPath, 'utf8');
  const unsafe = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const match = trimmed.match(/^(?:@[^:]+:)?registry\s*=\s*(.+)$/);
    if (match && normalizeRegistry(match[1]) !== expectedRegistry) unsafe.push(`${index + 1}: ${trimmed}`);
  }
  if (unsafe.length) {
    fail('root .npmrc overrides the registry away from npmjs', unsafe.join('\n'));
  }
}

function checkLockfile(pkg) {
  const lock = readJson('package-lock.json');
  const rootPackage = lock.packages?.[''];
  const mismatches = [
    ['package-lock.json name', lock.name, pkg.name],
    ['package-lock.json version', lock.version, pkg.version],
    ['package-lock root package name', rootPackage?.name, pkg.name],
    ['package-lock root package version', rootPackage?.version, pkg.version]
  ].filter(([, actual, expected]) => actual !== expected);
  if (mismatches.length) {
    fail('package-lock metadata is not synchronized', mismatches.map(([label, actual, expected]) => `${label}: ${actual || 'missing'} (expected ${expected})`).join('\n'));
  }

  const unsafeResolved = [];
  for (const [entry, meta] of Object.entries(lock.packages || {})) {
    const resolved = meta?.resolved;
    if (!resolved || resolved.startsWith('file:') || resolved.startsWith('link:')) continue;
    let parsed;
    try {
      parsed = new URL(resolved);
    } catch {
      unsafeResolved.push(`${entry || '<root>'}: ${resolved}`);
      continue;
    }
    if (parsed.protocol === 'https:' && parsed.hostname === 'registry.npmjs.org') continue;
    unsafeResolved.push(`${entry || '<root>'}: ${resolved}`);
  }
  if (unsafeResolved.length) {
    fail('package-lock contains dependencies resolved outside registry.npmjs.org', unsafeResolved.join('\n'));
  }
}

function checkPackedMetadata(pkg) {
  const env = {
    ...process.env,
    npm_config_cache: process.env.SKS_RELEASE_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache')
  };
  const result = run(npmBin, ['pack', '--dry-run', '--json', '--ignore-scripts', '--registry', expectedRegistry], { env });
  if (result.status !== 0) fail('npm pack dry-run failed', `${result.stdout || ''}\n${result.stderr || ''}`);
  let info;
  try {
    info = JSON.parse(result.stdout)[0];
  } catch {
    fail('npm pack dry-run returned non-json output', result.stdout || '');
  }
  if (!info) fail('npm pack dry-run returned no package metadata');
  if (info.name !== pkg.name || info.version !== pkg.version) {
    fail('packed package metadata differs from package.json', `pack: ${info.name || 'missing'}@${info.version || 'missing'}\npackage.json: ${pkg.name}@${pkg.version}`);
  }
}

function compareVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const pb = String(b || '').split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = Number.isFinite(pa[i]) ? pa[i] : 0;
    const db = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

function checkPublishedVersion(pkg) {
  if (skipNetwork) {
    console.log('Registry network check skipped by SKS_SKIP_REGISTRY_NETWORK_CHECK=1.');
    return;
  }
  const result = run(npmBin, ['view', pkg.name, 'version', 'dist-tags', '--json', '--registry', expectedRegistry]);
  if (result.status !== 0) fail('npm registry metadata lookup failed', `${result.stdout || ''}\n${result.stderr || ''}`);
  let info;
  try {
    info = JSON.parse(result.stdout);
  } catch {
    fail('npm registry metadata lookup returned non-json output', result.stdout || '');
  }
  const latest = info?.['dist-tags']?.latest || info?.version || null;
  if (!latest) fail('npm registry metadata lookup did not return a latest version');
  const cmp = compareVersions(pkg.version, latest);
  if (requireUnpublished && cmp <= 0) {
    fail('package version is not newer than the npm latest dist-tag', `package.json: ${pkg.version}\nnpm latest: ${latest}`);
  }
  const note = cmp > 0 ? `ready for new publish over npm latest ${latest}` : `current npm latest is ${latest}`;
  console.log(`Registry metadata check passed: ${pkg.name}@${pkg.version}; ${note}.`);
}

const pkg = readJson('package.json');
checkPackagePublishConfig(pkg);
checkRootNpmrc();
checkLockfile(pkg);
checkPackedMetadata(pkg);
checkPublishedVersion(pkg);
console.log(`Release registry check passed: ${pkg.name}@${pkg.version} -> ${expectedRegistry}`);
