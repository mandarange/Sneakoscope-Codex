#!/usr/bin/env node
import { runRealCodexParallelGate } from './lib/real-codex-parallel-gate.mjs';
await runRealCodexParallelGate({ workers: 20, gate: 'agent:real-codex-parallel-workers-20' });
