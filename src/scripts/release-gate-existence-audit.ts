#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, packageScripts, root } from './sks-1-18-gate-lib.js';

const scripts = packageScripts();
const releaseManifestPath = path.join(root, 'release-gates.v2.json');
const releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
const releaseGates = Array.isArray(releaseManifest.gates)
  ? releaseManifest.gates.filter((gate) => Array.isArray(gate.preset) && gate.preset.includes('release'))
  : [];
const dagTasks = new Set(releaseGates.map((gate) => gate.id));
const manifestTasks = new Set((Array.isArray(releaseManifest.gates) ? releaseManifest.gates : []).map((gate) => gate.id));
const removedRuntime = `${'tm'}ux`;
const removedLane = `${'warp'}-right-${'lane'}`;
const removedRuntimeGateRe = new RegExp(`^${removedRuntime}:|^agent:${removedRuntime}-|real-${removedRuntime}|${removedLane}`, 'i');
const required = [
  'runtime:no-tmux',
  'terminal:keyboard-enhancement-safety',
  'terminal:tui-output-stability',
  'zellij:layout-valid',
  'zellij:initial-main-only-blackbox',
  'zellij:right-column-geometry-proof',
  'zellij:dynamic-pane-lifecycle',
  'zellij:lane-renderer',
  'zellij:doctor-readiness',
  'zellij:spawn-on-demand-layout',
  'zellij:worker-pane-manager',
  'zellij:worker-pane-manager-single-owner',
  'zellij:slot-only-ui',
  'zellij:compact-slot-renderer',
  'zellij:right-column-headless-overflow',
  'safety:mutation-callsite-coverage',
  'mad-sks:zellij-launch',
  'mad-sks:zellij-default-pane-worker',
  'agent:zellij-runtime',
  'agent:slot-pane-binding-proof',
  'agent:role-config-repair',
  'agent:worker-pane-communication-contract',
  'git:worktree-integration-primary',
  'git:worktree-integration-primary-runtime',
  'codex:0.136-compat',
  'codex:0.135-compat',
  'doctor:codex-doctor-parity',
  'codex:permission-profiles',
  'codex:legacy-profile-consumers-removed',
  'codex:resume-cwd-truth',
  'mcp:tool-naming-parity',
  'responses:retry-policy-centralized',
  'codex-app:fast-ui-preservation',
  'codex-app:ui-clobber-guard',
  'doctor:fixes-codex-app-fast-ui',
  'mad-sks:app-ui-no-mutation',
  'provider:badge-context',
  'provider:context-config-toml',
  'codex-app:provider-badge',
  'runtime:no-mjs-scripts',
  'runtime:ts-python-boundary',
  'agent:patch-swarm-runtime-truth',
  'agent:patch-transaction-journal',
  'agent:patch-conflict-rebase',
  'agent:strategy-to-patch-strict',
  'agent:rollback-command',
  'agent:native-cli-session-swarm',
  'agent:native-cli-session-swarm-10',
  'agent:native-cli-session-swarm-20',
  'agent:no-subagent-scaling',
  'agent:native-cli-session-proof',
  'agent:fast-mode-default',
  'agent:fast-mode-worker-propagation',
  'codex:fast-mode-profile-propagation',
  'mad-sks:fast-mode-propagation',
  'naruto:active-pool',
  'naruto:real-active-pool',
  'naruto:real-active-pool-runtime',
  'naruto:extreme-parallelism',
  'naruto:extreme-parallelism-real',
  'naruto:zellij-dynamic-right-column',
  'agent:wiki-context-proof',
  'shared-memory:check',
  'wrongness:check',
  'wrongness:fixtures',
  'trust:check',
  'git-collaboration:e2e'
];

assertGate(releaseManifest.schema === 'sks.release-gates.v2', 'release gate manifest schema mismatch', { schema: releaseManifest.schema });
const releaseCheck = String(scripts['release:check'] || '');
const releaseCheckTarget = releaseCheck.includes('release:check:affected')
  ? String(scripts['release:check:affected'] || '')
  : releaseCheck;
assertGate(releaseCheckTarget.includes('release-gate-dag-runner') && /--preset\s+(?:release|affected)/.test(releaseCheckTarget), 'release:check must use the v2 DAG release/affected preset', { release_check: scripts['release:check'], resolved_release_check: releaseCheckTarget });
assertGate(releaseGates.length > 0, 'release v2 manifest must include release preset gates', { gate_count: releaseGates.length });

for (const name of required) {
  assertGate(Boolean(scripts[name]), `missing release gate script: ${name}`, { required });
  const inReleaseManifest = manifestTasks.has(name);
  assertGate(inReleaseManifest, `critical gate missing from release v2 manifest: ${name}`, { name, release_gates: [...dagTasks].sort(), manifest_gates: [...manifestTasks].sort() });
  const match = String(scripts[name]).match(/node\s+(\.\/dist\/scripts\/[^ ]+\.js)/);
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

emitGate('release:gate-existence-audit', { gates: required.length, dag_tasks: dagTasks.size, manifest: 'release-gates.v2.json' });
