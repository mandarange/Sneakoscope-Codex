#!/usr/bin/env node
// @ts-nocheck
import { runRealCodexParallelGate } from './lib/real-codex-parallel-gate.js';
await runRealCodexParallelGate({ workers: 20, gate: 'agent:real-codex-parallel-workers-20' });
