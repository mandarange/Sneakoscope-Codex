import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOfficialSubagentPrompt } from '../official-subagent-prompt.js'

test('official prompt seals model, ownership, wait, and no-nesting rules', () => {
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Implement two disjoint slices',
    maxThreads: 12,
    slices: [
      {
        id: 'A',
        title: 'Mechanical edit',
        description: 'Apply the specified rename',
        kind: 'worker',
        paths: ['src/a.ts']
      },
      {
        id: 'B',
        title: 'Architecture review',
        description: 'Review integration risk',
        kind: 'expert',
        paths: ['src/b.ts'],
        readOnly: true
      }
    ]
  })

  assert.match(prompt, /gpt-5\.6-sol with max reasoning/)
  assert.match(prompt, /worker.*gpt-5\.6-luna.*max reasoning/)
  assert.match(prompt, /expert.*gpt-5\.6-sol.*max reasoning/)
  assert.match(prompt, /requested subagents: 2/)
  assert.match(prompt, /max open agent threads: 12/)
  assert.match(prompt, /max depth: 1/)
  assert.match(prompt, /parallel writes require disjoint paths/)
  assert.match(prompt, /wait for every requested subagent/)
  assert.match(prompt, /\[A\].*`worker`/)
  assert.match(prompt, /\[B\].*`expert`/)
  assert.match(prompt, /mode: read-only/)
})

test('preparation prompt preserves requested count without inventing write slices', () => {
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Parent must decompose this goal',
    maxThreads: 12,
    requestedSubagents: 6,
    decompositionStatus: 'parent_required',
    slices: []
  })

  assert.match(prompt, /requested subagents: 6/)
  assert.match(prompt, /decomposition status: parent_required/)
  assert.match(prompt, /do not invent write scopes/)
  assert.match(prompt, /parent decomposition required before any subagent is spawned/)
})
