import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOfficialSubagentPrompt,
  validateOfficialSubagentSlices
} from '../official-subagent-prompt.js'
import { resolveSubagentThreadBudget } from '../thread-budget.js'
import { extractBoundedTriwikiAttention } from '../triwiki-attention.js'

test('official prompt seals model, ownership, wait, and no-nesting rules', () => {
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Implement two disjoint slices',
    maxThreads: 12,
    slices: [
      {
        id: 'A',
        title: 'Mechanical edit',
        description: 'Apply the exact one-line single-file rename',
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
  assert.match(prompt, /worker.*gpt-5\.6-luna.*max reasoning.*tiny, short-context, mechanical/)
  assert.match(prompt, /gpt-5\.6-sol with high reasoning.*ordinary UI, logic, backend, and native implementation/)
  assert.match(prompt, /gpt-5\.6-sol with max reasoning only for focused unresolved, high-risk, final-review, architecture, security/)
  assert.match(prompt, /gpt-5\.6-terra with medium reasoning for read-heavy documentation\/exploration, long-context analysis.*Computer Use, Browser\/Chrome, or image-generation/)
  assert.match(prompt, /explicit task class and phase win over incidental keywords/)
  assert.match(prompt, /requested subagents: 2/)
  assert.match(prompt, /max open agent threads: 12/)
  assert.match(prompt, /hard cap, never a utilization target/)
  assert.match(prompt, /C_t = min\(ready DAG width, disjoint ownership, verifier capacity/)
  assert.match(prompt, /max depth: 1/)
  assert.match(prompt, /parallel writes require disjoint paths/)
  assert.match(prompt, /wait for every final planned subagent/)
  assert.match(prompt, /\[A\].*`worker`/)
  assert.match(prompt, /\[B\].*`architecture_reviewer`/)
  assert.match(prompt, /model policy: luna_max_mechanical \(gpt-5\.6-luna\/max\)/)
  assert.match(prompt, /model policy: sol_max_judgment \(gpt-5\.6-sol\/max\)/)
  assert.match(prompt, /mode: read-only/)
  assert.match(prompt, /metadata mode: on-demand \(2\/25 roles included; full catalog is not injected\)/)
  assert.equal(prompt.match(/Core Engineering Directive/g)?.length, 1)
  assert.match(prompt, /from AGENTS\.md exactly/)
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

test('official prompt carries deterministic host capability workflows', () => {
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Prepare SQL, retrieve data, and deliver spreadsheet and PDF artifacts',
    maxThreads: 4,
    requestedSubagents: 1,
    decompositionStatus: 'parent_required',
    slices: []
  })

  assert.match(prompt, /only when it is actually available in the project MCP inventory/)
  assert.match(prompt, /SQL-generation-only requests: call `datasource_schema_context` first.*may complete without `datasource_query_readonly`/)
  assert.match(prompt, /actual data retrieval: call `datasource_schema_context`, generate one bounded parameterized SELECT\/CTE, call `datasource_query_readonly`, and retain its receipt/)
  assert.match(prompt, /spreadsheet create: `spreadsheet_create` -> `spreadsheet_inspect` -> optional one minimal `spreadsheet_update` -> `spreadsheet_inspect`/)
  assert.match(prompt, /spreadsheet edit: `spreadsheet_inspect` -> one minimal `spreadsheet_update` -> `spreadsheet_inspect`/)
  assert.match(prompt, /document delivery: editable source -> render -> artifact receipt/)
  assert.match(prompt, /requested host capability is missing or unhealthy, return blocked proof/)
  assert.match(prompt, /Slack delivery belongs to the ACAS runtime and is never a model tool/)
  assert.match(prompt, /do not infer availability from config text or duplicate host tool schemas/)
  assert.match(prompt, /"artifacts": \[/)
  assert.match(prompt, /"capabilities_used": \[/)
  assert.match(prompt, /"status": "passed\|failed"/)
  assert.match(prompt, /SKS overwrites these fields with observed Codex JSONL evidence before persistence/)
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

  assert.match(prompt, /dynamic automatic target/)
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

test('official prompt injects only the bounded relevant role catalog instead of the full catalog', () => {
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

  assert.match(prompt, /metadata mode: on-demand \(5\/25 roles included; full catalog is not injected\)/)
  assert.match(prompt, /`native_app_specialist`/)
  assert.match(prompt, /`protocol_reviewer`/)
  assert.match(prompt, /`runtime_reliability_reviewer`/)
  assert.match(prompt, /`triwiki_evidence_reviewer`/)
  assert.match(prompt, /`toolchain_specialist`/)
})

test('prompt carries the dynamic capacity snapshot and selected first wave', () => {
  const budget = resolveSubagentThreadBudget({
    requested: 8,
    configuredMaxThreads: 12,
    readyDagWidth: 7,
    disjointOwnershipCount: 6,
    verifierCapacity: 3,
    toolConcurrency: 5,
    marginalUsefulWorkers: 4
  })
  const prompt = buildOfficialSubagentPrompt({
    goal: 'Implement independent shards',
    maxThreads: budget.maxThreads,
    requestedSubagents: budget.requestedSubagents,
    firstWave: budget.firstWave,
    waveCount: budget.waveCount,
    capacity: budget.capacity,
    decompositionStatus: 'parent_required',
    slices: []
  })

  assert.match(prompt, /selected first-wave concurrency: 3/)
  assert.match(prompt, /"limiting_factors":\["verifier_capacity"\]/)
  assert.match(prompt, /marginal useful throughput stays positive/)
})

test('prompt makes later root waves and between-wave count authority explicit', () => {
  const automatic = buildOfficialSubagentPrompt({
    goal: 'Implement independent shards discovered over multiple waves',
    maxThreads: 4,
    requestedSubagents: 4,
    requestedSubagentsSource: 'automatic',
    firstWave: 2,
    waveCount: 2,
    decompositionStatus: 'parent_required',
    slices: []
  })

  assert.match(automatic, /max depth: 1 applies only to child nesting.*root parent.*later direct-child waves/i)
  assert.match(automatic, /close completed threads.*refresh evidence.*rescan the ready DAG.*next defensible direct-child wave when `remaining_to_start > 0`/is)
  assert.match(automatic, /spawn_next_direct_child_wave_upto:N/)
  assert.match(automatic, /automatic targets may resize between waves/i)

  for (const requestedSubagentsSource of ['operator', 'route_contract'] as const) {
    const exact = buildOfficialSubagentPrompt({
      goal: 'Run the exact contracted review waves',
      maxThreads: 4,
      requestedSubagents: 4,
      requestedSubagentsSource,
      firstWave: 2,
      waveCount: 2,
      decompositionStatus: 'parent_required',
      slices: []
    })
    assert.match(exact, /explicit operator and route-owned counts remain exact/i)
  }
})

test('slice validator rejects duplicate work, overlapping writes, and unassigned parallel ownership', () => {
  const result = validateOfficialSubagentSlices([
    {
      id: 'A',
      title: 'Parser fix',
      description: 'Implement parser fix',
      kind: 'worker',
      agent: 'implementation_specialist',
      paths: ['src/parser']
    },
    {
      id: 'B',
      title: 'Parser test',
      description: 'Add parser tests',
      kind: 'worker',
      agent: 'test_engineer',
      paths: ['src/parser/parser.test.ts']
    },
    {
      id: 'C',
      title: 'Parser fix',
      description: 'Implement parser fix',
      kind: 'worker',
      agent: 'implementation_specialist',
      paths: ['src/parser']
    },
    {
      id: 'D',
      title: 'Unowned write',
      description: 'Change another file',
      kind: 'worker'
    }
  ])

  assert.equal(result.safe, false)
  assert.deepEqual(result.duplicate_slice_ids, [['A', 'C']])
  assert.ok(result.overlapping_write_scopes.some((row) => row.left === 'A' && row.right === 'B'))
  assert.deepEqual(result.unassigned_write_scopes, ['D'])
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('duplicate_slice_fingerprint:')))
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('overlapping_write_scope:')))
  assert.ok(result.blockers.includes('unassigned_parallel_write_scope:D'))
})
