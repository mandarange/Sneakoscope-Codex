#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stampPath = process.env.SKS_RELEASE_STAMP_PATH || path.join(root, '.sneakoscope', 'reports', 'release-check-stamp.json');
const command = process.argv[2] || 'verify';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message, detail = '') {
  console.error(`Release check stamp failed: ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(2);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function treeDigest(dir) {
  if (!fs.existsSync(dir)) return { digest: null, file_count: 0 };
  const files = [];
  collectFiles(dir, files);
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const stat = fs.statSync(file);
    hash.update(rel);
    hash.update('\0');
    hash.update(String(stat.size));
    hash.update('\0');
    hash.update(sha256(fs.readFileSync(file)));
    hash.update('\0');
  }
  return { digest: hash.digest('hex'), file_count: files.length };
}

function fileDigestForPackageFiles(pkg) {
  const hash = crypto.createHash('sha256');
  const files = Array.isArray(pkg.files) ? [...pkg.files].sort() : [];
  for (const entry of files) {
    const full = path.join(root, entry);
    hash.update(entry);
    hash.update('\0');
    if (!fs.existsSync(full)) {
      hash.update('missing\0');
      continue;
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const digest = treeDigest(full);
      hash.update(`${digest.digest || 'empty'}:${digest.file_count}`);
    } else if (stat.isFile()) {
      hash.update(sha256(fs.readFileSync(full)));
    }
    hash.update('\0');
  }
  return sha256(hash.digest('hex'));
}

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runRefreshCommand() {
  const override = process.env.SKS_RELEASE_CHECK_REFRESH_COMMAND;
  if (override) {
    return spawnSync(override, {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      shell: true,
      stdio: 'inherit'
    });
  }
  return spawnSync(npmCmd, ['run', 'release:check:full'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit'
  });
}

function releaseGateHash(pkg) {
  const manifests = ['release-gates.v2.json', 'release-gates.json'].map((rel) => {
    const file = path.join(root, rel);
    return fs.existsSync(file) ? `${rel}\0${fs.readFileSync(file, 'utf8')}` : `${rel}\0missing`;
  }).join('\0');
  return sha256(`${pkg.scripts?.['release:check'] || ''}\0${pkg.scripts?.['prepublishOnly'] || ''}\0${manifests}`);
}

function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(file, out);
    else if (entry.isFile()) out.push(file);
  }
}

function gitFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) fail('unable to list release-relevant files', result.stderr || result.stdout);
  return result.stdout.split('\0').filter(Boolean);
}

function releaseRelevant(file) {
  if (!file || file.startsWith('.sneakoscope/') || file.startsWith('.codex/') || file.startsWith('.agents/')) return false;
  if (file.startsWith('node_modules/') || file.startsWith('dist/') || file.startsWith('coverage/')) return false;
  if (file.startsWith('crates/sks-core/target/')) return false;
  if (/\.tgz$|\.log$/i.test(file)) return false;
  if (/^(package|package-lock)\.json$/.test(file)) return true;
  if (/^release-gates(?:\.v2)?\.json$/.test(file)) return true;
  if (/^tsconfig.*\.json$/.test(file)) return true;
  if (/^(README|CHANGELOG|LICENSE)(\.md)?$/i.test(file)) return true;
  return [
    'bin/',
    'src/',
    'scripts/',
    'test/',
    'docs/',
    'crates/sks-core/Cargo.',
    'crates/sks-core/src/'
  ].some((prefix) => file.startsWith(prefix));
}

function releaseSnapshot() {
  const files = gitFiles().filter(releaseRelevant).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const full = path.join(root, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const contentHash = sha256(fs.readFileSync(full));
    hash.update(file);
    hash.update('\0');
    hash.update(String(stat.size));
    hash.update('\0');
    hash.update(contentHash);
    hash.update('\0');
  }
  return {
    digest: hash.digest('hex'),
    file_count: files.length
  };
}

function currentStampPayload() {
  const pkg = readJson('package.json');
  const snapshot = releaseSnapshot();
  const dist = treeDigest(path.join(root, 'dist'));
  return {
    schema: 'sks.release-check-stamp.v1',
    package_name: pkg.name,
    package_version: pkg.version,
    git_commit: gitCommit(),
    package_json_sha256: sha256(fs.readFileSync(path.join(root, 'package.json'))),
    package_files_sha256: fileDigestForPackageFiles(pkg),
    dist_build_sha256: dist.digest,
    dist_file_count: dist.file_count,
    release_gate_sha256: releaseGateHash(pkg),
    release_check_sha256: sha256(pkg.scripts?.['release:check'] || ''),
    source_digest: snapshot.digest,
    source_file_count: snapshot.file_count
  };
}

function writeStamp() {
  const payload = {
    ...currentStampPayload(),
    generated_at: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Release check stamp written: ${path.relative(root, stampPath)} (${payload.source_file_count} files)`);
}

function inspectStamp() {
  if (!fs.existsSync(stampPath)) {
    return {
      ok: false,
      message: 'missing release:check stamp',
      detail: 'Run `npm run release:check:full` once, then rerun the publish command.'
    };
  }
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      message: 'unable to read release:check stamp',
      detail: err.message
    };
  }
  const current = currentStampPayload();
  const mismatches = [];
  for (const key of ['schema', 'package_name', 'package_version', 'package_json_sha256', 'package_files_sha256', 'dist_build_sha256', 'dist_file_count', 'release_gate_sha256', 'release_check_sha256', 'source_digest', 'source_file_count']) {
    if (stamp[key] !== current[key]) mismatches.push(`${key}: stamp=${stamp[key] || 'missing'} current=${current[key] || 'missing'}`);
  }
  if (mismatches.length) {
    return {
      ok: false,
      message: 'release:check stamp is stale',
      detail: `${mismatches.join('\n')}\nRun \`npm run release:check:full\` again before publishing.`,
      current
    };
  }
  return { ok: true, current };
}

function verifyStamp() {
  const result = inspectStamp();
  if (!result.ok) fail(result.message, result.detail);
  const current = result.current;
  console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${current.source_file_count} files)`);
}

function ensureStamp() {
  const first = inspectStamp();
  if (first.ok) {
    console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${first.current.source_file_count} files)`);
    return;
  }
  console.error('Release check stamp is not current; running full `npm run release:check:full` refresh.');
  if (first.detail) console.error(first.detail.trim());

  const refresh = runRefreshCommand();
  if (refresh.status !== 0) process.exit(refresh.status || 1);

  const second = inspectStamp();
  if (!second.ok) fail(second.message, second.detail);
  console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${second.current.source_file_count} files)`);
}

if (command === 'write') writeStamp();
else if (command === 'verify') verifyStamp();
else if (command === 'ensure') ensureStamp();
else fail(`unknown command ${command}`, 'Usage: node ./dist/scripts/release-check-stamp.js <write|verify|ensure>');
