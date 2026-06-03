#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const expectedRegistry = 'https://registry.npmjs.org/';
const requireUnpublished = process.argv.includes('--require-unpublished');
const requirePublishAuth = process.argv.includes('--require-publish-auth');
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

function npmRegistryReadEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.npm_config_tag;
  delete env.NPM_CONFIG_TAG;
  return env;
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
  const isPrerelease = /-/.test(String(pkg.version || ''));
  if (isPrerelease && pkg.publishConfig?.tag !== 'rc') {
    fail('package.json publishConfig.tag must be rc for prerelease versions', `found: ${pkg.publishConfig?.tag || 'missing'}\nversion: ${pkg.version}`);
  }
  if (!isPrerelease && pkg.publishConfig?.tag && pkg.publishConfig.tag !== 'latest') {
    fail('package.json publishConfig.tag must be latest or omitted for stable versions', `found: ${pkg.publishConfig.tag}\nversion: ${pkg.version}`);
  }
}

function checkRootNpmrc(pkg) {
  const npmrcPath = path.join(root, '.npmrc');
  if (!fs.existsSync(npmrcPath)) return;
  const text = fs.readFileSync(npmrcPath, 'utf8');
  const unsafe = [];
  const isPrerelease = /-/.test(String(pkg.version || ''));
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const match = trimmed.match(/^(?:@[^:]+:)?registry\s*=\s*(.+)$/);
    if (match && normalizeRegistry(match[1]) !== expectedRegistry) unsafe.push(`${index + 1}: ${trimmed}`);
    const tagMatch = trimmed.match(/^tag\s*=\s*(.+)$/);
    if (tagMatch) {
      const tag = tagMatch[1].trim();
      if (isPrerelease && tag !== 'rc') unsafe.push(`${index + 1}: ${trimmed}`);
      if (!isPrerelease && tag !== 'latest') unsafe.push(`${index + 1}: ${trimmed}`);
    }
  }
  if (unsafe.length) {
    fail('root .npmrc contains publish config incompatible with this release', unsafe.join('\n'));
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
  const env = npmRegistryReadEnv({
    npm_config_cache: process.env.SKS_RELEASE_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache')
  });
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
  const env = npmRegistryReadEnv({
    npm_config_cache: process.env.SKS_RELEASE_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache')
  });
  const result = run(npmBin, ['view', `${pkg.name}@latest`, 'version', 'dist-tags', '--json', '--registry', expectedRegistry], { env });
  if (result.status !== 0) fail('npm registry metadata lookup failed', `${result.stdout || ''}\n${result.stderr || ''}`);
  let info;
  try {
    info = JSON.parse(result.stdout);
  } catch {
    fail('npm registry metadata lookup returned non-json output', result.stdout || '');
  }
  const latest = info?.['dist-tags']?.latest || info?.version || null;
  if (!latest) fail('npm registry metadata lookup did not return a latest version');
  const exact = run(npmBin, ['view', `${pkg.name}@${pkg.version}`, 'version', '--json', '--registry', expectedRegistry], { env });
  let exactPublished = false;
  if (exact.status === 0) {
    try {
      const exactInfo = JSON.parse(exact.stdout);
      exactPublished = Array.isArray(exactInfo) ? exactInfo.includes(pkg.version) : exactInfo === pkg.version;
    } catch {
      exactPublished = String(exact.stdout || '').includes(pkg.version);
    }
  } else if (!/E404|No match found|not in this registry/i.test(`${exact.stdout || ''}\n${exact.stderr || ''}`)) {
    fail('npm exact-version lookup failed', `${exact.stdout || ''}\n${exact.stderr || ''}`);
  }
  if (requireUnpublished && exactPublished) {
    fail('package version is already published on npm', `${pkg.name}@${pkg.version}`);
  }
  const cmp = compareVersions(pkg.version, latest);
  if (requireUnpublished && cmp <= 0) {
    fail('package version is not newer than the npm latest dist-tag', `package.json: ${pkg.version}\nnpm latest: ${latest}`);
  }
  const note = exactPublished
    ? `exact version already exists; current npm latest is ${latest}`
    : (cmp > 0 ? `ready for new publish over npm latest ${latest}` : `current npm latest is ${latest}`);
  console.log(`Registry metadata check passed: ${pkg.name}@${pkg.version}; ${note}.`);
}

