export const SUBAGENT_TERMS = Object.freeze({
  workflow: 'subagent workflow',
  agent: 'subagent',
  thread: 'agent thread',
  parent: 'parent agent',
  customAgent: 'custom agent'
})

export const DEPRECATED_AGENT_TERMS = Object.freeze([
  'shadow clone',
  'clone roster',
  'native agent swarm',
  'native CLI session swarm',
  'active pool',
  'worker swarm'
] as const)
