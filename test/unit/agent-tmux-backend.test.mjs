import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTmuxAgentPanePlan, runTmuxAgent } from '../../dist/core/agents/agent-runner-tmux.js';

test('tmux agent backend declares overview pane and persistent lane policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-tmux-'));
  const agent = { id: 'agent_tmux', session_id: 'agent_tmux-session', persona_id: 'agent_tmux' };
  const plan = buildTmuxAgentPanePlan(agent, { id: 'slice-01' });
  assert.equal(plan.overview_pane.title, 'overview: native_agent_orchestrator');
  assert.equal(plan.agent_pane.self_close, false);
  assert.equal(plan.agent_pane.persistent_worker_slot, true);
  const result = await runTmuxAgent(agent, { id: 'slice-01' }, { agentRoot: root });
  assert.equal(result.backend, 'tmux');
  assert.ok(result.artifacts.includes(path.join('sessions', 'agent_tmux', 'agent-tmux-report.json')));
  const report = JSON.parse(await fs.readFile(path.join(root, 'sessions', 'agent_tmux', 'agent-tmux-report.json'), 'utf8'));
  assert.equal(report.overview_pane_created, true);
  assert.equal(report.self_closing_panes, false);
  assert.equal(report.persistent_worker_slot, true);
});
