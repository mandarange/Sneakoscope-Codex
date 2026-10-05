/**
 * The one predicate for "this route is paused at its ambiguity gate": the
 * PreToolUse lock, the UserPromptSubmit resume, the Stop gate and
 * `sks pipeline answer` all ask this same question.
 */
export function isClarificationAwaiting(state: any = {}): boolean {
  const phase = String(state?.phase || '');
  const gateAwaiting = phase.includes('CLARIFICATION_AWAITING_ANSWERS') || String(state?.stop_gate || '') === 'clarification-gate';
  if (!gateAwaiting || !state?.mission_id) return false;
  if (state.ambiguity_gate_required !== true || state.ambiguity_gate_passed === true) return false;
  return Boolean(state.clarification_required || state.implementation_allowed === false);
}
