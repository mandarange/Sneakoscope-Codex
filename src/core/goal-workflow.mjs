import path from 'node:path';
import { appendJsonl, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';

export const GOAL_WORKFLOW_ARTIFACT = 'goal-workflow.json';
export const GOAL_BRIDGE_ARTIFACT = 'goal-bridge.md';

export function nativeGoalCommand(action = 'create', prompt = '') {
  const cleanAction = String(action || 'create').toLowerCase();
  const cleanPrompt = String(prompt || '').trim();
  if (cleanAction === 'pause') return '/goal pause';
  if (cleanAction === 'resume') return '/goal resume';
  if (cleanAction === 'clear') return '/goal clear';
  return cleanPrompt ? `/goal create ${cleanPrompt}` : '/goal create';
}

export async function writeGoalWorkflow(dir, mission, opts = {}) {
  const action = String(opts.action || 'create').toLowerCase();
  const prompt = String(opts.prompt || mission?.prompt || '').trim();
  const workflow = {
    schema_version: 1,
    mission_id: mission.id,
    route: 'Goal',
    action,
    status: action === 'clear' ? 'cleared' : action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'created',
    created_at: nowIso(),
    prompt,
    native_goal: {
      slash_command: nativeGoalCommand(action, prompt),
      workflow_kind: 'persisted /goal',
      controls: ['create', 'pause', 'resume', 'clear'],
      runtime_continuation: true,
      app_server_api_backed: true,
      model_tools_available: true
    },
    pipeline_contract: {
      ralph_removed: true,
      ambiguity_gate: 'use normal SKS ambiguity gates when required by the selected execution route; Goal itself delegates persistence/continuation to Codex /goal',
      evidence: ['goal-workflow.json', 'goal-bridge.md']
    },
    phase: action === 'clear' ? 'reporting' : 'intake',
    user_outcome: prompt,
    work_order_ledger_id: null,
    checkpoints: [
      {
        timestamp: nowIso(),
        phase: 'intake',
        summary: 'Goal workflow bridge created.',
        completed_checkboxes: ['goal workflow artifact written'],
        open_checkboxes: ['continue original SKS route lifecycle when implementation is needed'],
        blockers: [],
        evidence: [GOAL_WORKFLOW_ARTIFACT, GOAL_BRIDGE_ARTIFACT]
      }
    ],
    resume_context: {
      stable_requirements: prompt ? [prompt] : [],
      current_files: [GOAL_WORKFLOW_ARTIFACT, GOAL_BRIDGE_ARTIFACT],
      decisions: ['Codex native /goal is the persisted continuation surface'],
      known_mistakes_to_avoid: ['do not clear noisy context without writing a structured handoff first'],
      active_skills: ['goal'],
      active_agents: []
    },
    clear_policy: {
      preserve_work_order: true,
      preserve_decisions: true,
      preserve_evidence_links: true,
      discard_noisy_logs: true
    }
  };
  await writeJsonAtomic(path.join(dir, GOAL_WORKFLOW_ARTIFACT), workflow);
  await writeTextAtomic(path.join(dir, GOAL_BRIDGE_ARTIFACT), goalBridgeMarkdown(workflow));
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: `goal.${action}`, native_goal_command: workflow.native_goal.slash_command });
  return workflow;
}

export async function updateGoalWorkflow(dir, action) {
  const current = await readJson(path.join(dir, GOAL_WORKFLOW_ARTIFACT), {});
  const next = {
    ...current,
    action,
    status: action === 'clear' ? 'cleared' : action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : current.status || 'created',
    updated_at: nowIso(),
    phase: action === 'pause' ? 'reporting' : action === 'resume' ? 'implementation' : action === 'clear' ? 'retro' : current.phase || 'intake',
    native_goal: {
      ...(current.native_goal || {}),
      slash_command: nativeGoalCommand(action, current.prompt || '')
    },
    checkpoints: [
      ...(Array.isArray(current.checkpoints) ? current.checkpoints : []),
      {
        timestamp: nowIso(),
        phase: action,
        summary: `Goal ${action} requested through SKS bridge.`,
        completed_checkboxes: [`goal ${action} artifact update`],
        open_checkboxes: action === 'clear' ? ['handoff preserved before noisy context clear'] : [],
        blockers: [],
        evidence: [GOAL_WORKFLOW_ARTIFACT, GOAL_BRIDGE_ARTIFACT]
      }
    ]
  };
  await writeJsonAtomic(path.join(dir, GOAL_WORKFLOW_ARTIFACT), next);
  await writeTextAtomic(path.join(dir, GOAL_BRIDGE_ARTIFACT), goalBridgeMarkdown(next));
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: `goal.${action}`, native_goal_command: next.native_goal.slash_command });
  return next;
}

function goalBridgeMarkdown(workflow) {
  return `# SKS Goal Bridge

Mission: ${workflow.mission_id}
Status: ${workflow.status}
Task: ${workflow.prompt || '(no prompt)'}

## Native Codex Goal Control

Run this in the Codex TUI when interactive native goal control is available:

\`\`\`text
${workflow.native_goal.slash_command}
\`\`\`

## SKS Pipeline Contract

- Ralph route is removed from the user-facing SKS surface.
- This mission uses Codex native persisted \`/goal\` workflow semantics for continuation.
- SKS still records route evidence in \`${GOAL_WORKFLOW_ARTIFACT}\` and this bridge file.
- If implementation work is needed, continue through the normal SKS route gates for that work and report verification evidence honestly.
`;
}
