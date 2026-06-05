#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const scheduler = await importDist('core/local-llm/local-llm-scheduler.js');
const plan = scheduler.planLocalLlmSchedule({ workItems: Array.from({ length: 20 }, (_, i) => ({ id: i })), maxParallelRequests: 4 });
assertGate(plan.ok === true, 'local scheduler must not exceed max parallel requests');
assertGate(plan.active_requests <= plan.max_parallel_requests, 'active requests exceeded max_parallel_requests');
assertGate(plan.queued_count === 16, '20 worker fixture should queue work beyond max parallel requests');
emitGate('local-llm:throughput', { active_requests: plan.active_requests, queued_count: plan.queued_count, backpressure: plan.backpressure });
