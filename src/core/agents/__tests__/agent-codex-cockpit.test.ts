import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  AGENT_CODEX_COCKPIT_EVENTS,
  AGENT_LIVE_SUMMARY_JSON,
  appendAgentCodexCockpitHookEvent,
  writeAgentCodexCockpitArtifacts
} from '../agent-codex-cockpit.js'

test('agent cockpit writer preserves only neutral live summary and event-stream presentation artifacts', async (t) => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-live-summary-'))
  t.after(() => fs.rm(missionDir, { recursive: true, force: true }))
  const agentDir = path.join(missionDir, 'agents')
  await fs.mkdir(agentDir, { recursive: true })
  await fs.writeFile(path.join(agentDir, 'agent-sessions.json'), JSON.stringify({
    sessions: [{ id: 'agent-a', status: 'completed' }]
  }))
  await fs.writeFile(path.join(agentDir, 'agent-proof-evidence.json'), JSON.stringify({
    mission_id: 'M-live-summary',
    ok: true,
    status: 'passed',
    agent_count: 1,
    all_sessions_closed: true,
    terminal_sessions_closed: true,
    blockers: []
  }))
  await appendAgentCodexCockpitHookEvent(missionDir, {
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-a'
  })

  const written = await writeAgentCodexCockpitArtifacts(missionDir, { missionId: 'M-live-summary' })
  const summary = JSON.parse(await fs.readFile(path.join(agentDir, AGENT_LIVE_SUMMARY_JSON), 'utf8'))
  const files = await fs.readdir(agentDir)

  assert.equal(written.ok, true)
  assert.equal(summary.schema, 'sks.agent-live-summary.v1')
  assert.equal(summary.mission_id, 'M-live-summary')
  assert.equal(summary.agent_count, 1)
  assert.equal(summary.active_agents, 0)
  assert.deepEqual(written.state.artifacts, {
    live_summary: path.join('agents', AGENT_LIVE_SUMMARY_JSON),
    event_stream: path.join('agents', AGENT_CODEX_COCKPIT_EVENTS)
  })
  for (const removed of [
    'agent-codex-dashboard.json',
    'agent-codex-dashboard.md',
    'agent-session-cards.md',
    'agent-progress-timeline.md'
  ]) assert.ok(!files.includes(removed), removed)
})
