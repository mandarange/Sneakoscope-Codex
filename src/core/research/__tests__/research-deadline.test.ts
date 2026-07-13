import test from 'node:test'
import assert from 'node:assert/strict'
import { codexSdkTurnTimeoutMs } from '../../codex-control/codex-sdk-adapter.js'
import { pythonCodexSdkTimeoutMs } from '../../codex-control/python-codex-sdk-adapter.js'
import { raceResearchStagesUntilDeadline } from '../research-cycle-runner.js'

test('Research stage waiting returns at the absolute cycle deadline', async () => {
  const started = Date.now()
  const running = new Map<string, Promise<string>>([
    ['slow-stage', new Promise((resolve) => setTimeout(() => resolve('late'), 100))]
  ])
  const result = await raceResearchStagesUntilDeadline(running, Date.now() + 15)
  assert.equal(result, null)
  assert.ok(Date.now() - started < 80)
})

test('Codex SDK adapters clamp every turn to the hard timeout and absolute deadline', () => {
  const oldTs = process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS
  const oldPy = process.env.SKS_PYTHON_CODEX_SDK_TIMEOUT_MS
  delete process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS
  delete process.env.SKS_PYTHON_CODEX_SDK_TIMEOUT_MS
  const now = 1_000_000
  try {
    const task: any = {
      route: '$Research',
      tier: 'orchestrator',
      reliabilityPolicy: {
        timeoutClass: 'long',
        hardTimeoutMs: 75,
        deadlineEpochMs: now + 40
      }
    }
    assert.equal(codexSdkTurnTimeoutMs(task, now), 40)
    assert.equal(pythonCodexSdkTimeoutMs(task, now), 40)
    assert.equal(codexSdkTurnTimeoutMs(task, now + 41), 0)
    assert.equal(pythonCodexSdkTimeoutMs(task, now + 41), 0)
  } finally {
    if (oldTs === undefined) delete process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS
    else process.env.SKS_CODEX_SDK_TURN_TIMEOUT_MS = oldTs
    if (oldPy === undefined) delete process.env.SKS_PYTHON_CODEX_SDK_TIMEOUT_MS
    else process.env.SKS_PYTHON_CODEX_SDK_TIMEOUT_MS = oldPy
  }
})
