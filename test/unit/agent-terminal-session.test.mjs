import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertAgentTerminalSessionsClosed, closeAgentTerminalSession, startAgentTerminalSession } from '../../dist/core/agents/agent-terminal-session.js';

test('records terminal session and close report for an agent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-terminal-unit-'));
  await fs.writeFile(path.join(root, 'agent-sessions.json'), JSON.stringify({ schema: 'sks.agent-sessions.v1', sessions: { a1: { agent_id: 'a1', session_id: 's1', status: 'closed' } } }));
  const agent = { id: 'a1', session_id: 's1' };
  await startAgentTerminalSession(root, agent, { backend: 'fake', real: false });
  await closeAgentTerminalSession(root, agent, { exitCode: 0, status: 'done' });
  const report = await assertAgentTerminalSessionsClosed(root);
  assert.equal(report.ok, true);
});
