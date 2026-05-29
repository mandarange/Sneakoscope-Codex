#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const supervisor = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'zellij-lane-supervisor.js')).href);
const runner = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'agent-runner-zellij.js')).href);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-zellij-'));
await supervisor.initializeZellijLaneSupervisor(tmp, { missionId: 'M-agent-zellij', targetActiveSlots: 1 });
const agent = { id: 'agent_1', session_id: 'session_1', persona_id: 'agent_1', slot_id: 'slot-001', generation_index: 1 };
const result = await runner.runZellijAgent(agent, { id: 'work-001' }, { agentRoot: tmp, missionId: 'M-agent-zellij' });
const ok = result.status === 'done' && result.backend === 'zellij';
const report = { schema: 'sks.agent-zellij-runtime-check.v1', ok, result };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'agent-zellij-runtime.json'), `${JSON.stringify(report, null, 2)}\n`);
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-zellij-runtime-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
