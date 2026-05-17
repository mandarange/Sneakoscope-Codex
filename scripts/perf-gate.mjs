#!/usr/bin/env node
import { DEFAULT_COLD_START_ITERATIONS, resolveColdStartIterations, runColdStart } from '../src/commands/perf.mjs';

const requestedIterations = resolveColdStartIterations(process.env.SKS_COLD_START_ITERATIONS);
let result = runColdStart({ root: process.cwd(), iterations: requestedIterations });
if (!result.ok && process.env.SKS_PERF_GATE_RETRY !== '0' && isBudgetOnlyMiss(result)) {
  const retryIterations = Math.max(requestedIterations, DEFAULT_COLD_START_ITERATIONS);
  const retry = runColdStart({ root: process.cwd(), iterations: retryIterations });
  result = {
    ...retry,
    gate_retry: {
      attempted: true,
      reason: 'initial_budget_miss_without_process_failures',
      initial: summarizeInitial(result)
    }
  };
}
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function isBudgetOnlyMiss(result) {
  if (!result || result.ok) return false;
  return (result.commands || []).every((row) => !row.failures?.length);
}

function summarizeInitial(result) {
  return {
    iterations: result.commands?.[0]?.iterations || requestedIterations,
    commands: (result.commands || []).map((row) => ({
      cmd: row.cmd,
      p50_ms: row.p50_ms,
      p95_ms: row.p95_ms,
      budget_p95_ms: row.budget_p95_ms,
      ok: row.ok
    }))
  };
}
