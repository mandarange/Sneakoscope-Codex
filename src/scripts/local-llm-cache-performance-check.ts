#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const cache = await importDist('core/local-llm/local-llm-prompt-cache.js');
const a = cache.buildLocalLlmPromptCacheRecord({ routeSystemEnvelopeHash: 'a', localWorkerPolicyHash: 'b', coreSkillSnapshotHash: 'c', triwikiContextPackHash: 'd', repoSummaryHash: 'e', capabilityCardHash: 'f' });
const b = cache.buildLocalLlmPromptCacheRecord({ routeSystemEnvelopeHash: 'a', localWorkerPolicyHash: 'b', coreSkillSnapshotHash: 'c', triwikiContextPackHash: 'd2', repoSummaryHash: 'e', capabilityCardHash: 'f' });
assertGate(a.cacheable === true, 'prompt cache record should be cacheable when hashes exist');
assertGate(a.cache_key !== b.cache_key, 'source hash change must invalidate cache');
emitGate('local-llm:cache-performance', { cacheable: a.cacheable, invalidates_on_hash_change: true });
