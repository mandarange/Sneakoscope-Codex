#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const pkg = readJson('package.json');
const expected = String(pkg.version || '');
const mismatches = [];
const warnings = [];

checkJson('package.json', 'version', pkg.version);
const lock = readJson('package-lock.json');
checkJson('package-lock.json', 'version', lock.version);
checkJson('package-lock.json', 'packages[""].version', lock.packages?.['']?.version);
checkRegex('src/core/version.ts', /PACKAGE_VERSION\s*=\s*['"]([^'"]+)['"]/, 'PACKAGE_VERSION');
checkRegex('src/core/fsx.ts', /PACKAGE_VERSION\s*=\s*['"]([^'"]+)['"]/, 'PACKAGE_VERSION');
checkRegex('src/bin/sks.ts', /FAST_PACKAGE_VERSION\s*=\s*['"]([^'"]+)['"]/, 'FAST_PACKAGE_VERSION');
checkRegex('crates/sks-core/Cargo.toml', /^version\s*=\s*"([^"]+)"/m, 'package.version');
checkCargoLock('crates/sks-core/Cargo.lock', 'sks-core');
const dist = readJson('dist/build-manifest.json', null);
checkJson('dist/build-manifest.json', 'package_version', dist?.package_version);
checkJson('dist/build-manifest.json', 'version', dist?.version);
checkChangelog();
checkReadme();
checkReleaseMetadataScript();
checkCargoMetadata();

const ok = mismatches.length === 0;
const report = {
  schema: 'sks.release-version-truth.v1',
  ok,
  expected,
  mismatches,
  warnings,
  generated_at: new Date().toISOString()
};
const out = path.join(root, '.sneakoscope', 'reports', 'release-version-truth.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(ok, 'release version truth mismatch', { expected, mismatches });
emitGate('release:version-truth', { version: expected, checked: 13, warnings: warnings.length });

function checkJson(file, field, actual) {
  if (actual !== expected) mismatch(file, field, actual);
}

function checkRegex(file, re, field) {
  const text = readText(file);
  const match = text.match(re);
  if (!match) mismatch(file, field, null);
  else if (match[1] !== expected) mismatch(file, field, match[1]);
}

function checkCargoLock(file, name) {
  const text = readText(file);
  const block = text.split(/\n\[\[package\]\]\n/).find((part) => new RegExp(`name\\s*=\\s*"${escapeRe(name)}"`).test(part));
  const match = block?.match(/version\s*=\s*"([^"]+)"/);
  if (!match) mismatch(file, `${name}.version`, null);
  else if (match[1] !== expected) mismatch(file, `${name}.version`, match[1]);
}

function checkChangelog() {
  const text = readText('CHANGELOG.md');
  const latest = latestVersionedChangelogSection(text);
  if (latest !== expected) mismatch('CHANGELOG.md', 'latest release section', latest);
}

function checkReadme() {
  const text = readText('README.md');
  const displayed = text.match(/SKS \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/)?.[1] || null;
  if (displayed && displayed !== expected) mismatch('README.md', 'displayed current version', displayed);
}

function checkReleaseMetadataScript() {
  const script = String(pkg.scripts?.['release:metadata'] || '');
  if (!script.includes('scripts/release-metadata-check.mjs')) {
    mismatch('package.json', 'scripts.release:metadata', script || null, 'node ./scripts/release-metadata-check.mjs');
  }
  const text = readText('scripts/release-metadata-check.mjs');
  if (!text.includes('release-metadata-1-19-check.mjs')) {
    warnings.push({ file: 'scripts/release-metadata-check.mjs', message: 'generic entrypoint does not reference historical implementation wrapper' });
  }
}

function checkCargoMetadata() {
  const res = spawnSync('cargo', ['metadata', '--no-deps', '--manifest-path', path.join(root, 'crates/sks-core/Cargo.toml'), '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000
  });
  if (res.status !== 0) {
    warnings.push({ file: 'crates/sks-core/Cargo.toml', message: 'cargo metadata unavailable', stderr_tail: tail(res.stderr) });
    return;
  }
  try {
    const metadata = JSON.parse(res.stdout);
    const crate = metadata.packages?.find((row) => row.name === 'sks-core');
    if (crate?.version !== expected) mismatch('cargo metadata', 'sks-core.version', crate?.version || null);
  } catch (err) {
    warnings.push({ file: 'cargo metadata', message: `unparseable:${err instanceof Error ? err.message : String(err)}` });
  }
}

function mismatch(file, field, actual, wanted = expected) {
  mismatches.push({ file, field, expected: wanted, actual: actual ?? null });
}

function readJson(rel, fallback) {
  try {
    return JSON.parse(readText(rel));
  } catch (err) {
    if (arguments.length > 1) return fallback;
    throw err;
  }
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function latestVersionedChangelogSection(text) {
  for (const match of text.matchAll(/^## \[([^\]]+)\]/gm)) {
    if (/^[0-9]+\.[0-9]+\.[0-9]+$/.test(match[1])) return match[1];
  }
  return null;
}

function tail(value, limit = 1000) {
  const text = String(value || '');
  return text.length > limit ? text.slice(-limit) : text;
}
