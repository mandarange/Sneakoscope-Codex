#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const cfg = await importDist('core/agents/ollama-worker-config.js');
const warmup = await importDist('core/local-llm/local-llm-warmup.js');
const state = warmup.buildLocalLlmWarmupState(cfg.normalizeLocalModelConfig({ enabled: true, status: 'enabled_unverified' }), { ok: true, ttlMs: 1000 });
assertGate(state.explicit_only === true, 'local warmup must be explicit only');
assertGate(state.postinstall_allowed === false, 'postinstall must not run local warmup');
assertGate(state.release_check_real_warmup_allowed === false, 'release:check must not run real warmup');
emitGate('local-llm:warmup', { explicit_only: state.explicit_only, expires_at: state.expires_at });
