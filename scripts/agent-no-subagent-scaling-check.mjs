#!/usr/bin/env node
import { emitGate } from './sks-1-18-gate-lib.mjs';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.mjs';

const report = runNativeCliSwarmCheck({ agents: 5, workItems: 5, reportName: 'agent-no-subagent-scaling.json' });
emitGate('agent:no-subagent-scaling', { native_worker_process_count: report.no_subagent_scaling_policy.native_worker_process_count });
