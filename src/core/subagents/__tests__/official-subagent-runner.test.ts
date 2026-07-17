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
import { writeNarutoGate } from '../official-subagent-preparation.js'
import { CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION } from '../../codex-lb/codex-lb-tool-output-recovery.js'
import { addMcpServer, editMcpServer } from '../../mcp-config/mutation.js'
import type { CodexCliMutationOperation, CodexMcpCliPort } from '../../mcp-config/codex-cli-adapter.js'

class UnavailableMcpCli implements CodexMcpCliPort {
  async list() {
    return { available: false, ok: false, rows: [], public_error: 'codex_cli_not_found' }
  }

  async transform(_before: string, _operation: CodexCliMutationOperation) {
    return {
      available: false,
      ok: false,
      used: false,
      text: null,
      unsupported_reason: 'codex_cli_not_found',
      public_error: null
    }
  }

  async login() {
    return { available: false, ok: false, public_error: 'codex_cli_not_found' }
  }

  async logout() {
    return { available: false, ok: false, public_error: 'codex_cli_not_found' }
  }
}

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

test('Naruto gate cannot pass when the required SSOT guard artifact is missing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-gate-ssot-'))
  try {
    await writeNarutoGate(dir, {
      missionId: 'M-ssot-missing',
      workflowRunId: 'run-ssot-missing',
      evidence: {
        ok: true,
        run_id: 'run-ssot-missing',
        requested_subagents: 1,
        started_threads: 1,
        completed_threads: 1,
        failed_threads: 0,
        parent_summary_present: true,
        event_sources: ['SubagentStart', 'SubagentStop']
      },
      passed: true,
      blockers: []
    })
    const gate = JSON.parse(await fsp.readFile(path.join(dir, 'naruto-gate.json'), 'utf8'))
    assert.equal(gate.passed, false)
    assert.equal(gate.ssot_guard, false)
    assert.ok(gate.blockers.some((item: string) => item.startsWith('ssot-guard.json:')))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
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

test('standalone parent registers the child PID before waiting and exposes a bounded registration blocker', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-spawn-registration-'))
  let registeredPid: number | null = null
  try {
    const result = await runOfficialSubagentWorkflow({
      root: process.cwd(),
      prompt: 'delegate and wait',
      requestedSubagents: 1,
      maxThreads: 1,
      appSession: false,
      env: {
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_PROVIDER: '',
        SKS_USE_CODEX_LB: '',
        SKS_MODEL_PROVIDER: '',
        CODEX_MODEL_PROVIDER: '',
        OPENAI_MODEL_PROVIDER: ''
      },
      onChildSpawn: async (pid) => {
        registeredPid = pid
      },
      runProcessImpl: async (_command, _args, opts: any) => {
        await opts.onSpawn?.(43210)
        return {
          code: -1,
          pid: 43210,
          stdout: '',
          stderr: '',
          stdoutBytes: 0,
          stderrBytes: 0,
          truncated: false,
          timedOut: false,
          spawnRegistrationFailed: true
        }
      }
    })
    assert.equal(registeredPid, 43210)
    assert.deepEqual(result.blockers, ['codex_parent_spawn_registration_failed'])
  } finally {
    await fsp.rm(home, { recursive: true, force: true })
  }
})

