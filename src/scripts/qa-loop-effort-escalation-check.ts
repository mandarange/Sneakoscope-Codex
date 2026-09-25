#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './gate-lib.js'
const mod = await importDist('core/qa-loop/qa-loop-budget-policy.js')
const one = mod.selectQaLoopEscalatedEffort({ failureCount: 1, currentEffort: 'medium' })
const two = mod.selectQaLoopEscalatedEffort({ failureCount: 2, currentEffort: 'medium' })
assertGate(one.next_effort === 'medium' && two.next_effort === 'high' && two.escalated === true, 'QA-LOOP effort escalation must raise effort after repeated failures', { one, two })
// Jev mode: a confident answer replaces the failure count, but only after a failure.
const jevEscalate = mod.selectQaLoopEscalatedEffort({ failureCount: 1, currentEffort: 'medium', jevChoice: 'escalate' })
const jevHold = mod.selectQaLoopEscalatedEffort({ failureCount: 2, currentEffort: 'medium', jevChoice: 'hold' })
const jevIdle = mod.selectQaLoopEscalatedEffort({ failureCount: 0, currentEffort: 'medium', jevChoice: 'escalate' })
assertGate(jevEscalate.next_effort === 'high' && jevEscalate.decided_by === 'jev' && jevHold.escalated === false && jevHold.decided_by === 'jev' && jevIdle.escalated === false && jevIdle.decided_by === 'failure_count', 'Jev decides QA-LOOP escalation only after a failure it answered', { jevEscalate, jevHold, jevIdle })
emitGate('qa-loop:effort-escalation')
