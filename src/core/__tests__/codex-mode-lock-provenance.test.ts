import assert from 'node:assert/strict'
import test from 'node:test'
import { removeLegacyTopLevelCodexModeLocks } from '../codex/codex-config-guard.js'

test('removes blank-separated SKS model locks while preserving fast tier', () => {
  const source = [
    '# SKS managed Codex model/reasoning for codex-lb',
    '',
    'service_tier = "fast"',
    '',
    'model = "gpt-5.6-sol"',
    'model_reasoning_effort = "ultra"',
    '',
    '[features]',
    'fast_mode = true',
    ''
  ].join('\n')

  const repaired = removeLegacyTopLevelCodexModeLocks(source)
  assert.match(repaired, /service_tier = "fast"/)
  assert.match(repaired, /fast_mode = true/)
  assert.doesNotMatch(repaired, /^model\s*=/m)
  assert.doesNotMatch(repaired, /^model_reasoning_effort\s*=/m)
})

test('preserves user-owned model settings without a bounded SKS marker', () => {
  const source = [
    '# Personal Codex preferences',
    'model = "gpt-user-choice"',
    'model_reasoning_effort = "high"',
    '',
    '[features]',
    'fast_mode = true',
    ''
  ].join('\n')

  assert.equal(removeLegacyTopLevelCodexModeLocks(source), source)
})

// The layout behind the report: SKS's own "moved machine-local" comment closes
// the top level, the bridge binding is appended, and the Codex app writes the
// user's picker choice under it. Every guarded SKS write used to delete it.
const MOVED_LAYOUT = [
  'approval_policy = "never"',
  '# SKS moved machine-local Codex config from .codex/config.toml at 2026-09-02T00:00:00Z',
  'notify = ["sks", "notify"]',
  'model = "gpt-6.1-sol"',
  'model_reasoning_effort = "high"',
  '# sks-desktop-bridge-managed',
  'model_provider = "openai"',
  '',
  '[features]',
  'hooks = true',
  ''
].join('\n')

test('the moved machine-local comment never vouches for the model line under it', () => {
  assert.equal(removeLegacyTopLevelCodexModeLocks(MOVED_LAYOUT), MOVED_LAYOUT)
})

test('a legacy marker goes with the lock it vouched for, so a model line written later survives', () => {
  const legacy = '# SKS forced fast UI during legacy install\nmodel = "legacy-sks-model"\nservice_tier = "fast"\n\n[features]\nfast_mode = true\n'
  const repaired = removeLegacyTopLevelCodexModeLocks(legacy)
  assert.doesNotMatch(repaired, /legacy-sks-model|forced fast UI/)
  // The Codex app later writes the user's choice where the lock was.
  const chosen = repaired.replace('service_tier = "fast"', 'model = "gpt-6.1-sol"\nservice_tier = "fast"')
  assert.equal(removeLegacyTopLevelCodexModeLocks(chosen), chosen)
})
