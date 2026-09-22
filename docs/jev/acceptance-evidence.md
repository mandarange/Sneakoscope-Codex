# Jev acceptance evidence

Recorded after the implementation change in this working tree. A fixture test is
not a live test. A planned test is not an executed test.

## Statuses

| Track | Status | Evidence |
|---|---|---|
| Implementation | complete for supported consumers | Typed Jev output is compiled in `src/core/decisions/policy.ts` and consumed by `prepareOfficialSubagentMission` before coherent promotion. No `confirmWithLLM`, no advice append, no JSON-repair LLM. |
| Live connectivity | not run | No authorized `sks decision probe` was executed. Status: not authorized. |
| Performance | unavailable | No authorized live workload benchmark was executed. Tokens and cost are not inferred. |

## Acceptance matrix

| Row | Result | Evidence path |
|---|---|---|
| Off mode makes no network call and appends no advice | pass | `src/core/decisions/__tests__/integration.test.ts` — `off mode makes no transport call and does not append advisory text` |
| Valid Choice compiles to a typed plan effect | pass | `src/core/decisions/__tests__/policy.test.ts` — `valid bound Choice compiles to a typed plan effect` |
| Stub Jev Choice changes the promoted plan before lock re-entry | pass | `src/core/decisions/__tests__/integration.test.ts` — `a stub Jev plan Choice changes the promoted plan before coherent promotion` |
| Prompt executes compiled IDs without a second judge | pass | `src/core/subagents/__tests__/official-subagent-prompt.test.ts` — `selected decision contract tells the parent to execute compiled IDs without a second judge` |
| Missing required uncertainty is not invented | pass | `src/core/decisions/__tests__/policy.test.ts` — `missing required uncertainty does not invent confidence` |
| CamelCase-only usage is rejected | pass | `src/core/decisions/__tests__/policy.test.ts` — `raw usage.input_tokens is accepted and SDK camelCase-only usage is rejected` |
| Transport uses `/api/alpha/decisions` with snake_case provider policy | pass | `src/core/decisions/__tests__/transport.test.ts` — `transport posts only the native Decisions endpoint with snake_case provider keys` |
| Existing OpenRouter credential is reused | pass | `src/core/decisions/__tests__/transport.test.ts` — `credential reuse uses the existing OpenRouter helper and never a Jev secret file` |
| 401/402/cancelled keep unknown usage | pass | `src/core/decisions/__tests__/transport.test.ts` — `401/402/429/5xx, malformed JSON, and aborted calls keep unknown usage` |
| In-flight cap and circuit stay deterministic | pass | `src/core/decisions/__tests__/transport.test.ts` — `in-flight cap returns busy and circuit opens after three transport failures` |
| Fetch is refused while the lifecycle lock is held | pass | `src/core/decisions/__tests__/transport.test.ts` — `transport refuses to run while the official subagent lifecycle lock is held` |
| Leftover `local-decision` files are ignored and never become cloud consent | pass | `src/core/decisions/__tests__/config.test.ts` — `default mode is off and leftover local-decision files are ignored` |
| Enable requires pinned model and `--consent-cloud` | pass | `src/core/decisions/__tests__/cli.test.ts` — `enable requires the pinned model and cloud consent; disable returns to baseline` |
| Recovery is unsupported in production | pass | `src/core/decisions/__tests__/recovery.test.ts` — `production recovery remains unsupported and lists no live handlers` |
| Injected recovery handler is reached without a generative call | pass | `src/core/decisions/__tests__/recovery.test.ts` — `a stub Jev Choice reaches an injected handler without a generative call` |
| Cache hits do not repeat reported cost | pass | `src/core/decisions/__tests__/receipt.test.ts` |
| Evaluator can report no improvement without treating it as a software error | pass | `src/core/decisions/__tests__/evaluation.test.ts` |
| Compiler/consumers have no second-judge path | pass | `src/core/decisions/__tests__/policy.test.ts` — `compiler and consumers do not call a second LLM judge` |
| Packed tarball includes `dist/commands/decision.js` and excludes local-model worker assets | pass | `npm pack --ignore-scripts --dry-run --json` — 1760 files, `localDecisionFiles: []`, `dist/commands/decision.js` present |
| Control Center can enable/disable Jev without a key lock | pass | menubar template `Control Center Decisions page can enable and disable Jev through the same CLI`; concatenated Control Center `swiftc -typecheck` exit 0; Decisions harness `native-decisions-runtime-ok` |
| `sks local-decision` is not a command | pass | `src/cli/__tests__/router-local-decision-retired.test.ts` |
| Jev without a key keeps the baseline and does not fetch | pass | `src/core/decisions/__tests__/integration.test.ts` — `jev without an OpenRouter key keeps the baseline and does not fetch` |
| Center enable enters Jev on undecomposed automatic preparation | pass | `src/core/decisions/__tests__/integration.test.ts` — `Control Center enable argv turns on Jev for undecomposed official-subagent preparation` |
| Explicit operator counts do not call Jev | pass | `src/core/decisions/__tests__/integration.test.ts` — `an explicit operator count does not call Jev` |
| A Jev preparation fault keeps the baseline | pass | `src/core/decisions/__tests__/integration.test.ts` — `a Jev preparation fault keeps the baseline instead of throwing` |
| Live probe 200 | not run | No explicit live authorization |
| Workload tokens/cost | unavailable | No authorized live benchmark |

## Executed commands

```text
npx tsc -p tsconfig.json --pretty false
# exit 0

node --test --test-concurrency=1 dist/core/decisions/__tests__/*.test.js \
  dist/cli/__tests__/router-local-decision-retired.test.js \
  dist/core/subagents/__tests__/official-subagent-prompt.test.js
# 51 pass / 0 fail

node --test --test-concurrency=1 \
  dist/core/subagents/__tests__/agent-catalog-fanout.test.js \
  dist/core/subagents/__tests__/verification-budget-change-surface.test.js
# 26 pass / 0 fail

node --test --test-concurrency=1 dist/core/codex-app/__tests__/sks-menubar-template.test.js
# 32 pass / 0 fail (includes Control Center Decisions + Swift typecheck)

node dist/scripts/mutation-callsite-coverage-check.js
# ok true, uncovered 0, unused 0

npm pack --ignore-scripts --dry-run --json
# sneakoscope-10.3.0.tgz, 1760 files, dist/commands/decision.js present, no python/local_decision

npx tsc -p tsconfig.json --pretty false --incremental false
# exit 0

node --test --test-concurrency=1 dist/core/decisions/__tests__/integration.test.js
# 8 pass / 0 fail, including Center enable, operator count, and preparation fault

node dist/scripts/check-architecture.js
# passed, merge-base 7e268b3cbd10cbe40652542413e0a9c61678997b
```

Requested model: `typesafe/jev-1.13`.
Resolved model in live traffic: unavailable (no live probe).
