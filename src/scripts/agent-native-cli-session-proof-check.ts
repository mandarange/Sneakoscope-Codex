#!/usr/bin/env node
// @ts-nocheck
import { emitGate } from './sks-1-18-gate-lib.js';
import { runNativeCliSwarmCheck } from './lib/native-cli-session-swarm-check-lib.js';

const report = runNativeCliSwarmCheck({ agents: 5, workItems: 5, reportName: 'agent-native-cli-session-proof.json' });
emitGate('agent:native-cli-session-proof', { spawned: report.native_cli_session_proof.spawned_worker_process_count });
