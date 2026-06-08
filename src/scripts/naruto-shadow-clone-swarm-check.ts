#!/usr/bin/env node
// @ts-nocheck
// $Naruto Shadow Clone Swarm gate.
// Proves the high-scale mode lifts the standard 20-agent ceiling to 100 clones WITHOUT
// changing it for any other route, and that an end-to-end `sks naruto run` actually
// schedules >20 concurrent clone sessions to completion with proof.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist, root, exists } from './sks-1-18-gate-lib.js';

const schema = await importDist('core/agents/agent-schema.js');
const roster = await importDist('core/agents/agent-roster.js');
const scheduler = await importDist('core/agents/agent-scheduler.js');
const effortPolicy = await importDist('core/agents/agent-effort-policy.js');

// 1) Naruto ceiling exists and is 100; standard ceiling untouched at 20.
assertGate(schema.MAX_NARUTO_AGENT_COUNT === 100, 'MAX_NARUTO_AGENT_COUNT must be 100', { value: schema.MAX_NARUTO_AGENT_COUNT });
assertGate(schema.MAX_AGENT_COUNT === 20, 'MAX_AGENT_COUNT must remain 20 (standard ceiling)', { value: schema.MAX_AGENT_COUNT });

// 2) Cap is lifted ONLY when the naruto max is passed; default callers still clamp to 20.
const narutoSlots = scheduler.normalizeTargetActiveSlots(100, schema.MAX_NARUTO_AGENT_COUNT);
const defaultSlots = scheduler.normalizeTargetActiveSlots(100);
assertGate(narutoSlots === 100, 'normalizeTargetActiveSlots(100, naruto-max) must be 100', { narutoSlots });
assertGate(defaultSlots === 20, 'normalizeTargetActiveSlots(100) default must stay clamped to 20', { defaultSlots });

// 3) A 100-clone roster builds 100 unique clones (no unique-persona ceiling).
const fullRoster = roster.buildNarutoCloneRoster({ clones: 100, maxAgentCount: schema.MAX_NARUTO_AGENT_COUNT });
const uniqueIds = new Set(fullRoster.roster.map((row) => row.id)).size;
assertGate(fullRoster.agent_count === 100, 'clone roster must have 100 clones', { agent_count: fullRoster.agent_count });
assertGate(uniqueIds === 100, 'clone roster ids must be unique', { uniqueIds });
assertGate(fullRoster.max_agents === 100, 'clone roster max_agents must be 100', { max_agents: fullRoster.max_agents });

// 4) Over-cap is clamped, not crashed.
const overCap = roster.buildNarutoCloneRoster({ clones: 500, maxAgentCount: schema.MAX_NARUTO_AGENT_COUNT });
assertGate(overCap.agent_count === 100, 'clones above the ceiling clamp to 100', { agent_count: overCap.agent_count });

// 4b) Dynamic per-clone effort policy (like team mode), capped + always fast.
//     A neutral/no-tool prompt yields a low/medium MIX: read-only personas -> low, writers -> medium.
const effortRoster = roster.buildNarutoCloneRoster({ clones: 24, prompt: 'review and summarize the current findings', maxAgentCount: schema.MAX_NARUTO_AGENT_COUNT });
const efforts = new Set(effortRoster.roster.map((row) => row.reasoning_effort));
const tiers = new Set(effortRoster.roster.map((row) => row.service_tier));
const fastFlags = new Set(effortRoster.roster.map((row) => row.fast_mode));
assertGate([...efforts].every((e) => e === 'low' || e === 'medium'), 'naruto clone efforts must be only low/medium (never high/xhigh)', { efforts: [...efforts] });
assertGate(efforts.has('low') && efforts.has('medium'), 'naruto effort must be dynamic: a no-tool prompt must yield both low and medium clones', { efforts: [...efforts] });
assertGate([...tiers].length === 1 && tiers.has('fast'), 'every naruto clone must be fast service tier', { tiers: [...tiers] });
assertGate([...fastFlags].length === 1 && fastFlags.has(true), 'every naruto clone must have fast_mode=true', { fastFlags: [...fastFlags] });

// 4c) Unit rule: no tool use -> low; any tool use -> medium; always fast.
const simple = effortPolicy.decideNarutoCloneEffort({ readonly: true, prompt: 'explain the architecture overview' });
const toolWrite = effortPolicy.decideNarutoCloneEffort({ readonly: false, prompt: 'add a feature' });
const toolReadCmd = effortPolicy.decideNarutoCloneEffort({ readonly: true, prompt: 'run the build and apply the migration' });
assertGate(simple.reasoning_effort === 'low' && simple.service_tier === 'fast', 'no-tool read-only work must be low + fast', { simple });
assertGate(toolWrite.reasoning_effort === 'medium' && toolWrite.service_tier === 'fast', 'writing clone (tool use) must be medium + fast', { toolWrite });
assertGate(toolReadCmd.reasoning_effort === 'medium' && toolReadCmd.service_tier === 'fast', 'read-only work with tool/command signals must be medium + fast', { toolReadCmd });