function checkPublishAuth(pkg) {
  if (skipNetwork) {
    fail('publish auth check cannot run when SKS_SKIP_REGISTRY_NETWORK_CHECK=1 is set');
  }

  const env = npmRegistryReadEnv({
    npm_config_cache: process.env.SKS_RELEASE_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache')
  });
  const whoami = run(npmBin, ['whoami', '--registry', expectedRegistry], { env });
  if (whoami.status !== 0) {
    const authHints = npmAuthSourceHints(env);
    fail(
      'npm publish auth is missing or invalid',
      [
        tail(`${whoami.stdout || ''}\n${whoami.stderr || ''}`),
        '',
        ...publishAuthRepairInstructions(pkg, authHints)
      ].join('\n')
    );
  }

  const user = normalizeNpmUser(whoami.stdout);
  if (!user) fail('npm whoami returned an empty username', whoami.stdout || '');

  const maintainers = packageMaintainers(pkg, env);
  if (maintainers.length > 0 && !maintainers.includes(user)) {
    fail(
      'authenticated npm user is not a package maintainer',
      [
        `npm whoami: ${user}`,
        `${pkg.name} maintainers: ${maintainers.join(', ')}`,
        `Log in as one of the listed maintainers or ask an owner to run \`npm owner add ${user} ${pkg.name}\`.`
      ].join('\n')
    );
  }

  const report = {
    schema: 'sks.release-publish-auth.v1',
    ok: true,
    package: pkg.name,
    version: pkg.version,
    registry: expectedRegistry,
    npm_user: user,
    maintainers,
    maintainer_match: maintainers.length === 0 ? null : maintainers.includes(user),
    generated_at: new Date().toISOString()
  };
  const out = path.join(root, '.sneakoscope', 'reports', 'release-publish-auth.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Publish auth check passed: ${pkg.name}@${pkg.version} as ${user}.`);
}

function publishAuthRepairInstructions(pkg, authHints) {
  const lines = [];
  if (authHints.length > 0) {
    lines.push(`npm auth config was found (${authHints.join(', ')}), but the npm registry rejected it.`);
    lines.push('That usually means the token is expired, revoked, not valid for npmjs.org, or not publish-capable for this package.');
  } else {
    lines.push('No npm auth token was found in the checked npm config/env locations.');
  }
  lines.push(`Refresh local auth: \`npm logout --registry ${expectedRegistry}\`, then \`npm login --registry ${expectedRegistry}\` as a maintainer of ${pkg.name}.`);
  lines.push(`Verify before publishing: \`npm whoami --registry ${expectedRegistry}\`.`);
  lines.push('For token-based publishing, configure npm itself with a registry token, for example `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` in the npm userconfig/project .npmrc and export a publish-capable token. A raw `NPM_TOKEN` environment variable alone is not enough unless npm config references it.');
  return lines;
}

function npmAuthSourceHints(env) {
  const hints = [];
  if (env.NODE_AUTH_TOKEN) hints.push('NODE_AUTH_TOKEN env');
  if (env.NPM_TOKEN) hints.push('NPM_TOKEN env (requires npmrc interpolation)');
  for (const file of npmConfigCandidateFiles(env)) {
    for (const hint of npmAuthHintsFromFile(file)) hints.push(hint);
  }
  return [...new Set(hints)];
}

function npmConfigCandidateFiles(env) {
  const files = [
    path.join(root, '.npmrc'),
    env.npm_config_userconfig,
    env.NPM_CONFIG_USERCONFIG,
    path.join(os.homedir(), '.npmrc')
  ].filter(Boolean);
  return [...new Set(files.map((file) => path.resolve(String(file))))];
}

function npmAuthHintsFromFile(file) {
  if (!fs.existsSync(file)) return [];
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const hints = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const lower = trimmed.toLowerCase();
    const hasAuthKey = /(?::|^)_authtoken\s*=|(?::|^)_auth\s*=|(?::|^)username\s*=|(?::|^)_password\s*=/.test(lower);
    if (!hasAuthKey) continue;
    const scopedToExpectedRegistry = lower.includes('//registry.npmjs.org/') || lower.startsWith('_auth');
    if (scopedToExpectedRegistry) hints.push(`${file}:${index + 1}`);
  }
  return hints;
}

function packageMaintainers(pkg, env) {
  const result = run(npmBin, ['view', pkg.name, 'maintainers', '--json', '--registry', expectedRegistry], { env });
  if (result.status !== 0) {
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (/E404|not in this registry|No match found/i.test(text)) return [];
    fail('npm maintainer lookup failed', text);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const rows = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    return [...new Set(rows.map(normalizeNpmUser).filter(Boolean))].sort();
  } catch {
    return [...new Set(String(result.stdout || '').split(/\r?\n/).map(normalizeNpmUser).filter(Boolean))].sort();
  }
}

function normalizeNpmUser(value) {
  if (!value) return '';
  if (typeof value === 'object') return normalizeNpmUser(value.name || value.username || '');
  return String(value).trim().replace(/^@/, '').split(/\s+/)[0].toLowerCase();
}

function tail(value, limit = 1200) {
  const text = String(value || '').trim();
  return text.length > limit ? text.slice(-limit) : text;
}

const pkg = readJson('package.json');
checkPackagePublishConfig(pkg);
checkRootNpmrc(pkg);
checkLockfile(pkg);
checkPackedMetadata(pkg);
checkPublishedVersion(pkg);
if (requirePublishAuth) checkPublishAuth(pkg);
console.log(`Release registry check passed: ${pkg.name}@${pkg.version} -> ${expectedRegistry}`);
