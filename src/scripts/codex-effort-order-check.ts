#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
const mod = await importDist('core/codex-control/codex-model-capabilities.js')
const cap = mod.codexModelEffortCapability()
assertGate(JSON.stringify(cap.advertised_efforts) === JSON.stringify(['minimal', 'low', 'medium', 'high', 'xhigh']), 'fallback model effort order must be minimal < low < medium < high < xhigh', cap)
assertGate(mod.nextAdvertisedEffort('medium', cap) === 'high' && mod.modelEffortAtLeast('recovery', cap) === 'high', 'effort escalation mapping must respect advertised order')
emitGate('codex:effort-order', { order: cap.advertised_efforts })
