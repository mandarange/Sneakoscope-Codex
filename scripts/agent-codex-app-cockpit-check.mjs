#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
for (const rel of ['src/core/agents/agent-codex-cockpit.ts', 'src/core/agents/agent-orchestrator.ts']) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`missing:${rel}`);
}
const source = read('src/core/agents/agent-codex-cockpit.ts');
for (const token of [
  'agent-codex-dashboard.md',
  'agent-codex-dashboard.json',
  'agent-session-cards.md',
  'agent-live-summary.json',
  'agent-progress-timeline.md',
  'SubagentStart',
  'SubagentStop'
]) {
  if (!source.includes(token)) issues.push(`cockpit_missing:${token}`);
}
if (!read('src/core/agents/agent-orchestrator.ts').includes('writeAgentCodexCockpitArtifacts')) {
  issues.push('orchestrator_not_writing_cockpit');
}
if (!read('src/core/agents/agent-orchestrator.ts').includes('appendAgentCodexCockpitHookEvent')) {
  issues.push('orchestrator_not_writing_cockpit_events');
}
for (const token of ['dashboard', 'cockpit', 'codexApp', 'agent-codex-dashboard.md']) {
  if (!read('src/core/commands/agent-command.ts').includes(token) && !read('src/core/agents/agent-command-surface.ts').includes(token)) {
    issues.push(`agent_command_cockpit_missing:${token}`);
  }
}

await runFixture();

const result = { schema: 'sks.agent-codex-app-cockpit-check.v1', ok: issues.length === 0, issues };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function read(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
}

async function runFixture() {
  const built = path.join(root, 'dist', 'core', 'agents', 'agent-codex-cockpit.js');
  if (!fs.existsSync(built)) {
    issues.push('fixture_dist_cockpit_missing_run_build_first');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-cockpit-'));
  const missionDir = path.join(tmp, '.sneakoscope', 'missions', 'M-cockpit');
  const agentDir = path.join(missionDir, 'agents');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(missionDir, 'mission.json'), JSON.stringify({ id: 'M-cockpit', mode: 'agent', created_at: '2026-05-25T00:00:00.000Z' }));
  fs.writeFileSync(path.join(agentDir, 'agent-sessions.json'), JSON.stringify({ schema: 'sks.agent-sessions.v1', sessions: { agent_1: { agent_id: 'agent_1', session_id: 'session_1', status: 'closed', heartbeat_at: '2026-05-25T00:00:00.000Z' } } }));
  fs.writeFileSync(path.join(agentDir, 'agent-proof-evidence.json'), JSON.stringify({ schema: 'sks.agent-proof-evidence.v1', ok: true, status: 'passed', mission_id: 'M-cockpit', backend: 'fake', agent_count: 1, all_sessions_closed: true, blockers: [] }));
  const mod = await import(pathToFileURL(built).href);
  await mod.appendAgentCodexCockpitHookEvent(missionDir, { hook_event_name: 'SubagentStart', agent_id: 'agent_1', session_id: 'session_1', cwd: tmp });
  await mod.appendAgentCodexCockpitHookEvent(missionDir, { hook_event_name: 'SubagentStop', agent_id: 'agent_1', session_id: 'session_1', cwd: tmp, last_assistant_message: 'done' });
  await mod.writeAgentCodexCockpitArtifacts(missionDir, { missionId: 'M-cockpit', projectHash: 'fixture' });
  for (const artifact of ['agent-codex-dashboard.md', 'agent-codex-dashboard.json', 'agent-session-cards.md', 'agent-live-summary.json', 'agent-progress-timeline.md', 'agent-codex-cockpit-events.jsonl']) {
    if (!fs.existsSync(path.join(agentDir, artifact))) issues.push(`fixture_missing:${artifact}`);
  }
  const dashboard = JSON.parse(fs.readFileSync(path.join(agentDir, 'agent-codex-dashboard.json'), 'utf8'));
  if (!dashboard.agents?.[0] || dashboard.agents[0].heartbeat_age_ms === undefined) issues.push('fixture_heartbeat_age_missing');
  if (dashboard.agents?.[0]?.status !== 'closed') issues.push('fixture_object_session_status_not_rendered');
  const eventStream = fs.readFileSync(path.join(agentDir, 'agent-codex-cockpit-events.jsonl'), 'utf8');
  if (!eventStream.includes('SubagentStart') || !eventStream.includes('SubagentStop')) issues.push('fixture_cockpit_event_stream_missing_lifecycle');
  const cli = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'agent', 'cockpit', 'M-cockpit'], { cwd: tmp, encoding: 'utf8' });
  if (cli.status !== 0 || !cli.stdout.includes('Agent Codex Dashboard')) issues.push('fixture_agent_cockpit_cli_failed');
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-cockpit-broken-'));
  const brokenMission = path.join(broken, '.sneakoscope', 'missions', 'M-cockpit-broken');
  fs.mkdirSync(path.join(brokenMission, 'agents'), { recursive: true });
  await mod.writeAgentCodexCockpitArtifacts(brokenMission, { missionId: 'M-cockpit-broken', projectHash: 'fixture' });
  const brokenDashboard = JSON.parse(fs.readFileSync(path.join(brokenMission, 'agents', 'agent-codex-dashboard.json'), 'utf8'));
  if (!brokenDashboard.blockers?.includes('agent_sessions_missing')) issues.push('fixture_missing_sessions_not_reported');
}
