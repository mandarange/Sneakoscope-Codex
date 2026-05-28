#!/usr/bin/env node
import { runRealCodexParallelGate } from './lib/real-codex-parallel-gate.mjs';
await runRealCodexParallelGate({ workers: 5, gate: 'agent:real-codex-parallel-workers' });
