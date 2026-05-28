#!/usr/bin/env node
import { emitGate } from './sks-1-18-gate-lib.mjs';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.mjs';

const report = runNativeCliSwarmCheck({ agents: 3, workItems: 3, reportName: 'agent-fast-mode-worker-propagation.json' });
emitGate('agent:fast-mode-worker-propagation', { worker_process_report_count: report.fast_mode_propagation.worker_process_report_count });
