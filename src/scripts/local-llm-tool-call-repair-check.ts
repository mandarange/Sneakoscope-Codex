#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const mod = await importDist('core/local-llm/local-llm-json-repair.js');
const repaired = mod.parseOrRepairLocalLlmJson('Here is JSON: {"status":"ok","summary":"done"} thanks');
const failed = mod.parseOrRepairLocalLlmJson('not json at all');
assertGate(repaired.ok === true && repaired.repaired === true && repaired.attempts === 1, 'bounded JSON repair should recover one object');
assertGate(failed.ok === false && failed.attempts === 1, 'invalid local JSON must fail after one repair attempt');
emitGate('local-llm:tool-call-repair', { repaired: repaired.ok, failed: failed.ok });
