import { evaluateDecisionPolicy } from './policy.js'
import { validateDecisionResult } from './schema.js'
import type {
  DecisionInput,
  DecisionMode,
  DecisionPolicyResult,
  LocalDecisionProvider
} from './types.js'

export const DECISION_MODES: readonly DecisionMode[] = Object.freeze(['off', 'shadow', 'advisory'])

export function isDecisionMode(value: unknown): value is DecisionMode {
  return typeof value === 'string' && DECISION_MODES.includes(value as DecisionMode)
}

function keep(reason: string): DecisionPolicyResult {
  return { action: 'keep_baseline', reason, advice: {} }
}

/**
 * Advisory-only await wrapper. `off` returns immediately without touching the
 * provider. `shadow` also returns baseline here: its real route hook uses a
 * best-effort submit that never holds the caller (see integration.ts), so a
 * caller that awaits this in shadow mode is a measurement tool, not the route.
 * Exactly one provider call is made in advisory mode; an unavailable answer is
 * final and never schedules a replacement call anywhere else.
 */
export async function adviseDecision(
  input: DecisionInput,
  mode: DecisionMode,
  provider: LocalDecisionProvider,
  signal: AbortSignal
): Promise<DecisionPolicyResult> {
  if (mode === 'off') return keep('disabled')
  if (mode !== 'advisory') return keep('shadow_mode_no_advice')
  if (signal.aborted) return keep('cancelled')
  let raw: unknown
  try {
    raw = await provider.decide(input, signal)
  } catch (error: unknown) {
    return keep(`provider_error:${error instanceof Error ? error.message : String(error)}`)
  }
  let result
  try {
    result = validateDecisionResult(input, raw)
  } catch (error: unknown) {
    return keep(`invalid_response:${error instanceof Error ? error.message : String(error)}`)
  }
  return evaluateDecisionPolicy(input, result)
}