// 5) System-safe concurrency: never spawn the whole count at once; throttle to host capacity.
const fakeSafe = roster.systemSafeNarutoConcurrency({ backend: 'fake' });
const heavySafe = roster.systemSafeNarutoConcurrency({ backend: 'codex-sdk' });
const lowFreeButCapable = roster.systemSafeNarutoConcurrency({
  backend: 'codex-sdk',
  cores: 10,
  freeBytes: 512 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024 * 1024
});
assertGate(fakeSafe.cap >= 1 && fakeSafe.cap <= schema.MAX_NARUTO_AGENT_COUNT, 'fake-backend concurrency cap must be in [1, 100]', { fakeSafe });
// codex-sdk workers are network-bound (each mostly idle awaiting the Codex API),
// so concurrency is bounded by MEMORY + the 100-clone ceiling, NOT by CPU cores: a
// capable host may run up to MAX_NARUTO_AGENT_COUNT in parallel.
assertGate(heavySafe.cap >= 1 && heavySafe.cap <= schema.MAX_NARUTO_AGENT_COUNT, 'heavy-backend concurrency cap must be in [1, 100]', { heavySafe });
assertGate(heavySafe.cap <= fakeSafe.cap, 'heavy backend must throttle no looser than the light backend', { heavySafe, fakeSafe });
assertGate(heavySafe.cores >= 1, 'must detect at least one core', { cores: heavySafe.cores });
assertGate(lowFreeButCapable.cap >= 4, 'capable hosts must not collapse Naruto codex-sdk concurrency to 1 just because free memory is low', { lowFreeButCapable });
// A big-memory host is NOT throttled by core count: simulate 64 GB and assert the
// heavy backend scales well past the old 16-core-derived ceiling toward 100.
const bigMemoryHost = roster.systemSafeNarutoConcurrency({ backend: 'codex-sdk', cores: 4, freeBytes: 48 * 1024 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 * 1024 });
assertGate(bigMemoryHost.cap >= 64, 'a 64 GB host must allow >= 64 parallel codex-sdk workers regardless of core count (network-bound, memory-budgeted)', { bigMemoryHost });

