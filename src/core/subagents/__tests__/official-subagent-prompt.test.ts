import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOfficialSubagentPrompt } from '../official-subagent-prompt.js'
import { extractBoundedTriwikiAttention } from '../triwiki-attention.js'

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
  assert.match(prompt, /\[B\].*`architecture_reviewer`/)
  assert.match(prompt, /mode: read-only/)
  assert.match(prompt, /metadata mode: on-demand \(2\/21 roles included; full catalog is not injected\)/)
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

test('official prompt carries only bounded TriWiki attention anchors', () => {
  const triwikiAttention = extractBoundedTriwikiAttention({
    attention: {
      mode: 'aggressive_triwiki_active_recall',
      use_first: [
        ['claim-a', 'hash-a', 'source-a'],
        ['claim-b', 'hash-b', 'source-b'],
        ['claim-c', 'hash-c', 'source-c']
      ],
      hydrate_first: [
        ['claim-a', 'code_citations:src/a.ts'],
        ['claim-b', 'code_citations:src/b.ts']
      ]
    }
  }, 2)
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Review the bounded source scope',
    maxThreads: 12,
    requestedSubagents: 1,
    requestedSubagentsExplicit: false,
    decompositionStatus: 'parent_required',
    slices: [],
    triwikiAttention
  })

  assert.match(prompt, /two independent children are the non-trivial default/)
  assert.match(prompt, /attention\.use_first anchors/)
  assert.match(prompt, /claim-a/)
  assert.match(prompt, /claim-b/)
  assert.doesNotMatch(prompt, /claim-c/)
  assert.match(prompt, /do not inject the full context pack/)
  assert.match(prompt, /do not launch shell workers, a custom scheduler, a worker pool, or model fanout/)
})

test('TriWiki attention keeps core trust anchors and promotes query-relevant hydrate hints within the token budget', () => {
  const triwikiAttention = extractBoundedTriwikiAttention({
    attention: {
      mode: 'aggressive_triwiki_active_recall',
      use_first: [
        ['wiki-policy', 'hash-policy', 'source-policy'],
        ['wrongness-policy', 'hash-wrongness', 'source-wrongness'],
        ['docs-policy', 'hash-docs', 'source-docs'],
        ['unrelated-ppt', 'hash-ppt', 'source-ppt'],
        ['unrelated-search', 'hash-search', 'source-search']
      ],
      hydrate_first: [
        ['code:core-codex-hooks', 'code_citations:src/core/hooks-runtime.ts'],
        ['code:core-mcp-manager', 'code_citations:src/core/codex-app/mcp-manager.ts'],
        ['code:core-ppt-review', 'code_citations:src/core/ppt-review.ts']
      ]
    }
  }, 5, 'Improve every hook gate and the MCP manager')

  assert.deepEqual(triwikiAttention.anchors.slice(0, 3).map((anchor) => anchor.id), [
    'wiki-policy',
    'wrongness-policy',
    'docs-policy'
  ])
  assert.deepEqual(triwikiAttention.anchors.slice(3).map((anchor) => anchor.id).sort(), [
    'code:core-codex-hooks',
    'code:core-mcp-manager'
  ].sort())
  assert.equal(triwikiAttention.anchors.length, 5)
  assert.equal(triwikiAttention.full_pack_injected, false)
})

test('official prompt injects at most three recommended role descriptions instead of the full catalog', () => {
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Review native MCP runtime and TriWiki evidence boundaries',
    maxThreads: 12,
    requestedSubagents: 2,
    decompositionStatus: 'parent_required',
    slices: [],
    recommendedAgents: [
      'native_app_specialist',
      'protocol_reviewer',
      'runtime_reliability_reviewer',
      'triwiki_evidence_reviewer',
      'toolchain_specialist'
    ]
  })

  assert.match(prompt, /metadata mode: on-demand \(3\/21 roles included; full catalog is not injected\)/)
  assert.match(prompt, /`native_app_specialist`/)
  assert.match(prompt, /`protocol_reviewer`/)
  assert.match(prompt, /`runtime_reliability_reviewer`/)
  assert.doesNotMatch(prompt, /`triwiki_evidence_reviewer`/)
  assert.doesNotMatch(prompt, /`toolchain_specialist`/)
})
