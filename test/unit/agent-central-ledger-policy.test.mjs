import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendAgentLedgerEvent, validateAgentLedgerWriteScope } from '../../dist/core/agents/agent-central-ledger.js';
import { agentHardTimeoutMs, killTimedOutAgentSessions } from '../../dist/core/agents/agent-lifecycle.js';
import { writeAgentProofEvidence } from '../../dist/core/agents/agent-proof-evidence.js';

test('agent ledger write scope blocks other sessions and orchestrator-only files', () => {
  assert.equal(validateAgentLedgerWriteScope({ actor_agent_id: 'agent_a', target_path: 'sessions/agent_a.json' }).ok, true);
  assert.equal(validateAgentLedgerWriteScope({ actor_agent_id: 'agent_a', target_path: 'agent-messages.jsonl', mode: 'append' }).ok, true);
  const other = validateAgentLedgerWriteScope({ actor_agent_id: 'agent_a', target_path: 'sessions/agent_b.json' });
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'agent_cannot_modify_other_session_record');
  const proof = validateAgentLedgerWriteScope({ actor_agent_id: 'agent_a', target_path: 'agent-proof-evidence.json' });
  assert.equal(proof.ok, false);
  assert.equal(proof.reason, 'agent_cannot_modify_orchestrator_only_file');
});

test('central ledger events redact secret-looking payloads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-ledger-redact-'));
  await fs.writeFile(path.join(root, 'agent-events.jsonl'), '');
  await appendAgentLedgerEvent(root, {
    agent_id: 'agent_a',
    session_id: 'session_a',
    event_type: 'secret_probe',
    payload: { note: 'token=sk-123456789012345678901234', api_key: 'sk-abcdefghijklmnopqrstuvwxyz' }
  });
  const text = await fs.readFile(path.join(root, 'agent-events.jsonl'), 'utf8');
  assert.equal(text.includes('sk-123456789012345678901234'), false);
  assert.equal(text.includes('sk-abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(text.includes('[redacted]'), true);
});

test('lifecycle timeout killer marks stale open session as killed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-timeout-'));
  await fs.mkdir(path.join(root, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(root, 'agent-events.jsonl'), '');
  const openedAt = '2026-05-23T00:00:00.000Z';
  await fs.writeFile(path.join(root, 'agent-sessions.json'), JSON.stringify({
    schema: 'sks.agent-sessions.v1',
    sessions: {
      agent_a: {
        agent_id: 'agent_a',
        session_id: 'agent_a-session',
        status: 'running',
        opened_at: openedAt,
        heartbeat_at: openedAt
      }
    }
  }, null, 2));
  const report = await killTimedOutAgentSessions(root, Date.parse('2026-05-23T01:30:00.000Z'));
  assert.equal(report.ok, false);
  assert.equal(report.hard_timeout_ms, 30 * 60 * 1000);
  assert.deepEqual(report.killed_sessions, ['agent_a-session']);
  const session = JSON.parse(await fs.readFile(path.join(root, 'sessions', 'agent_a.json'), 'utf8'));
  assert.equal(session.status, 'killed');
  assert.equal(session.kill_reason, 'hard_timeout');
});

test('agent hard timeout is configurable and open sessions block proof', async () => {
  assert.equal(agentHardTimeoutMs({ SKS_AGENT_HARD_TIMEOUT_MS: '2000' }), 2000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-proof-open-'));
  await fs.mkdir(path.join(root, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(root, 'agent-events.jsonl'), '');
  await fs.writeFile(path.join(root, 'agent-sessions.json'), JSON.stringify({
    schema: 'sks.agent-sessions.v1',
    sessions: {
      agent_a: {
        agent_id: 'agent_a',
        session_id: 'agent_a-session',
        status: 'running',
        opened_at: '2026-05-23T00:00:00.000Z',
        heartbeat_at: '2026-05-23T00:00:00.000Z'
      }
    }
  }, null, 2));
  const proof = await writeAgentProofEvidence(root, { missionId: 'M-open', backend: 'fake', results: [] });
  assert.equal(proof.ok, false);
  assert.ok(proof.blockers.some((blocker) => blocker.includes('session_open:agent_a-session')));
});
