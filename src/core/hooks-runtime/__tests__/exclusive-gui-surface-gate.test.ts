import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { evaluateHookPayloadOnce } from '../../hooks-runtime.js'
import { normalizeHookResult } from '../hook-io.js'
import {
  EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME,
  PENDING_CLAIM_TTL_MS,
  RUNNING_CLAIM_TTL_MS,
  bindExclusiveGuiSurfaceStart,
  claimExclusiveGuiSurface,
  refreshExclusiveGuiSurfaceOwner,
  releaseExclusiveGuiSurface
} from '../exclusive-gui-surface-gate.js'
import { officialSubagentArtifactDir } from '../official-subagent-lifecycle.js'
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js'
import { openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js'

const SESSION = 'gui-session'
const T0 = Date.parse('2026-10-01T09:00:00.000Z')

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-gui-gate-'))
  try {
    await fsp.mkdir(path.join(root, '.sneakoscope'), { recursive: true })
    return await run(root)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
}

function spawn(agentType: string | undefined, toolName = 'collaborationspawn_agent', toolUseId?: string) {
  return {
    tool_name: toolName,
    ...(toolUseId === undefined ? {} : { tool_use_id: toolUseId }),
    tool_input: { task_name: 'gui_slice', message: 'Operate the surface.', fork_turns: 'none', ...(agentType === undefined ? {} : { agent_type: agentType }) }
  }
}

const gate = (root: string, payload: any, now = T0) => claimExclusiveGuiSurface({ root, sessionKey: SESSION, payload, now })
const child = (root: string, agentId: string, agentType: string, now = T0) =>
  ({ root, sessionKey: SESSION, payload: { agent_id: agentId, agent_type: agentType }, now })

test('a second concurrent child for a surface is denied for every alias, and the other surface stays free', async () => {
  await withRoot(async (root) => {
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'allow')
    for (const alias of ['browser_use_operator', 'browser-use-operator', 'chrome-operator', 'web-operator', 'Browser-Use-Operator']) {
      const denied = await gate(root, spawn(alias))
      assert.equal(denied.action, 'block', alias)
      assert.match((denied as any).message, /exclusive GUI surface gate/)
      assert.match((denied as any).message, /Browser surface is already owned/)
    }
    // Computer Use is a different surface, and unrelated children are never limited.
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'allow')
    assert.equal((await gate(root, spawn('desktop-operator'))).action, 'block')
    for (const free of ['image_generation_operator', 'explorer', 'worker', undefined]) {
      assert.equal((await gate(root, spawn(free))).action, 'allow', String(free))
      assert.equal((await gate(root, spawn(free))).action, 'allow', String(free))
    }
  })
})

test('every spawn tool name Codex uses is gated and other tools are never touched', async () => {
  await withRoot(async (root) => {
    assert.equal((await gate(root, spawn('computer_use_operator', 'spawn_agent'))).action, 'allow')
    for (const name of ['collaborationspawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent', 'multi_agent_v1spawn_agent']) {
      assert.equal((await gate(root, spawn('computer_use_operator', name))).action, 'block', name)
    }
    const ledger = path.join(officialSubagentArtifactDir(root, {}, SESSION), EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME)
    const before = await fsp.readFile(ledger, 'utf8')
    assert.equal((await gate(root, { tool_name: 'exec_command', tool_input: { agent_type: 'computer_use_operator' } })).action, 'allow')
    assert.equal(await fsp.readFile(ledger, 'utf8'), before)
  })
})

test('the surface stays owned from SubagentStart until that agent stops, then frees', async () => {
  await withRoot(async (root) => {
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'allow')
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-1', 'computer_use_operator'))
    const denied: any = await gate(root, spawn('computer_use_operator'))
    assert.equal(denied.action, 'block')
    assert.match(denied.message, /child agent-1/)

    // A different agent stopping, or a stop with no agent id, frees nothing.
    await releaseExclusiveGuiSurface(child(root, 'agent-other', 'worker'))
    await releaseExclusiveGuiSurface({ root, sessionKey: SESSION, payload: {}, now: T0 })
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'block')

    await releaseExclusiveGuiSurface(child(root, 'agent-1', 'computer_use_operator'))
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'allow')
    // Stopping twice is harmless.
    await releaseExclusiveGuiSurface(child(root, 'agent-1', 'computer_use_operator'))
  })
})

