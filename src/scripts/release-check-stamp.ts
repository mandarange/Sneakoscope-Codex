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
const commandArgs = process.argv.slice(3);
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

function treeDigest(dir, opts = {}) {
  if (!fs.existsSync(dir)) return { digest: null, file_count: 0 };
  const files = [];
  collectFiles(dir, files, { baseDir: dir, include: opts.include });
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
  const { files, missingEntries } = packageFileSnapshot(pkg);
  for (const entry of missingEntries.sort()) {
    hash.update(entry);
    hash.update('\0');
    hash.update('missing\0');
  }
  for (const file of files) {
    const full = path.join(root, file);
    const stat = fs.statSync(full);
    hash.update(file);
    hash.update('\0');
    hash.update(String(stat.size));
    hash.update('\0');
    hash.update(sha256(fs.readFileSync(full)));
    hash.update('\0');
  }
  return sha256(hash.digest('hex'));
}

function packageFileSnapshot(pkg) {
  const entries = packageFileEntries(pkg);
  const candidates = new Set();
  const missingEntries = [];

  for (const entry of entries) {
    if (entry.negated || hasGlob(entry.pattern)) continue;
    const full = path.join(root, entry.pattern);
    if (!fs.existsSync(full)) {
      missingEntries.push(entry.pattern);
      continue;
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const found = [];
      collectFiles(full, found, { baseDir: root });
      for (const file of found) candidates.add(path.relative(root, file).split(path.sep).join('/'));
    } else if (stat.isFile()) {
      candidates.add(entry.pattern);
    }
  }

  const files = [...candidates].filter((file) => packageFileIncluded(file, entries)).sort();
  return { files, missingEntries };
}

function packageFileEntries(pkg) {
  return (Array.isArray(pkg.files) ? pkg.files : [])
    .map((raw) => {
      const value = String(raw || '').trim();
      const negated = value.startsWith('!');
      const pattern = normalizeRel(negated ? value.slice(1) : value);
      return pattern ? { negated, pattern } : null;
    })
    .filter(Boolean);
}

function packageFileIncluded(file, entries) {
  let included = false;
  for (const entry of entries) {
    if (matchesPackagePattern(file, entry.pattern)) included = !entry.negated;
  }
  return included;
}

function matchesPackagePattern(file, pattern) {
  const rel = normalizeRel(file);
  const normalized = normalizeRel(pattern);
  if (!rel || !normalized) return false;
  if (!hasGlob(normalized)) return rel === normalized || rel.startsWith(`${normalized}/`);

  const re = globPatternToRegExp(normalized);
  if (re.test(rel)) return true;

  const parts = rel.split('/');
  parts.pop();
  while (parts.length) {
    if (re.test(parts.join('/'))) return true;
    parts.pop();
  }
  return false;
}

function globPatternToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      continue;
    }
    out += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${out}$`);
}

function hasGlob(value) {
  return /[*?]/.test(value);
}

function normalizeRel(value) {
  return String(value || '').split(path.sep).join('/').replace(/^\.\/+/, '').replace(/\/+$/, '');
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
  const manifests = ['release-gates.v2.json', 'infra-harness-gates.json'].map((rel) => {
    const file = path.join(root, rel);
    return fs.existsSync(file) ? `${rel}\0${fs.readFileSync(file, 'utf8')}` : `${rel}\0missing`;
  }).join('\0');
  return sha256(`${pkg.scripts?.['release:check'] || ''}\0${pkg.scripts?.['prepublishOnly'] || ''}\0${manifests}`);
}

function collectFiles(dir, out, opts = {}) {
  const baseDir = opts.baseDir || dir;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(file, out, { ...opts, baseDir });
    else if (entry.isFile()) {
      const rel = path.relative(baseDir, file).split(path.sep).join('/');
      if (!opts.include || opts.include(rel, file)) out.push(file);
    }
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
  if (file === 'release-gates.v2.json' || file === 'infra-harness-gates.json') return true;
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
  const packageEntries = packageFileEntries(pkg);
  const dist = treeDigest(path.join(root, 'dist'), {
    include: (rel) => packageFileIncluded(`dist/${rel}`, packageEntries)
  });
  return {
    schema: 'sks.release-check-stamp.v2',
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
  const releaseGateProof = fullReleaseGateProofForWrite();
  const payload = {
    ...currentStampPayload(),
    release_gate_proof: releaseGateProof,
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
  const proofInspection = inspectFullReleaseGateProof(stamp.release_gate_proof);
  if (!proofInspection.ok) mismatches.push(...proofInspection.blockers.map((blocker) => `release_gate_proof:${blocker}`));
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

function fullReleaseGateProofForWrite() {
  const preset = argValue('--preset');
  const full = commandArgs.includes('--full');
  if (preset !== 'release' || !full) {
    fail('full release proof required to write publish stamp', 'Use `npm run release:check:full`; affected/fast/confidence checks cannot authorize publish.');
  }
  const explicit = argValue('--summary');
  const summaryPath = explicit ? path.resolve(root, explicit) : latestFullReleaseSummaryPath();
  if (!summaryPath) fail('full release DAG summary missing', 'Run `npm run release:check:full` before writing the publish stamp.');
  const reportRoot = path.resolve(root, '.sneakoscope', 'reports', 'release-gates');
  const relative = path.relative(reportRoot, summaryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('release DAG summary is outside the managed report root');
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    fail('unable to read full release DAG summary', error?.message || String(error));
  }
  const validation = validateFullReleaseSummary(summary);
  if (validation.length) fail('release DAG summary is not full publish proof', validation.join('\n'));
  const explicitRealSummary = argValue('--real-summary');
  const realSummaryPath = explicitRealSummary
    ? path.resolve(root, explicitRealSummary)
    : path.join(root, '.sneakoscope', 'reports', 'release-real-check.json');
  const managedReports = path.resolve(root, '.sneakoscope', 'reports');
  const realRelative = path.relative(managedReports, realSummaryPath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail('release real-check summary is outside the managed report root');
  let realSummary;
  try {
    realSummary = JSON.parse(fs.readFileSync(realSummaryPath, 'utf8'));
  } catch (error) {
    fail('unable to read release real-check summary', error?.message || String(error));
  }
  const realValidation = validateReleaseRealSummary(realSummary);
  if (realValidation.length) fail('release real-check summary is not publish proof', realValidation.join('\n'));
  if (fs.statSync(realSummaryPath).mtimeMs < fs.statSync(summaryPath).mtimeMs) fail('release real-check predates the full release DAG summary');
  return {
    schema: 'sks.release-check-full-proof.v1',
    preset: 'release',
    full: true,
    run_id: summary.run_id,
    summary_path: path.relative(root, summaryPath).split(path.sep).join('/'),
    summary_sha256: sha256(fs.readFileSync(summaryPath)),
    selected_gates: summary.selected_gates,
    completed: summary.completed,
    failed: summary.failed,
    affected_mode: summary.affected_selection?.mode,
    confidence: summary.completion_certificate?.confidence || null,
    real_check_path: path.relative(root, realSummaryPath).split(path.sep).join('/'),
    real_check_sha256: sha256(fs.readFileSync(realSummaryPath)),
    real_check_count: realSummary.all_checks.length
  };
}

function latestFullReleaseSummaryPath() {
  const reportRoot = path.join(root, '.sneakoscope', 'reports', 'release-gates');
  if (!fs.existsSync(reportRoot)) return null;
  return fs.readdirSync(reportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(reportRoot, entry.name, 'summary.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, stat: fs.statSync(file) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .map((row) => row.file)
    .find((file) => {
      try {
        return validateFullReleaseSummary(JSON.parse(fs.readFileSync(file, 'utf8'))).length === 0;
      } catch {
        return false;
      }
    }) || null;
}

function validateFullReleaseSummary(summary) {
  const blockers = [];
  if (summary?.schema !== 'sks.release-gate-dag-run.v1') blockers.push('summary_schema_invalid');
  if (summary?.ok !== true) blockers.push('summary_not_ok');
  if (summary?.selected_preset !== 'release') blockers.push('preset_not_release');
  if (summary?.affected_selection?.mode !== 'full') blockers.push('affected_mode_not_full');
  if (!Number.isInteger(summary?.selected_gates) || summary.selected_gates <= 0) blockers.push('selected_gates_empty');
  if (summary?.failed !== 0) blockers.push('failed_gates_present');
  if (summary?.completed !== summary?.selected_gates) blockers.push('not_all_selected_gates_completed');
  if (!Array.isArray(summary?.selected_gate_ids) || summary.selected_gate_ids.length !== summary.selected_gates) blockers.push('selected_gate_ids_incomplete');
  if (summary?.completion_certificate?.confidence !== 'full-release-proof') blockers.push('completion_confidence_not_full');
  if (summary?.completion_certificate?.full_release_proof !== 'current_run') blockers.push('full_release_proof_not_current_run');
  return blockers;
}

function validateReleaseRealSummary(summary) {
  const blockers = [];
  if (summary?.schema !== 'sks.release-real-check.v1') blockers.push('real_check_schema_invalid');
  if (summary?.ok !== true) blockers.push('real_check_not_ok');
  if (!Array.isArray(summary?.all_checks) || summary.all_checks.length === 0) blockers.push('real_check_empty');
  else if (summary.all_checks.some((row) => row?.ok !== true)) blockers.push('real_check_failures_present');
  return blockers;
}

function inspectFullReleaseGateProof(proof) {
  const blockers = [];
  if (proof?.schema !== 'sks.release-check-full-proof.v1') blockers.push('proof_schema_invalid');
  if (proof?.preset !== 'release' || proof?.full !== true) blockers.push('proof_not_full_release');
  const summaryPath = proof?.summary_path ? path.resolve(root, proof.summary_path) : null;
  const reportRoot = path.resolve(root, '.sneakoscope', 'reports', 'release-gates');
  if (!summaryPath || !fs.existsSync(summaryPath)) blockers.push('summary_missing');
  else {
    const relative = path.relative(reportRoot, summaryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) blockers.push('summary_outside_managed_reports');
    else {
      const bytes = fs.readFileSync(summaryPath);
      if (sha256(bytes) !== proof.summary_sha256) blockers.push('summary_hash_mismatch');
      try {
        const summary = JSON.parse(bytes);
        blockers.push(...validateFullReleaseSummary(summary));
        if (summary.run_id !== proof.run_id || summary.selected_gates !== proof.selected_gates || summary.completed !== proof.completed || summary.failed !== proof.failed) blockers.push('summary_identity_mismatch');
      } catch {
        blockers.push('summary_parse_failed');
      }
    }
  }
  const realCheckPath = proof?.real_check_path ? path.resolve(root, proof.real_check_path) : null;
  if (!realCheckPath || !fs.existsSync(realCheckPath)) blockers.push('real_check_summary_missing');
  else {
    const relative = path.relative(path.resolve(root, '.sneakoscope', 'reports'), realCheckPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) blockers.push('real_check_summary_outside_managed_reports');
    else {
      const bytes = fs.readFileSync(realCheckPath);
      if (sha256(bytes) !== proof.real_check_sha256) blockers.push('real_check_summary_hash_mismatch');
      try {
        const realSummary = JSON.parse(bytes);
        blockers.push(...validateReleaseRealSummary(realSummary));
        if (realSummary.all_checks?.length !== proof.real_check_count) blockers.push('real_check_identity_mismatch');
      } catch {
        blockers.push('real_check_summary_parse_failed');
      }
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

function argValue(name) {
  const index = commandArgs.indexOf(name);
  return index >= 0 ? commandArgs[index + 1] || null : null;
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
else fail(`unknown command ${command}`, 'Usage: node ./dist/scripts/release-check-stamp.js <write --preset release --full [--summary path]|verify|ensure>');
