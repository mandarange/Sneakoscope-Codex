#!/usr/bin/env node
// @ts-nocheck
import { emitGate } from './sks-1-18-gate-lib.js';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.js';

const report = runNativeCliSwarmCheck({
  agents: 1,
  workItems: 1,
  backend: 'codex-sdk',
  reportName: 'codex-fast-mode-profile-propagation.json',
  extraArgs: ['--fast'],
  expectedFastMode: true
});
emitGate('codex:fast-mode-profile-propagation', { backend: report.backend, service_tier: report.fast_mode_propagation.service_tier });
