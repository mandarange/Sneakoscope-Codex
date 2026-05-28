#!/usr/bin/env node
import { emitGate } from './sks-1-18-gate-lib.mjs';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.mjs';

const report = runNativeCliSwarmCheck({ agents: 20, workItems: 20, reportName: 'agent-native-cli-session-swarm-20.json' });
emitGate('agent:native-cli-session-swarm-20', { agents: report.agents, max_observed: report.native_cli_session_proof.max_observed_worker_process_count });
