export const NATIVE_GOAL_REQUEST_SCHEMA = 'sks.codex-native-goal-request.v1';
export const NATIVE_GOAL_MAX_CHARS = 4_000;

export type NativeGoalAction = 'create' | 'edit' | 'pause' | 'resume' | 'clear' | 'status';

export interface NativeGoalRequest {
  schema: typeof NATIVE_GOAL_REQUEST_SCHEMA;
  ok: true;
  action: NativeGoalAction;
  native_only: true;
  sks_state_written: false;
  objective: string | null;
  slash_command: string;
  completion_contract: {
    outcome: true;
    scope: true;
    constraints: true;
    verification: true;
    done_when: true;
    stop_conditions: true;
    non_goals: true;
  } | null;
}

export function buildDetailedNativeGoalObjective(prompt: unknown): string {
  const outcome = normalizePrompt(prompt);
  if (!outcome) throw new Error('Missing goal task prompt.');
  const objective = [
    'Outcome:',
    outcome,
    '',
    'Scope:',
    '- Inspect the current authoritative state before changing anything.',
    '- Do only the work directly required to achieve the outcome.',
    '- Preserve unrelated user changes and existing behavior outside this scope.',
    '',
    'Constraints:',
    '- Use Codex native Goal as the only persisted goal owner; do not create SKS goal missions, bridge artifacts, compatibility loops, or fallback goal state.',
    '- Do not add unrelated refactors, speculative features, or substitute implementations.',
    '- Do not perform irreversible or external actions unless the user explicitly authorized them.',
    '',
    'Verification:',
    '- Run checks that cover every changed behavior and inspect their actual results.',
    '- Confirm the final diff and external state match the requested outcome and constraints.',
    '',
    'Done when:',
    '- The requested outcome is implemented completely.',
    '- All relevant verification passes and no required work remains.',
    '- Any explicitly excluded action remains unperformed.',
    '',
    'Stop conditions:',
    '- Stop and request direction only when a hard blocker requires new user authority, missing information that materially changes the result, or an external-state change.',
    '- Do not continue merely to improve, generalize, or polish after every Done when condition is satisfied.',
    '',
    'Non-goals:',
    '- No unrelated cleanup, architecture expansion, new framework, or open-ended optimization.',
    '- No success redefinition around a smaller or easier subset.'
  ].join('\n');
  if (objective.length > NATIVE_GOAL_MAX_CHARS) {
    throw new Error(`Detailed native goal exceeds Codex's ${NATIVE_GOAL_MAX_CHARS}-character limit.`);
  }
  return objective;
}

export function nativeGoalCommand(action: NativeGoalAction = 'create', prompt: unknown = ''): string {
  if (action === 'pause') return '/goal pause';
  if (action === 'resume') return '/goal resume';
  if (action === 'clear') return '/goal clear';
  if (action === 'status') return '/goal';
  const objective = buildDetailedNativeGoalObjective(prompt);
  return action === 'edit' ? `/goal edit ${objective}` : `/goal ${objective}`;
}

export function buildNativeGoalRequest(action: NativeGoalAction = 'create', prompt: unknown = ''): NativeGoalRequest {
  const objective = action === 'create' || action === 'edit'
    ? buildDetailedNativeGoalObjective(prompt)
    : null;
  return {
    schema: NATIVE_GOAL_REQUEST_SCHEMA,
    ok: true,
    action,
    native_only: true,
    sks_state_written: false,
    objective,
    slash_command: nativeGoalCommand(action, prompt),
    completion_contract: objective ? {
      outcome: true,
      scope: true,
      constraints: true,
      verification: true,
      done_when: true,
      stop_conditions: true,
      non_goals: true
    } : null
  };
}

function normalizePrompt(value: unknown): string {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}