test('two spawn calls of one turn cannot both claim the surface', async () => {
  await withRoot(async (root) => {
    const results = await Promise.all(Array.from({ length: 6 }, () => gate(root, spawn('browser_use_operator'))))
    assert.equal(results.filter((result) => result.action === 'allow').length, 1)
    assert.equal(results.filter((result) => result.action === 'block').length, 5)
  })
})

test('a start nobody claimed still records its owner, and a start binds the oldest pending claim of its own surface', async () => {
  await withRoot(async (root) => {
    // Host that skipped PreToolUse: the running child must still block a new spawn.
    await bindExclusiveGuiSurfaceStart(child(root, 'late-agent', 'browser_use_operator'))
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'block')
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'allow')
    // The computer-use child starting must take the computer-use claim, not the browser one.
    await bindExclusiveGuiSurfaceStart(child(root, 'cu-agent', 'computer_use_operator'))
    await releaseExclusiveGuiSurface(child(root, 'cu-agent', 'computer_use_operator'))
    assert.equal((await gate(root, spawn('computer_use_operator'))).action, 'allow')
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'block')
    // Starts of other roles never claim anything.
    await bindExclusiveGuiSurfaceStart(child(root, 'worker-1', 'worker'))
    await releaseExclusiveGuiSurface(child(root, 'late-agent', 'browser_use_operator'))
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'allow')
  })
})

test('a reused agent id replaces its earlier generation instead of duplicating the claim', async () => {
  await withRoot(async (root) => {
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-9', 'browser_use_operator'))
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-9', 'computer_use_operator', T0 + 1000))
    // The browser claim of the earlier generation is gone; the id now owns Computer Use only.
    assert.equal((await gate(root, spawn('browser_use_operator'), T0 + 2000)).action, 'allow')
    assert.equal((await gate(root, spawn('computer_use_operator'), T0 + 2000)).action, 'block')
    await releaseExclusiveGuiSurface(child(root, 'agent-9', 'computer_use_operator', T0 + 3000))
    assert.equal((await gate(root, spawn('computer_use_operator'), T0 + 3000)).action, 'allow')
  })
})

test('a spawn Codex never started and an owner that never stopped both expire', async () => {
  await withRoot(async (root) => {
    // Pending claim: Codex can reject a spawn after PreToolUse allowed it.
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'allow')
    assert.equal((await gate(root, spawn('browser_use_operator'), T0 + PENDING_CLAIM_TTL_MS)).action, 'block')
    assert.equal((await gate(root, spawn('browser_use_operator'), T0 + PENDING_CLAIM_TTL_MS + 1)).action, 'allow')

    // Running claim with no activity and no Stop.
    await bindExclusiveGuiSurfaceStart(child(root, 'silent', 'computer_use_operator', T0))
    assert.equal((await gate(root, spawn('computer_use_operator'), T0 + RUNNING_CLAIM_TTL_MS)).action, 'block')
    assert.equal((await gate(root, spawn('computer_use_operator'), T0 + RUNNING_CLAIM_TTL_MS + 1)).action, 'allow')
  })
})

test('an owner tool call refreshes its claim, throttled to one write per interval', async () => {
  await withRoot(async (root) => {
    await bindExclusiveGuiSurfaceStart(child(root, 'busy', 'browser_use_operator', T0))
    const ledger = path.join(officialSubagentArtifactDir(root, {}, SESSION), EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME)
    const written = async () => (await fsp.stat(ledger)).mtimeMs

    // A tool call inside the refresh interval changes nothing.
    const first = await written()
    await refreshExclusiveGuiSurfaceOwner(child(root, 'busy', 'browser_use_operator', T0 + 10_000))
    assert.equal(await written(), first)

    // Calls keep the claim alive well past the running TTL.
    for (let minute = 10; minute <= 60; minute += 10) {
      await refreshExclusiveGuiSurfaceOwner(child(root, 'busy', 'browser_use_operator', T0 + minute * 60_000))
    }
    assert.equal((await gate(root, spawn('browser_use_operator'), T0 + 60 * 60_000 + 1000)).action, 'block')

    // A child that owns nothing, or has no agent id, never creates a ledger entry.
    await refreshExclusiveGuiSurfaceOwner(child(root, 'stranger', 'worker', T0 + 61 * 60_000))
    await refreshExclusiveGuiSurfaceOwner({ root, sessionKey: SESSION, payload: {}, now: T0 + 61 * 60_000 })
    const rows = JSON.parse(await fsp.readFile(ledger, 'utf8')).claims
    assert.deepEqual(rows.map((claim: any) => claim.agent_id), ['busy'])
  })
})

