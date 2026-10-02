import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  DEPRECATED_CODEX_HOOKS_ALIAS_FLAG,
  MANAGED_CODEX_FEATURE_FLAGS,
  REMOVED_CODEX_FEATURE_FLAGS
} from '../../dist/core/codex/codex-feature-flags.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// `codex features list` is the only authority for what the installed Codex
// accepts. The previous list was hand-maintained and drifted: nine of its
// thirteen entries were still `stable`, so every merge deleted a user's
// explicit `= false` and the flag defaulted back to `true`.
function vendoredCodexBinary() {
  const base = path.join(REPO_ROOT, 'node_modules', '@openai');
  const packages = fs.existsSync(base)
    ? fs.readdirSync(base).filter((name) => name.startsWith('codex-') && name !== 'codex-sdk')
    : [];
  for (const pkg of packages) {
    const vendor = path.join(base, pkg, 'vendor');
    if (!fs.existsSync(vendor)) continue;
    for (const target of fs.readdirSync(vendor)) {
      const candidate = path.join(vendor, target, 'bin', 'codex');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function codexFeatureStages(binary, configText = '') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-codex-features-'));
  try {
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), configText);
    const stdout = execFileSync(binary, ['features', 'list'], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: path.join(home, '.codex') }
    });
    const stages = new Map();
    const enabled = new Map();
    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\S+)\s{2,}(removed|stable|deprecated|experimental|under development)\s+(true|false)\s*$/);
      if (match) {
        stages.set(match[1], match[2]);
        enabled.set(match[1], match[3] === 'true');
      }
    }
    stages.enabled = enabled;
    return stages;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('SKS only strips Codex feature flags Codex itself no longer honours', () => {
  const binary = vendoredCodexBinary();
  assert.ok(binary, 'vendored Codex binary not found under node_modules/@openai/codex-*/vendor');
  const stages = codexFeatureStages(binary);
  assert.ok(stages.size > 20, `expected a populated feature list, parsed ${stages.size} rows`);

  // A flag Codex still honours must never be stripped: deleting the line
  // restores Codex's default, which reverses an explicit user opt-out.
  const wronglyStripped = REMOVED_CODEX_FEATURE_FLAGS
    .filter((flag) => stages.has(flag) && stages.get(flag) !== 'removed');
  assert.deepEqual(
    wronglyStripped,
    [],
    `these flags are still live in the installed Codex and must not be stripped: ${wronglyStripped.join(', ')}`
  );

  // The flags SKS seeds must exist and be honoured, or the seed is a no-op.
  for (const flag of MANAGED_CODEX_FEATURE_FLAGS) {
    assert.equal(stages.get(flag), 'stable', `managed feature flag ${flag} is not stable in the installed Codex`);
  }

  // multi_agent_v2 is the feature the whole official-subagent lane depends on.
  assert.equal(stages.get('multi_agent_v2'), 'stable');
  assert.ok(!REMOVED_CODEX_FEATURE_FLAGS.includes('multi_agent_v2'));
});

test('codex_hooks is a live deprecated alias of hooks, so SKS strips only the value equal to the default', () => {
  const binary = vendoredCodexBinary();
  assert.ok(binary, 'vendored Codex binary not found');
  assert.equal(DEPRECATED_CODEX_HOOKS_ALIAS_FLAG, 'codex_hooks');
  // `codex_hooks` is not a row of `features list` (it is only a config-key alias), yet the
  // value drives `hooks`: stripping `= false` would silently turn hooks back on.
  assert.equal(codexFeatureStages(binary, '').has('codex_hooks'), false);
  assert.equal(codexFeatureStages(binary, '').enabled.get('hooks'), true);
  assert.equal(codexFeatureStages(binary, '[features]\ncodex_hooks = false\n').enabled.get('hooks'), false);
  assert.equal(codexFeatureStages(binary, '[features]\ncodex_hooks = true\n').enabled.get('hooks'), true);
});

test('multi_agent is a live flag and the flags SKS no longer strips are accepted by the installed Codex', () => {
  const binary = vendoredCodexBinary();
  assert.ok(binary, 'vendored Codex binary not found');
  const baseline = codexFeatureStages(binary, '');
  assert.equal(baseline.get('multi_agent'), 'stable');
  // An explicit opt-out must survive: it is the user's, and the value reaches Codex.
  assert.equal(codexFeatureStages(binary, '[features]\nmulti_agent = false\n').enabled.get('multi_agent'), false);
  // Flags Codex itself reports as `removed` need no cleanup: it accepts them silently.
  for (const flag of ['remote_control', 'codex_git_commit', 'plugin_hooks', 'js_repl', 'multi_agent_mode']) {
    assert.equal(baseline.get(flag), 'removed', `${flag} should be a removed flag in the installed Codex`);
    assert.ok(!REMOVED_CODEX_FEATURE_FLAGS.includes(flag), `${flag} must not be stripped from user configs`);
  }
  // The one key SKS still strips is unknown to Codex altogether.
  for (const flag of REMOVED_CODEX_FEATURE_FLAGS) assert.equal(baseline.has(flag), false, `${flag} is a known Codex flag`);
});

test('the multi_agent_v2 table SKS writes is accepted by the installed Codex', () => {
  const binary = vendoredCodexBinary();
  assert.ok(binary, 'vendored Codex binary not found');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-codex-mav2-'));
  try {
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    // MultiAgentV2ConfigToml is #[serde(deny_unknown_fields)]: one key Codex does
    // not know makes it reject the ENTIRE config, not just the table. Every key
    // SKS writes has to be proven against the installed binary.
    fs.writeFileSync(path.join(codexHome, 'config.toml'), [
      '[features.multi_agent_v2]',
      'enabled = true',
      'max_concurrent_threads_per_session = 257',
      'expose_spawn_agent_model_overrides = true',
      ''
    ].join('\n'));
    const stdout = execFileSync(binary, ['features', 'list'], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: codexHome }
    });
    assert.match(stdout, /^multi_agent_v2\s+stable\s+true$/m);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
