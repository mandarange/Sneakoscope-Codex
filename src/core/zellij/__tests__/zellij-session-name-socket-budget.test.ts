import test from 'node:test'
import assert from 'node:assert/strict'
import {
  madZellijSessionNameForCwd,
  sanitizeZellijSessionName
} from '../zellij-launcher.js'
import {
  estimateZellijSocketPathLength,
  ZELLIJ_UNIX_SOCKET_PATH_LIMIT
} from '../zellij-command.js'

test('sanitizeZellijSessionName clamps to the Unix socket path budget', () => {
  const socketDir = '/tmp/zj501'
  const longName = `sks-mad-${'Users-weklem-Desktop-devs-Sneakoscope-Codex-extra-long-path-segment'.repeat(2)}`
  const sanitized = sanitizeZellijSessionName(longName, { socketDir })
  assert.ok(sanitized.length < longName.length)
  assert.ok(
    estimateZellijSocketPathLength(socketDir, sanitized) <= ZELLIJ_UNIX_SOCKET_PATH_LIMIT,
    `socket path too long: ${estimateZellijSocketPathLength(socketDir, sanitized)}`
  )
})

test('madZellijSessionNameForCwd stays stable and socket-safe for deep project paths', () => {
  const cwd = '/Users/weklem/Desktop/devs/Sneakoscope-Codex'
  const first = madZellijSessionNameForCwd(cwd)
  const second = madZellijSessionNameForCwd(cwd)
  assert.equal(first, second)
  assert.match(first, /^sks-mad-Sneakoscope-Codex-[a-f0-9]{10}$/)
  assert.ok(
    estimateZellijSocketPathLength('/tmp/zj501', first) <= ZELLIJ_UNIX_SOCKET_PATH_LIMIT
  )
  // Legacy full-cwd names exceeded the default macOS TMPDIR socket budget.
  const legacy = `sks-mad-${sanitizeZellijSessionName(cwd, { socketDir: null })}`
  assert.ok(legacy.length > first.length)
})
