import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  buildOfficialSubagentCodexArgs,
  codexAppSessionKey,
  detectCodexAppSession,
  runOfficialSubagentWorkflow
} from '../official-subagent-runner.js'
import { CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION } from '../../codex-lb/codex-lb-tool-output-recovery.js'

test('standalone parent args launch one Sol Max Codex parent with the official thread budget', () => {
  const args = buildOfficialSubagentCodexArgs({
    prompt: 'delegate and wait',
    maxThreads: 12,
    parentSummaryFile: '/tmp/parent-summary.txt'
  })
  assert.deepEqual(args.slice(0, 5), ['exec', '-m', 'gpt-5.6-sol', '-c', 'model_reasoning_effort="max"'])
  assert.ok(args.includes('agents.max_threads=12'))
  assert.ok(args.includes('agents.max_depth=1'))
  assert.equal(args.filter((arg) => arg === 'exec').length, 1)
})

test('app sessions return delegation context without launching nested Codex', async () => {
  let launched = false
  const result = await runOfficialSubagentWorkflow({
    root: process.cwd(),
    prompt: 'delegate and wait',
    requestedSubagents: 8,
    maxThreads: 12,
    appSession: true,
    runProcessImpl: async () => {
      launched = true
      throw new Error('must not launch')
    }
  })
  assert.equal(launched, false)
  assert.equal(result.status, 'delegation_context_ready')
  assert.equal(result.ok, false)
  assert.equal(result.prepared, true)
  assert.equal(result.completion_evidence, false)
  assert.equal(result.parent_model, 'gpt-5.6-sol')
  assert.equal(result.parent_reasoning_effort, 'max')
})

test('Codex thread environment selects the in-app path unless standalone is explicit', () => {
  assert.equal(detectCodexAppSession({ CODEX_THREAD_ID: 'thread' }), true)
  assert.equal(detectCodexAppSession({ CODEX_THREAD_ID: 'thread', SKS_NARUTO_STANDALONE_CLI: '1' }), false)
  assert.equal(detectCodexAppSession({ SKS_NARUTO_APP_SESSION: '1' }), true)
  assert.equal(codexAppSessionKey({ CODEX_THREAD_ID: 'thread' }), 'thread')
  assert.equal(codexAppSessionKey({ SKS_NARUTO_APP_SESSION: '1' }), null)
  assert.equal(codexAppSessionKey({ CODEX_THREAD_ID: 'thread', SKS_NARUTO_STANDALONE_CLI: '1' }), null)
})

test('standalone parent launch exports the owning mission id to child hooks', async () => {
  let childEnv: NodeJS.ProcessEnv | undefined
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-oauth-'))
  try {
    await runOfficialSubagentWorkflow({
      root: process.cwd(),
      prompt: 'delegate and wait',
      requestedSubagents: 2,
      maxThreads: 2,
      appSession: false,
      missionId: 'M-parent-owner',
      env: {
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_PROVIDER: '',
        SKS_USE_CODEX_LB: '',
        SKS_MODEL_PROVIDER: '',
        CODEX_MODEL_PROVIDER: '',
        OPENAI_MODEL_PROVIDER: ''
      },
      runProcessImpl: async (_command, _args, opts: any) => {
        childEnv = opts.env
        return { code: 1, stdout: '', stderr: 'fixture stop', stdoutBytes: 0, stderrBytes: 12, truncated: false, timedOut: false }
      }
    })
    assert.equal(childEnv?.SKS_NARUTO_PARENT_LAUNCH, '1')
    assert.equal(childEnv?.SKS_NARUTO_PARENT_MISSION_ID, 'M-parent-owner')
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
})

test('standalone official subagent launch blocks an incompatible selected codex-lb and permits a verified version', async () => {
  let version = '1.20.0'
  let authorization: string | undefined
  const server = http.createServer((request, response) => {
    authorization = request.headers.authorization
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-app-version': version
    })
    response.end(JSON.stringify({ status: 'ok' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server address missing')
  const baseUrl = `http://127.0.0.1:${address.port}/backend-api/codex`
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-codex-lb-'))
  const home = path.join(root, 'home')
  const codexHome = path.join(home, '.codex')
  await fsp.mkdir(codexHome, { recursive: true })
  await fsp.writeFile(path.join(codexHome, 'config.toml'), [
    'model_provider = "codex-lb"',
    '',
    '[model_providers.codex-lb]',
    `base_url = "${baseUrl}"`,
    ''
  ].join('\n'))
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    CODEX_LB_BASE_URL: baseUrl,
    CODEX_LB_API_KEY: 'sk-official-subagent-secret'
  }
  let launches = 0
  const runProcessImpl = async () => {
    launches += 1
    return { code: 1, stdout: '', stderr: 'fixture stop', stdoutBytes: 0, stderrBytes: 12, truncated: false, timedOut: false }
  }
  try {
    const blocked = await runOfficialSubagentWorkflow({
      root,
      prompt: 'delegate and wait',
      requestedSubagents: 2,
      maxThreads: 2,
      appSession: false,
      env,
      runProcessImpl
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.status, 'tool_output_recovery_blocked')
    assert.equal(blocked.tool_output_recovery.status, 'version_too_old')
    assert.equal(launches, 0)
    assert.equal(authorization, undefined)
    assert.doesNotMatch(JSON.stringify(blocked), /sk-official-subagent-secret/)

    version = CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION
    const permitted = await runOfficialSubagentWorkflow({
      root,
      prompt: 'delegate and wait',
      requestedSubagents: 2,
      maxThreads: 2,
      appSession: false,
      env,
      runProcessImpl
    })
    assert.equal(permitted.status, 'parent_failed')
    assert.equal(permitted.tool_output_recovery.status, 'compatible')
    assert.equal(launches, 1)
    assert.equal(authorization, undefined)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fsp.rm(root, { recursive: true, force: true })
  }
})