test('standalone parent converts timeout and non-zero exits into bounded blocker codes', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-bounded-failure-'))
  try {
    const cases = [
      {
        process: {
          code: null,
          stdout: '',
          stderr: 'raw timeout detail must not become a blocker',
          stdoutBytes: 0,
          stderrBytes: 44,
          truncated: false,
          timedOut: true
        },
        blocker: 'codex_parent_timeout'
      },
      {
        process: {
          code: 70,
          stdout: '',
          stderr: 'raw MCP protocol failure detail must not become a blocker',
          stdoutBytes: 0,
          stderrBytes: 55,
          truncated: false,
          timedOut: false
        },
        blocker: 'codex_parent_exit:70'
      }
    ]
    for (const fixture of cases) {
      const result = await runOfficialSubagentWorkflow({
        root: process.cwd(),
        prompt: 'delegate and wait',
        requestedSubagents: 1,
        maxThreads: 1,
        appSession: false,
        env: {
          HOME: home,
          CODEX_HOME: path.join(home, '.codex'),
          SKS_PROVIDER: '',
          SKS_USE_CODEX_LB: '',
          SKS_MODEL_PROVIDER: '',
          CODEX_MODEL_PROVIDER: '',
          OPENAI_MODEL_PROVIDER: ''
        },
        runProcessImpl: async () => fixture.process
      })
      assert.deepEqual(result.blockers, [fixture.blocker])
      assert.equal(JSON.stringify(result.blockers).includes('raw MCP'), false)
      assert.equal(JSON.stringify(result.blockers).includes('raw timeout'), false)
    }
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

test('standalone Naruto parent consumes the existing project MCP config and calls its read-only stdio tool', { timeout: 20_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('executable fixture uses a POSIX shebang')
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-subagent-project-mcp-'))
  const home = path.join(root, 'home')
  const project = path.join(root, 'project')
  const codexHome = path.join(home, '.codex')
  const serverFile = path.join(project, 'project-read-tool.mjs')
  const fakeCodex = path.join(root, 'codex-fixture.mjs')
  const callReceipt = path.join(project, 'project-mcp-call.json')
  await fsp.mkdir(codexHome, { recursive: true })
  await fsp.mkdir(path.join(project, '.codex'), { recursive: true })
  t.after(async () => fsp.rm(root, { recursive: true, force: true }))

  await fsp.writeFile(serverFile, [
    "import readline from 'node:readline'",
    "const rl = readline.createInterface({ input: process.stdin })",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line)",
    "  if (message.method === 'initialize') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} } } }))",
    "  if (message.method === 'tools/list') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'read_project_marker', description: 'Read a fixed project marker', inputSchema: { type: 'object', additionalProperties: false } }] } }))",
    "  if (message.method === 'tools/call') console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'project-mcp-ok' }], isError: false } }))",
    "})"
  ].join('\n'), { mode: 0o600 })

  await fsp.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs'",
    "import path from 'node:path'",
    "import readline from 'node:readline'",
    "import { spawn } from 'node:child_process'",
    "const args = process.argv.slice(2)",
    "const outputIndex = args.indexOf('--output-last-message')",
    "const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : ''",
    "const configFile = path.join(process.cwd(), '.codex', 'config.toml')",
    "const config = fs.readFileSync(configFile, 'utf8')",
    "const match = config.match(/\\[mcp_servers\\.(?:project_probe|\"project_probe\")\\]([\\s\\S]*?)(?=\\n\\[|$)/)",
    "if (!match) throw new Error('project_mcp_block_missing')",
    "const block = match[1]",
    "const commandLine = block.split(/\\r?\\n/).find((line) => /^command\\s*=/.test(line))",
    "const argsLine = block.split(/\\r?\\n/).find((line) => /^args\\s*=/.test(line))",
    "const command = JSON.parse(String(commandLine || '').replace(/^command\\s*=\\s*/, ''))",
    "const childArgs = argsLine ? JSON.parse(argsLine.replace(/^args\\s*=\\s*/, '')) : []",
    "const child = spawn(command, childArgs, { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })",
    "const lines = readline.createInterface({ input: child.stdout })",
    "const pending = new Map()",
    "lines.on('line', (line) => { const message = JSON.parse(line); const resolve = pending.get(message.id); if (resolve) { pending.delete(message.id); resolve(message) } })",
    "const request = (id, method, params = {}) => new Promise((resolve, reject) => { pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n'); setTimeout(() => reject(new Error('fixture_mcp_timeout')), 3000).unref() })",
    "await request(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } })",
    "child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\\n')",
    "const listed = await request(2, 'tools/list')",
    "if (!listed.result.tools.some((tool) => tool.name === 'read_project_marker')) throw new Error('project_mcp_tool_missing')",
    "const called = await request(3, 'tools/call', { name: 'read_project_marker', arguments: {} })",
    "const text = called.result.content?.[0]?.text",
    "fs.writeFileSync(path.join(process.cwd(), 'project-mcp-call.json'), JSON.stringify({ tool: 'read_project_marker', text }))",
    "if (text !== 'project-mcp-ok') throw new Error('project_mcp_tool_result_invalid')",
    "child.stdin.end()",
    "child.kill('SIGTERM')",
    "if (!outputFile) throw new Error('parent_summary_output_missing')",
    "fs.writeFileSync(outputFile, 'project MCP fixture complete')"
  ].join('\n'), { mode: 0o700 })

  const cli = new UnavailableMcpCli()
  const previousAllowed = process.env.PROJECT_MCP_ALLOWED
  process.env.PROJECT_MCP_ALLOWED = 'runtime-value-must-not-be-written'
  t.after(() => {
    if (previousAllowed === undefined) delete process.env.PROJECT_MCP_ALLOWED
    else process.env.PROJECT_MCP_ALLOWED = previousAllowed
  })
  const registration = {
    schema: 'sks.mcp-server-config.v2',
    name: 'project_probe',
    transport: 'stdio',
    command: process.execPath,
    args: [serverFile],
    env_vars: ['PROJECT_MCP_ALLOWED'],
    cwd: project,
    enabled_tools: ['read_project_marker'],
    default_tools_approval_mode: 'auto',
    required: true
  }
  const added = await addMcpServer(registration, 'project', {
    projectRoot: project,
    projectTrusted: true,
    confirmProjectMutation: true,
    cli
  })
  assert.equal(added.ok, true)
  const reapplied = await editMcpServer('project_probe', registration, 'project', {
    projectRoot: project,
    projectTrusted: true,
    confirmProjectMutation: true,
    cli
  })
  assert.equal(reapplied.ok, true)
  const config = await fsp.readFile(path.join(project, '.codex', 'config.toml'), 'utf8')
  assert.equal((config.match(/\[mcp_servers\."project_probe"\]/g) || []).length, 1)
  assert.match(config, /env_vars = \["PROJECT_MCP_ALLOWED"\]/)
  assert.doesNotMatch(config, /runtime-value-must-not-be-written/)

  const result = await runOfficialSubagentWorkflow({
    root: project,
    prompt: 'Use the registered read-only project tool and report its marker.',
    requestedSubagents: 1,
    maxThreads: 1,
    appSession: false,
    missionId: 'M-project-mcp-fixture',
    codexBin: fakeCodex,
    env: {
      HOME: home,
      CODEX_HOME: codexHome,
      SKS_PROVIDER: '',
      SKS_USE_CODEX_LB: '',
      SKS_MODEL_PROVIDER: '',
      CODEX_MODEL_PROVIDER: '',
      OPENAI_MODEL_PROVIDER: ''
    }
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'parent_completed')
  assert.equal(result.parent_summary, 'project MCP fixture complete')
  assert.deepEqual(JSON.parse(await fsp.readFile(callReceipt, 'utf8')), {
    tool: 'read_project_marker',
    text: 'project-mcp-ok'
  })
})