test('a re-delivered PreToolUse is not denied by its own claim', async () => {
  await withRoot(async (root) => {
    assert.equal((await gate(root, spawn('browser_use_operator', 'collaborationspawn_agent', 'call-1'))).action, 'allow')
    // Same call delivered again (a daemon timeout falls back to an inline run): still the first owner.
    assert.equal((await gate(root, spawn('browser_use_operator', 'collaborationspawn_agent', 'call-1'))).action, 'allow')
    // A different call is a second child; so is a call without an id.
    assert.equal((await gate(root, spawn('browser_use_operator', 'collaborationspawn_agent', 'call-2'))).action, 'block')
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'block')
    const ledger = path.join(officialSubagentArtifactDir(root, {}, SESSION), EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME)
    assert.equal(JSON.parse(await fsp.readFile(ledger, 'utf8')).claims.length, 1)
    // Once the child is running, the same call id no longer matches a pending claim.
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-1', 'browser_use_operator'))
    assert.equal((await gate(root, spawn('browser_use_operator', 'collaborationspawn_agent', 'call-1'))).action, 'block')
  })
})

test('a resumed operator gets a Stop per turn and no new Start, so its next tool call adopts the surface again', async () => {
  await withRoot(async (root) => {
    assert.equal((await gate(root, spawn('browser_use_operator'))).action, 'allow')
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-1', 'browser_use_operator'))
    // End of the first turn: the surface is free between turns.
    await releaseExclusiveGuiSurface(child(root, 'agent-1', 'browser_use_operator', T0 + 1000))
    // Codex resumes the same child: a tool call, but no SubagentStart.
    await refreshExclusiveGuiSurfaceOwner(child(root, 'agent-1', 'browser_use_operator', T0 + 2000))
    const denied: any = await gate(root, spawn('browser_use_operator'), T0 + 3000)
    assert.equal(denied.action, 'block')
    assert.match(denied.message, /child agent-1/)
    // The resumed turn ends like any other.
    await releaseExclusiveGuiSurface(child(root, 'agent-1', 'browser_use_operator', T0 + 4000))
    assert.equal((await gate(root, spawn('browser_use_operator'), T0 + 5000)).action, 'allow')
  })
})

test('adoption never takes a held surface and never happens for other roles', async () => {
  await withRoot(async (root) => {
    await bindExclusiveGuiSurfaceStart(child(root, 'owner', 'computer_use_operator'))
    // A second operator (for example resumed while another owns the surface) cannot adopt it.
    await refreshExclusiveGuiSurfaceOwner(child(root, 'intruder', 'computer_use_operator', T0 + 60_000))
    const ledger = path.join(officialSubagentArtifactDir(root, {}, SESSION), EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME)
    assert.deepEqual(JSON.parse(await fsp.readFile(ledger, 'utf8')).claims.map((claim: any) => claim.agent_id), ['owner'])
    // Other roles and the other surface behave as they should.
    await refreshExclusiveGuiSurfaceOwner(child(root, 'helper', 'worker', T0 + 60_000))
    await refreshExclusiveGuiSurfaceOwner(child(root, 'tab-operator', 'browser_use_operator', T0 + 60_000))
    assert.deepEqual(JSON.parse(await fsp.readFile(ledger, 'utf8')).claims.map((claim: any) => claim.agent_id).sort(), ['owner', 'tab-operator'])
  })
})

test('a denial names the owner and how a missed event frees the surface', async () => {
  await withRoot(async (root) => {
    await gate(root, spawn('browser_use_operator'))
    const pending: any = await gate(root, spawn('browser_use_operator'), T0 + 5000)
    assert.match(pending.message, /a spawn allowed 5 s ago that has not started yet/)
    assert.match(pending.message, new RegExp(`frees itself ${PENDING_CLAIM_TTL_MS / 1000} s after it`))
    await bindExclusiveGuiSurfaceStart(child(root, 'agent-7', 'browser_use_operator', T0 + 6000))
    const running: any = await gate(root, spawn('browser_use_operator'), T0 + 7000)
    assert.match(running.message, /child agent-7, which has not stopped/)
    assert.match(running.message, new RegExp(`frees itself ${RUNNING_CLAIM_TTL_MS / 60_000} minutes after its last tool call`))
  })
})

