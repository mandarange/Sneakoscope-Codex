#!/usr/bin/env node
import { emitGate } from './sks-1-18-gate-lib.mjs';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.mjs';

const report = runNativeCliSwarmCheck({
  agents: 1,
  workItems: 1,
  backend: 'codex-exec',
  reportName: 'codex-fast-mode-profile-propagation.json'
});
emitGate('codex:fast-mode-profile-propagation', { backend: report.backend, service_tier: report.fast_mode_propagation.service_tier });
