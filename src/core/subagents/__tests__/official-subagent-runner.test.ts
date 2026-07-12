import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOfficialSubagentCodexArgs,
  codexAppSessionKey,
  detectCodexAppSession,
  runOfficialSubagentWorkflow
} from '../official-subagent-runner.js'

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
  await runOfficialSubagentWorkflow({
    root: process.cwd(),
    prompt: 'delegate and wait',
    requestedSubagents: 2,
    maxThreads: 2,
    appSession: false,
    missionId: 'M-parent-owner',
    runProcessImpl: async (_command, _args, opts: any) => {
      childEnv = opts.env
      return { code: 1, stdout: '', stderr: 'fixture stop', stdoutBytes: 0, stderrBytes: 12, truncated: false, timedOut: false }
    }
  })
  assert.equal(childEnv?.SKS_NARUTO_PARENT_LAUNCH, '1')
  assert.equal(childEnv?.SKS_NARUTO_PARENT_MISSION_ID, 'M-parent-owner')
})
