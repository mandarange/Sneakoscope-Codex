#!/usr/bin/env node
import { runRealCodexParallelGate } from './lib/real-codex-parallel-gate.mjs';
await runRealCodexParallelGate({ workers: 10, gate: 'agent:real-codex-parallel-workers-10' });