test('OpenRouter Only routes a managed role to a list role first, so that spawn makes no claim', async () => {
  await withRoot(async (root) => {
    await writeOpenRouterOnlyState({
      enabled: true,
      subagent_models: [{ model: 'z-ai/glm-5.3', criteria: 'General work.', reasoning_effort: 'high', default: true }]
    })
    try {
      const base = { session_id: SESSION, turn_id: 'turn-1' }
      const spawnPayload = (id: string) => ({
        ...base,
        tool_use_id: id,
        tool_name: 'collaborationspawn_agent',
        tool_input: { task_name: 'operate_browser', message: 'Capture evidence.', agent_type: 'browser_use_operator', fork_turns: 'none' }
      })
      for (const id of ['or-1', 'or-2']) {
        const wire: any = normalizeHookResult('pre-tool', await evaluateHookPayloadOnce('pre-tool', spawnPayload(id), { root }))
        assert.notEqual(wire?.hookSpecificOutput?.permissionDecision, 'deny', id)
      }
      const ledger = path.join(officialSubagentArtifactDir(root, {}, SESSION), EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME)
      await assert.rejects(fsp.stat(ledger))
    } finally {
      await fsp.rm(openRouterOnlyStatePath(), { force: true })
    }
  })
})

test('parents in different sessions keep separate ledgers', async () => {
  await withRoot(async (root) => {
    assert.equal((await claimExclusiveGuiSurface({ root, sessionKey: 'a', payload: spawn('browser_use_operator'), now: T0 })).action, 'allow')
    assert.equal((await claimExclusiveGuiSurface({ root, sessionKey: 'b', payload: spawn('browser_use_operator'), now: T0 })).action, 'allow')
    assert.equal((await claimExclusiveGuiSurface({ root, sessionKey: 'a', payload: spawn('browser_use_operator'), now: T0 })).action, 'block')
  })
})

test('real hook dispatch: PreToolUse, SubagentStart, and SubagentStop drive the gate for a parent outside any mission', async () => {
  await withRoot(async (root) => {
    const base = { session_id: SESSION, turn_id: 'turn-1' }
    const spawnPayload = (id: string) => ({
      ...base,
      tool_use_id: id,
      tool_name: 'collaborationspawn_agent',
      tool_input: {
        task_name: 'operate_browser',
        message: 'Open the settings page and capture evidence.',
        agent_type: 'browser_use_operator',
        model: T.context,
        reasoning_effort: 'medium',
        fork_turns: 'none'
      }
    })
    const decision = async (name: string, payload: any) => {
      const wire: any = normalizeHookResult(name as any, await evaluateHookPayloadOnce(name as any, payload, { root }))
      return wire?.hookSpecificOutput?.permissionDecision ?? 'allow'
    }

    assert.equal(await decision('pre-tool', spawnPayload('spawn-1')), 'allow')
    const second: any = normalizeHookResult('pre-tool', await evaluateHookPayloadOnce('pre-tool', spawnPayload('spawn-2'), { root }))
    assert.equal(second.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(second.hookSpecificOutput.permissionDecisionReason, /exclusive GUI surface gate/)

    await evaluateHookPayloadOnce('subagent-start', { ...base, agent_id: 'agent-browser', agent_type: 'browser_use_operator', model: T.context }, { root })
    assert.equal(await decision('pre-tool', spawnPayload('spawn-3')), 'deny')

    // A child tool call that is not a spawn is never gated.
    assert.equal(await decision('pre-tool', { ...base, agent_id: 'agent-browser', agent_type: 'browser_use_operator', tool_use_id: 'read-1', tool_name: 'Read', tool_input: { file_path: 'README.md' } }), 'allow')

    await evaluateHookPayloadOnce('subagent-stop', { ...base, agent_id: 'agent-browser', agent_type: 'browser_use_operator' }, { root })
    assert.equal(await decision('pre-tool', spawnPayload('spawn-4')), 'allow')
  })
})