// 6) End-to-end run: 24 clones (> standard 20 -> ceiling lifted) all complete, while
//    release verification keeps live slots bounded so the gate stays hermetic under DAG load.
const proofClones = 24;
const proofConcurrency = 6;
const cli = path.join(root, 'dist', 'bin', 'sks.js');
const isolatedWorktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-shadow-wt-'));
const childEnv = { ...process.env, SKS_WORKTREE_ROOT: isolatedWorktreeRoot, SKS_DISABLE_GIT_WORKTREE: '1' };
assertGate(exists('dist/bin/sks.js'), 'dist/bin/sks.js missing (build first)');
const helpRun = spawnSync(process.execPath, [cli, 'naruto', '--help', '--json'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
const helpParsed = parseJson(helpRun.stdout);
assertGate(helpRun.status === 0 && helpParsed?.action === 'help', 'sks naruto --help must emit help instead of launching a run', { status: helpRun.status, stdout: tail(helpRun.stdout), stderr: tail(helpRun.stderr) });
const run = spawnSync(process.execPath, [
  cli, 'naruto', 'run', 'shadow clone swarm gate proof',
	  '--clones', String(proofClones),
	  '--backend', 'fake',
	  '--work-items', String(proofClones),
	  '--concurrency', String(proofConcurrency),
	  '--json',
	  '--no-open-zellij'
	], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 780000, maxBuffer: 8 * 1024 * 1024 });
assertGate(run.status === 0, 'sks naruto run must exit 0', { status: run.status, stderr: tail(run.stderr) });

const parsed = parseJson(run.stdout);
assertGate(parsed !== null, 'sks naruto run must emit JSON', { stdout: tail(run.stdout) });
assertGate(parsed.ok === true, 'naruto run must be ok', { ok: parsed.ok });
assertGate(parsed.mode === 'NARUTO' && parsed.jutsu === 'kage_bunshin_no_jutsu', 'naruto run must report NARUTO mode', { mode: parsed.mode, jutsu: parsed.jutsu });
assertGate(parsed.clones === proofClones, 'clone fan-out must use the requested count (> standard 20 ceiling)', { clones: parsed.clones });
assertGate(parsed.max_clones === 100, 'naruto run must advertise the 100 ceiling', { max_clones: parsed.max_clones });
assertGate(parsed.proof === 'passed', 'naruto run proof must pass', { proof: parsed.proof });
// Throttle invariant: active concurrency never exceeds the requested count nor the host cap.
assertGate(parsed.target_active_slots >= 1 && parsed.target_active_slots <= proofClones, 'active slots must be in [1, clones]', { target_active_slots: parsed.target_active_slots });
assertGate(parsed.target_active_slots <= fakeSafe.cap, 'active slots must be throttled to the system-safe cap', { target_active_slots: parsed.target_active_slots, cap: fakeSafe.cap });
assertGate(parsed.target_active_slots === proofConcurrency, 'release proof must keep Naruto live slots bounded while fan-out stays >20', { target_active_slots: parsed.target_active_slots, proofConcurrency });

// Task 9.1: fan-out (clones) and live concurrency (target_active_slots) are reported
// distinctly, and concurrency_capped truthfully reflects "N clones, running M at a time".
assertGate(typeof parsed.concurrency_capped === 'boolean', 'naruto run must report concurrency_capped', { concurrency_capped: parsed.concurrency_capped });
assertGate(parsed.concurrency_capped === (parsed.clones > parsed.target_active_slots), 'concurrency_capped must reflect clones > live slots', { clones: parsed.clones, target_active_slots: parsed.target_active_slots, concurrency_capped: parsed.concurrency_capped });
assertGate(parsed.system && Number(parsed.system.safe_concurrency) >= 1, 'naruto run must report system safe_concurrency (host-derived cap)', { system: parsed.system });
assertGate(parsed.work_graph?.write_allowed_count > 0 && parsed.work_graph?.mixed_work_kinds?.length > 1, 'naruto run must report a mixed work graph with write-capable items', { work_graph: parsed.work_graph });
assertGate(Number(parsed.work_graph?.parallel_write_wave_count || 0) > 0, 'naruto run must expose at least one parallel write-capable wave with non-overlapping leases', { work_graph: parsed.work_graph });
assertGate(parsed.role_distribution?.verifier_only === false, 'naruto run proof/status must distinguish active worker roles beyond verifier-only', { role_distribution: parsed.role_distribution });
assertGate(Number(parsed.role_distribution?.implementation_like_ratio || 0) >= 0.4, 'naruto run must include implementation-like role distribution', { role_distribution: parsed.role_distribution });

const commandGraphPath = path.join(root, '.sneakoscope', 'missions', parsed.mission_id, 'agents', 'naruto-work-graph.json');
const commandGraph = JSON.parse(fs.readFileSync(commandGraphPath, 'utf8'));
const writePaths = commandGraph.work_items.filter((row) => row.write_allowed).flatMap((row) => row.write_paths);
assertGate(new Set(writePaths).size > 1, 'naruto command default patch-envelope leases must be per work item, not one shared write path', { sample: writePaths.slice(0, 8), unique: new Set(writePaths).size });
assertGate(commandGraph.active_waves.some((wave) => wave.write_paths.length > 1), 'naruto command graph must contain a parallel write wave when route-local patch envelopes do not overlap', { waves: commandGraph.active_waves.slice(0, 3) });

const state = parsed.run?.scheduler?.state || parsed.run?.scheduler || {};
assertGate(Number(state.completed_count) === Number(parsed.work_graph?.total_work_items || 0) && Number(state.completed_count) >= proofClones, 'all clone work items must complete despite throttling', { completed_count: state.completed_count, total_work_items: parsed.work_graph?.total_work_items, proofClones });

const explicitConcurrency = spawnSync(process.execPath, [cli, 'naruto', 'run', 'explicit concurrency', '--clones', '6', '--backend', 'fake', '--work-items', '6', '--concurrency', '6', '--json', '--no-open-zellij'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
const explicitParsed = parseJson(explicitConcurrency.stdout);
assertGate(explicitConcurrency.status === 0 && explicitParsed?.target_active_slots === 6, 'explicit --concurrency must let Naruto use the requested parallel slot count', { status: explicitConcurrency.status, target_active_slots: explicitParsed?.target_active_slots });

// 7) A small request is NOT throttled below what was asked (cap only ever reduces, never inflates).
const small = spawnSync(process.execPath, [cli, 'naruto', 'run', 'tiny', '--clones', '2', '--backend', 'fake', '--work-items', '2', '--json', '--no-open-zellij'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
const smallParsed = parseJson(small.stdout);
assertGate(small.status === 0 && smallParsed?.target_active_slots === 2, 'a 2-clone run must run 2 concurrently (no over-throttle)', { status: small.status, target_active_slots: smallParsed?.target_active_slots });

emitGate('naruto:shadow-clone-swarm', {
  max_naruto_agent_count: schema.MAX_NARUTO_AGENT_COUNT,
  standard_ceiling: schema.MAX_AGENT_COUNT,
  default_clamp: defaultSlots,
  naruto_slots_at_100: narutoSlots,
	  proof_clones: proofClones,
	  proof_concurrency: proofConcurrency,
  target_active_slots: parsed.target_active_slots,
  fake_safe_cap: fakeSafe.cap,
  heavy_safe_cap: heavySafe.cap,
  low_free_capable_cap: lowFreeButCapable.cap,
  cores: heavySafe.cores,
  completed_count: state.completed_count,
  mission_id: parsed.mission_id,
  isolated_worktree_root: isolatedWorktreeRoot
});

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function tail(value, limit = 2000) {
  const text = String(value || '');
  return text.length <= limit ? text : text.slice(-limit);
}
