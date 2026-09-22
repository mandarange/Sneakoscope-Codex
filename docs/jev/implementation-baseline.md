# Jev OpenRouter implementation baseline

Recorded at checkout `7e268b3cbd10cbe40652542413e0a9c61678997b` on branch `main`. Worktree was clean. This file is implementation evidence, not a live protocol receipt.

## Ownership map

| Decision | Owner | Consumer | Evidence field |
|---|---|---|---|
| Explicit command, permission, source hash, test exit code | Existing SKS code | Unchanged callers | Existing gates and proofs |
| Optional retrieved excerpts in SKS-supplied attention | Jev Noul/Score, then code | `buildOfficialSubagentPrompt` via filtered `triwikiAttention` and materialized excerpts | `plan.delegation_prompt`, `plan.triwiki_attention`, `plan.jev_decision` |
| Automatic plan variant over the same slice set | Jev Choice, then code | `prepareOfficialSubagentMission` before promotion | `plan.requested_subagents`, `plan.fanout_policy`, `plan.delegation_prompt`, `plan.jev_decision` |
| Explicit/route-owned counts, pinned roles/effort | Existing code | Fan-out policy | `requested_subagents_source` |
| Native Codex child spawn parameters | Native host | `official-subagent-runner` / Codex `spawn_agent` | Host dispatch receipt; SKS plan is not proof of host honor |
| Ambiguous recovery action | Unsupported in this host surface | No SKS-owned recovery dispatcher consumes a closed Jev Choice | See recovery inventory |

## Actual consumers traced

- `src/core/subagents/official-subagent-preparation.ts::prepareOfficialSubagentMission` promoted a baseline plan under the lifecycle lock, then called `withLocalDecisionAdvice`.
- `src/core/local-decision/integration.ts::withLocalDecisionAdvice` appended `renderAdvisoryContext` to `delegationPrompt` only. It did not change counts, model, gates, or the plan artifact.
- `src/core/pipeline-internals/runtime-core.ts` copies `delegationPrompt` into parent `additionalContext`.
- `src/core/providers/openrouter/openrouter-secret-store.ts::resolveOpenRouterApiKey` is the existing credential path (`OPENROUTER_API_KEY`, `SKS_OPENROUTER_API_KEY`, then stored key).
- `src/core/subagents/triwiki-attention.ts` returns provenance-bound anchors (default 8, max 16, 2,000-token budget), not excerpts.
- `src/core/subagents/model-policy.ts` implementation policy is already `low`.

## Recovery inventory

Searched `src/core/subagents`, `src/core/agents`, `src/core/agent-bridge`, and `src/core/pipeline-internals` for a handler that could consume a bound recovery Choice.

| Candidate | Classification | Why it is not a Jev consumer |
|---|---|---|
| `recoverOfficialSubagentPreparationTransaction` | SKS-owned | Deterministic crash recovery of a preparation transaction. Not an ambiguous-failure choice. |
| Wave `recovered_capacity` | SKS-owned | Arithmetic reuse of thread slots. |
| Official runner OAuth callback hint | SKS-owned, deterministic | Auth/port-conflict text only. |
| Context-graph journal recovery | SKS-owned | Deterministic store repair. |
| Codex `spawn_agent` / `send_input` | native-host-owned | SKS cannot prove host execution from a saved plan. |
| Local-decision `kind: 'recovery'` evaluate CLI | retired advisory | Produced advice; no dispatcher invoked a handler. |

**Recovery capability: unsupported.** No enforceable SKS recovery handler exists for an ambiguous observed failure. The compiler still types `dispatch_recovery` for tests and replay. Production mode does not invent an advisory substitute.

## Removal inventory

The local Qwen/MLX decision runtime and its advisory integration were deleted
from this tree:

- `src/core/local-decision/**`
- `src/commands/local-decision.ts`
- `python/local_decision/**`
- docs and Control Center surfaces that install/start the local worker
- leftover `sks local-decision` retirement routing and local-mode migration

Current `sks decision` is Jev-only (`off` | `jev`). Hugging Face caches and
model files already on disk are still not deleted automatically.

## Protocol fixture shape

Frozen from the OpenRouter SDK operation `POST /api/alpha/decisions` (not `/api/v1/...` and not TypeSafe `/v1/systemone`). Raw JSON is snake_case. Synthetic fixtures live under `src/core/decisions/__tests__/fixtures/` and are labeled synthetic.
