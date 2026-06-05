#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './lib/codex-sdk-gate-lib.js';

const cfg = await importDist('core/agents/ollama-worker-config.js');
const smokeMod = await importDist('core/local-llm/local-llm-smoke.js');
const config = cfg.normalizeLocalModelConfig({ enabled: true, status: 'enabled_unverified' });

if (process.env.SKS_REQUIRE_LOCAL_LLM !== '1' && !process.argv.includes('--require-real')) {
  const skipped = cfg.applyLocalLlmSmokeResult(config, { ok: false, skipped: true, status: 'enabled_unverified', reason: 'release_check_no_real_smoke', schema_valid: false });
  assertGate(skipped.status === 'enabled_unverified', '--skip-smoke or hermetic mode must not verify local LLM');
  emitGate('local-llm:smoke', { status: 'hermetic_skip', config_status: skipped.status });
} else {
  const reportPath = `${root}/.sneakoscope/reports/local-llm-smoke-real.json`;
  const realConfig = await cfg.readLocalModelConfig();
  const first = await smokeMod.runLocalLlmGenerationSmoke(realConfig, { reportPath, timeoutMs: 60_000 });
  const shouldRetry = first.ok !== true && String(first.blockers || []).match(/aborted|timeout|local_llm_generate_failed/i);
  const smoke = shouldRetry
    ? await smokeMod.runLocalLlmGenerationSmoke(realConfig, { reportPath, timeoutMs: 90_000 })
    : first;
  assertGate(smoke.ok === true && smoke.schema_valid === true, 'real local LLM smoke failed', { smoke, retry_count: shouldRetry ? 1 : 0, first_failure_blockers: first.blockers || [] });
  emitGate('local-llm:smoke', { status: 'real_verified', latency_ms: smoke.latency_ms, tokens_per_second: smoke.tokens_per_second, retry_count: shouldRetry ? 1 : 0 });
}
