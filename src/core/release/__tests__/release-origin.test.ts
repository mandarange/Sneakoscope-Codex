import assert from 'node:assert/strict'
import test from 'node:test'
import { RELEASE_ORIGIN_IDENTITY, normalizeReleaseOrigin } from '../release-origin.js'

test('release origin identity accepts canonical GitHub transports only as the production identity', () => {
  for (const url of [
    'https://github.com/mandarange/Sneakoscope-Codex.git',
    'ssh://git@github.com/mandarange/Sneakoscope-Codex.git',
    'git@github.com:mandarange/Sneakoscope-Codex.git'
  ]) assert.equal(normalizeReleaseOrigin(url), RELEASE_ORIGIN_IDENTITY)
  assert.equal(normalizeReleaseOrigin('https://github.com/attacker/Sneakoscope-Codex.git'), 'github.com/attacker/Sneakoscope-Codex')
  assert.equal(normalizeReleaseOrigin('https://example.com/mandarange/Sneakoscope-Codex.git'), '')
})
