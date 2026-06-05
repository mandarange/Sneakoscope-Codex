#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const mod = await importDist('core/local-llm/local-llm-schema-enforcer.js');
const schema = { type: 'object', required: ['status'], properties: { status: { type: 'string' } }, additionalProperties: false };
const good = mod.enforceLocalLlmJsonSchema('{"status":"ok"}', schema);
const bad = mod.enforceLocalLlmJsonSchema('plain words', schema);
assertGate(good.ok === true && good.schema_valid === true, 'valid local JSON should pass');
assertGate(bad.ok === false, 'natural language local output must not pass');
emitGate('local-llm:structured-output', { good: good.ok, bad: bad.ok });
