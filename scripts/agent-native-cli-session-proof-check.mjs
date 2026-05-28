#!/usr/bin/env node
import { emitGate } from './sks-1-18-gate-lib.mjs';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.mjs';

const report = runNativeCliSwarmCheck({ agents: 5, workItems: 5, reportName: 'agent-native-cli-session-proof.json' });
emitGate('agent:native-cli-session-proof', { spawned: report.native_cli_session_proof.spawned_worker_process_count });
