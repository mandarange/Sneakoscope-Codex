/**
 * Operator-facing Naruto vocabulary. Codex "official subagent" remains the sealed
 * transport wire name under the hood — do not invent a second runtime.
 */
export const SUBAGENT_TERMS = Object.freeze({
  system: 'Naruto',
  workflow: 'Naruto parallel workflow',
  agent: 'Naruto child',
  thread: 'Naruto child thread',
  parent: 'Naruto parent',
  customAgent: 'Codex agent role',
  transport: 'official Codex subagent'
})

export const DEPRECATED_AGENT_TERMS = Object.freeze([
  'shadow clone',
  'clone roster',
  'native agent swarm',
  'native CLI session swarm',
  'native agent',
  'active pool',
  'worker swarm',
  'process scheduler',
  'custom worker pool'
] as const)
