import {
  DEFAULT_SUBAGENT_MODEL,
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL,
  SUBAGENT_EFFORT,
  THINKING_SUBAGENT_MODEL
} from './model-policy.js'

export const NARUTO_HELP_SCHEMA = 'sks.naruto-subagent-workflow.v1'

export function buildNarutoHelpResult() {
  return {
    schema: NARUTO_HELP_SCHEMA,
    ok: true,
    action: 'help',
    workflow: 'official_codex_subagent',
    description: '$Naruto is the SKS alias for the Codex official subagent workflow.',
    usage: [
      'sks naruto run "<task>" [--agents N] [--max-threads N] [--json]',
      'sks naruto status [latest|M-...] [--json]',
      'sks naruto subagents [latest|M-...] [--json]',
      'sks naruto proof [latest|M-...] [--json]'
    ],
    commands: ['help', 'status', 'subagents', 'proof', 'run'],
    deprecated_aliases: {
      '--clones N': '--agents N',
      workers: 'subagents'
    },
    parent: { model: NARUTO_PARENT_MODEL, model_reasoning_effort: NARUTO_PARENT_EFFORT },
    agents: {
      worker: { model: DEFAULT_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT },
      expert: { model: THINKING_SUBAGENT_MODEL, model_reasoning_effort: SUBAGENT_EFFORT }
    }
  }
}
