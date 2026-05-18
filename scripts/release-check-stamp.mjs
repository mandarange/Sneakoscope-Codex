#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stampPath = process.env.SKS_RELEASE_STAMP_PATH || path.join(root, '.sneakoscope', 'reports', 'release-check-stamp.json');
const command = process.argv[2] || 'verify';

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
    encoding: 'utf8'
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
    package_json_sha256: sha256(fs.readFileSync(path.join(root, 'package.json'))),
    dist_build_sha256: dist.digest,
    dist_file_count: dist.file_count,
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

function verifyStamp() {
  if (!fs.existsSync(stampPath)) {
    fail('missing release:check stamp', 'Run `npm run release:check` once, then rerun the publish command.');
  }
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  } catch (err) {
    fail('unable to read release:check stamp', err.message);
  }
  const current = currentStampPayload();
  const mismatches = [];
  for (const key of ['schema', 'package_name', 'package_version', 'package_json_sha256', 'dist_build_sha256', 'dist_file_count', 'release_check_sha256', 'source_digest', 'source_file_count']) {
    if (stamp[key] !== current[key]) mismatches.push(`${key}: stamp=${stamp[key] || 'missing'} current=${current[key] || 'missing'}`);
  }
  if (mismatches.length) {
    fail('release:check stamp is stale', `${mismatches.join('\n')}\nRun \`npm run release:check\` again before publishing.`);
  }
  console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${current.source_file_count} files)`);
}

if (command === 'write') writeStamp();
else if (command === 'verify') verifyStamp();
else fail(`unknown command ${command}`, 'Usage: node ./scripts/release-check-stamp.mjs <write|verify>');
