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
