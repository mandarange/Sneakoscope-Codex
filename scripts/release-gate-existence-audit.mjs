#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, packageScripts, root } from './sks-1-18-gate-lib.mjs';

const scripts = packageScripts();
const releaseDagSource = fs.readFileSync(path.join(root, 'src', 'scripts', 'release-parallel-check.ts'), 'utf8');
const dagTasks = new Set([...releaseDagSource.matchAll(/task\('([^']+)'/g)].map((match) => match[1]));
const removedRuntime = `${'tm'}ux`;
const removedLane = `${'warp'}-right-${'lane'}`;
const removedRuntimeGateRe = new RegExp(`^${removedRuntime}:|^agent:${removedRuntime}-|real-${removedRuntime}|${removedLane}`, 'i');
const required = [
  'runtime:no-tmux',
  'terminal:keyboard-enhancement-safety',
  'terminal:tui-output-stability',
  'zellij:layout-valid',
  'zellij:pane-proof',
  'zellij:screen-proof',
  'zellij:lane-renderer',
  'mad-sks:zellij-launch',
  'agent:zellij-runtime',
  'codex:0.135-compat',
  'doctor:codex-doctor-parity',
  'codex:permission-profiles',
  'codex:legacy-profile-consumers-removed',
  'codex:resume-cwd-truth',
  'mcp:tool-naming-parity',
  'responses:retry-policy-centralized',
  'codex:0.134-compat',
  'codex:0.134-official-compat',
  'codex:profile-primary',
  'codex:managed-proxy-env',
  'strategy:adhd-orchestrating-gate',
  'strategy:parallel-modification-plan',
  'strategy:file-ownership-plan',
  'strategy:verification-rollback-dag',
  'appshots:capability',
  'appshots:operator-policy',
  'appshots:evidence',
  'appshots:source-intelligence',
  'appshots:triwiki-voxel',
  'appshots:privacy-safety',
  'mcp:0.134-modernization',
  'mcp:readonly-concurrency',
  'hooks:0.134-context-parity',
  'source-intelligence:codex-history-search',
  'agent:parallel-write-kernel',
  'agent:parallel-write-blackbox',
  'team:parallel-write-blackbox',
  'dfix:parallel-write-blackbox',
  'agent:patch-proof',
  'agent:patch-rollback',
  'agent:patch-swarm-runtime-truth',
  'agent:patch-transaction-journal',
  'agent:patch-conflict-rebase',
  'agent:strategy-to-patch-strict',
  'agent:rollback-command',
  'agent:real-codex-patch-envelope-smoke',
  'agent:native-cli-session-swarm',
  'agent:native-cli-session-swarm-10',
  'agent:native-cli-session-swarm-20',
  'agent:no-subagent-scaling',
  'agent:native-cli-session-proof',
  'agent:fast-mode-default',
  'agent:fast-mode-worker-propagation',
  'codex:fast-mode-profile-propagation',
  'mad-sks:fast-mode-propagation',
  'release:runtime-truth-matrix'
];

for (const name of required) {
  assertGate(Boolean(scripts[name]), `missing release gate script: ${name}`, { required });
  assertGate(dagTasks.has(name), `critical release gate missing from release DAG: ${name}`, { name, dag_tasks: [...dagTasks].sort() });
  const match = String(scripts[name]).match(/node\s+(\.\/scripts\/[^ ]+\.mjs)/);
  if (match) assertGate(fs.existsSync(path.join(root, match[1])), `script target missing for ${name}`, { command: scripts[name] });
}

for (const name of dagTasks) {
  if (name === 'build') continue;
  assertGate(Boolean(scripts[name]), `release DAG task has no package script: ${name}`, { name });
  assertGate(!removedRuntimeGateRe.test(name), `tmux gate remains in release DAG: ${name}`, { name });
}

for (const name of Object.keys(scripts)) {
  assertGate(!removedRuntimeGateRe.test(name), `tmux package gate remains: ${name}`, { name });
}

emitGate('release:gate-existence-audit', { gates: required.length, dag_tasks: dagTasks.size });
