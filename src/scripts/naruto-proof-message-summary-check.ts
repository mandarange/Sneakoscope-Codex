#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const naruto = readText('src/core/commands/naruto-command.ts')
const summary = readText('src/core/agents/runtime-proof-summary.ts')
assertGate(naruto.includes('--messages 20') && naruto.includes('maxMessages: parsed.messages'), 'naruto proof CLI must accept --messages and forward limit')
assertGate(summary.includes('Recent worker messages:') && summary.includes('[done]') && summary.includes('[fail]'), 'runtime proof summary renderer must show worker message summary')
emitGate('naruto:proof-message-summary')
