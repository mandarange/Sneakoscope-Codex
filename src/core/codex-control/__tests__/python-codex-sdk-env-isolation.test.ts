import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runPythonCodexSdkTask } from '../python-codex-sdk-adapter.js'
import type { CodexTaskInput } from '../codex-control-plane.js'

test('Python SDK child receives the sanitized env without ambient credentials', async () => {
  const ambientKeys = [
    'SKS_PYTHON_CODEX_SDK_FAKE',
    'CODEX_LB_API_KEY',
    'CODEX_LB_BASE_URL',
    'SKS_PYTHON_CODEX_SDK_TEST_SECRET'
  ] as const
  const previous = new Map(ambientKeys.map((key) => [key, process.env[key]]))
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-python-sdk-env-'))
  try {
    process.env.SKS_PYTHON_CODEX_SDK_FAKE = '1'
    process.env.CODEX_LB_API_KEY = 'ambient-lb-key'
    process.env.CODEX_LB_BASE_URL = 'https://ambient-lb.example.test/backend-api/codex'
    process.env.SKS_PYTHON_CODEX_SDK_TEST_SECRET = 'ambient-secret'

    const result = await runPythonCodexSdkTask(taskInput(root), {
      env: {
        PATH: String(process.env.PATH || ''),
        HOME: path.join(root, 'home'),
        CODEX_HOME: path.join(root, 'codex-home')
      }
    })

    assert.equal(result.ok, true)
    const proof = result.events.find((event: any) => event?.event === 'child_environment_proof') as any
    assert.ok(proof, 'fake Python runner must report the environment it actually received')
    assert.deepEqual(proof.present_keys, ['SKS_PYTHON_CODEX_SDK_FAKE'])
    assert.deepEqual(proof.absent_keys, [
      'CODEX_LB_API_KEY',
      'CODEX_LB_BASE_URL',
      'SKS_PYTHON_CODEX_SDK_TEST_SECRET'
    ])
    assert.doesNotMatch(JSON.stringify(result), /ambient-lb-key|ambient-secret/)
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await fsp.rm(root, { recursive: true, force: true })
  }
})

function taskInput(root: string): CodexTaskInput {
  return {
    route: '$Naruto',
    tier: 'worker',
    missionId: 'M-python-sdk-env-isolation',
    cwd: root,
    prompt: 'fixture',
    outputSchemaId: 'fixture',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true },
    mutationLedgerRoot: path.join(root, 'ledger')
  }
}
