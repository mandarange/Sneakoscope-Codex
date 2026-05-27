import test from 'node:test';
import assert from 'node:assert/strict';
import { codexChromeExtensionStatusFromApp } from '../../dist/core/codex-app.js';

test('Codex Chrome Extension status blocks web verification when chrome plugin is missing', () => {
  const status = codexChromeExtensionStatusFromApp({
    app: { installed: true },
    codex_cli: { ok: true },
    features: { ok: true, required_flags: { browser_use_external: true, plugins: true, apps: true } },
    plugins: { default_plugins: { entries: [] }, skill_shadows: { blocking: [] } }
  });
  assert.equal(status.ok, false);
  assert.equal(status.status, 'setup_required');
  assert.ok(status.blockers.includes('chrome_extension_plugin_missing'));
  assert.match(status.guidance.join('\n'), /Chrome Extension/);
});

test('Codex Chrome Extension status passes when plugin and flags are ready', () => {
  const status = codexChromeExtensionStatusFromApp({
    app: { installed: true },
    codex_cli: { ok: true },
    features: { ok: true, required_flags: { browser_use_external: true, plugins: true, apps: true } },
    plugins: {
      default_plugins: {
        entries: [{ id: 'chrome@openai-bundled', name: 'chrome', installed: true, enabled: true, source: '/tmp/chrome' }]
      },
      skill_shadows: { blocking: [] }
    }
  });
  assert.equal(status.ok, true);
  assert.equal(status.evidence_source, 'codex_chrome_extension');
});

test('Codex Chrome Extension status rejects cache-only plugin evidence', () => {
  const status = codexChromeExtensionStatusFromApp({
    app: { installed: true },
    codex_cli: { ok: true },
    features: { ok: true, required_flags: { browser_use_external: true, plugins: true, apps: true } },
    plugins: {
      chrome_cache: '/tmp/codex/plugins/cache/chrome',
      default_plugins: { entries: [] },
      skill_shadows: { blocking: [] }
    }
  });
  assert.equal(status.ok, false);
  assert.ok(status.blockers.includes('chrome_extension_plugin_cache_only_unverified'));
  assert.equal(status.plugin.installed, false);
  assert.equal(status.plugin.cache_detected, true);
});

test('Codex Chrome Extension status rejects unverified feature flags', () => {
  const status = codexChromeExtensionStatusFromApp({
    app: { installed: true },
    codex_cli: { ok: true },
    features: {
      ok: false,
      required_flags: { browser_use_external: true, plugins: true, apps: true }
    },
    plugins: {
      default_plugins: {
        entries: [{ id: 'chrome@openai-bundled', name: 'chrome', installed: true, enabled: true, source: '/tmp/chrome' }]
      },
      skill_shadows: { blocking: [] }
    }
  });
  assert.equal(status.ok, false);
  assert.ok(status.blockers.includes('codex_feature_list_unverified'));
});
