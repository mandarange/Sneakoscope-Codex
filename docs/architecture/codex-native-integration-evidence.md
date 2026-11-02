# Codex integration: source evidence and verification boundary

Inspection date: 2026-10-31. This inventory supports the
[integration ADR](codex-native-integration-adr.md) and
[implementation roadmap](codex-native-integration-roadmap.md).

## Snapshot and repository review

- SKS remote default `main`, fetched and independently checked with `ls-remote`:
  [`7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9`](https://github.com/mandarange/Sneakoscope-Codex/commit/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9).
  Package version at that source snapshot: `10.7.2`.
- The only open PR at inspection was Draft
  [#33](https://github.com/mandarange/Sneakoscope-Codex/pull/33), head
  `70157816f07e986fc14008299e4db2716a1fe6f3`, fixing unreadable context
  configuration. Its four changed paths are excluded from this strategy PR.
- Main's exact-head [CI run 40684665371](https://github.com/mandarange/Sneakoscope-Codex/actions/runs/40684665371)
  was completed/success. PR #33's
  [CI run 41196029706](https://github.com/mandarange/Sneakoscope-Codex/actions/runs/41196029706)
  was completed/success. These are baseline observations, not proof of this PR.
- Reviewed `CONTRIBUTING.md`, product contract, architecture, CLI/Center ownership,
  subagent, memory, permission, and performance guides. No `AGENTS.md`,
  `.agents/skills`, or `SKILL.md` was present in the inspected SKS tree or
  supplied workspace instruction directories. Source and the current product
  contract take precedence over historical versioned design prose.
- Official upstream `main` inspected at
  [`67f0994b532b8740f14b5b738af7b7b2a915b1d6`](https://github.com/openai/codex/commit/67f0994b532b8740f14b5b738af7b7b2a915b1d6).
  Latest stable release returned by the official release API was
  [`rust-v0.166.0`](https://github.com/openai/codex/releases/tag/rust-v0.166.0),
  published 2026-10-29; its annotated tag object is
  `593389380740f7b4762771573c447ccfdc59742f` and its peeled commit is
  `6ff1e1ca3b30fc8b914720681fcf5fe62e95f856`.
  Main and stable are different snapshots. No claim is made that every main-only
  field is available in stable or SKS's package pin.
- SKS's checked-in [dependency declaration](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/package.json)
  and lock select `@openai/codex-sdk` `0.163.0`. This PR changes no pin.
  Runtime resolution/probing, not comparison of version strings alone, must
  determine which features can actually run.

These snapshots are evidence anchors. Product installation/support continues to
follow measured current latest stable, rather than freezing these versions.

## SKS implementation

All source links below are immutable at the SKS snapshot above. “Implemented”
means source capability found; it does not mean live provider/macOS behavior was
exercised in this review.

| Component and current evidence | Finding | New work / limit |
| --- | --- | --- |
| [App Server v2 client](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-app-server-v2-client.ts) and [tests](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/__tests__/codex-app-server-v2-client.test.ts) | Implements RPC IDs/timeouts, thread/turn methods, bounded frames/events, default-deny approvals, async dynamic-tool slots/timeouts/abort and process-exit rejection | No shared broker, durable operation journal, cross-process thread ownership, or general replay cursor; initialize currently opts into experimental APIs |
| [Metadata factory caller](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-model-metadata.ts) | Falls back from catalog to `model/list`, initializes one client and closes it in `finally` | Production source scan found no mission-execution caller of the v2 factory; metadata reuse needs scope/freshness invalidation |
| [Task runner](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-task-runner.ts), [SDK adapter](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-sdk-adapter.ts), [policy](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-sdk-config-policy.ts) | Routes tasks, maps sandbox policy, prepares auth, uses concurrency/reliability helpers, streams evidence and validates output; internal SDK configuration selects native OpenAI/ChatGPT and disables MCP | Broker must preserve or explicitly migrate these semantics. Generic provider inheritance and MCP memory are not already wired here |
| [Official subagent runner](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/subagents/official-subagent-runner.ts) and [execution-mode resolver](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/subagents/naruto-execution-mode.ts) | Standalone launches one `codex exec --json` parent; current-session returns preparation with `completion_evidence: false`; credential policy and environment allowlist are explicit | `CODEX_THREAD_ID`/mode detection is not a supported private-Desktop attachment API or proof the broker owns a thread |
| [Subagent preparation](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/subagents/official-subagent-preparation.ts), [spawn policy](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/hooks-runtime/subagent-spawn-policy.ts), [wave lifecycle](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/subagents/wave-lifecycle.ts) | Connection-specific child list, explicit targets/wave bounds, official-event evidence and parent integration policy already exist | Broker admission/closure must match official events. Configuration depth alone cannot prove V2 recursion denial |
| [Pipeline/task helpers](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/pipeline-internals/pipeline-stage-builder.ts) and [runtime call sites](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/pipeline-internals/runtime-core.ts) | Existing task states, `buildTaskKey`, `attachOrCreateTask`, authority intersection, task lease/fencing, handoff and finite plan compilation; `ACTIVE_TASKS` is process-local with snapshot/restore helpers | Bind upstream IDs/owner epochs and add locked persistence/recovery there; these helpers alone do not provide cross-process ownership. Do not introduce a competing task state machine or model scheduler |
| [Thread registry](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-thread-registry.ts) and [file locks](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/locks/file-lock.ts) | Locked registry updates, journals, heartbeat/owner-token locking and stale recovery are implemented | Registry write lock does not hold exclusive ownership over a live Codex turn; crash-safe operation reconciliation remains new |
| [MCP server](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/agent-bridge/mcp-server.ts) and [command contracts](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/safety/command-contract/contracts.ts) | Risk-filtered manifest exposure, input validation, bounded queue and CLI tool invocation exist | Dedicated read-only recall/context contract and cancellation/scope binding need implementation; `exposeExec` is not the memory integration design |
| [Memory intake](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/memory/jev-memory-intake.ts), [canonical reader/publisher](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/git-hygiene/shared-memory-publish.ts), [context query](https://github.com/mandarange/Sneakoscope-Codex/tree/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/triwiki/context-graph/query) | Staged candidates, explicit promotion/tombstones, source/graph freshness and bounded recall exist | Reuse these readers/writers through MCP. Conversation content must not become canonical memory automatically |
| [Center ProcessClient](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/native/sks-menubar/Sources/ProcessClient.swift), [OperationCoordinator](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/native/sks-menubar/Sources/OperationCoordinator.swift), [model settings](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/native/sks-menubar/Sources/SubagentModelsViewController.swift) | CLI/action-script calls, bounded output, process identity, operation receipts, mutation guard, cancellation/recovery and connection model settings exist | Streaming subscriptions to a shared execution owner, approval UI binding and relaunch reconciliation need a separate native slice |
| [Desktop Bridge handoff](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-lb/desktop-bridge/provider-handoff.ts) and [architecture contract](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/docs/architecture.md) | Provider-bound encrypted history is handled explicitly; native compaction can refuse cross-provider moves; no-fallback routing and identity separation are required | App Server does not remove provider protocol/compaction limits or authorize bypassing bridge policy |
| [Current schema gate](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/scripts/codex-current-app-server-v2-check.ts) and [capability probe](https://github.com/mandarange/Sneakoscope-Codex/blob/7f5b2193b3211b9e2ba05e141f0cd4ecbc9931c9/src/core/codex-control/codex-current-capability.ts) | Runtime-generated schema hashing and required method-name checks exist; opt-in real probe initializes and lists threads | Does not prove execution/approval/cancel/recovery equivalence; expand semantic and live contract coverage |

## Official upstream source/protocol/license

The following anchors are at the inspected upstream main commit. They describe
source availability, not support guarantees for the stock Desktop application.

| Immutable source | Supported conclusion |
| --- | --- |
| [CLI AppServer command](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/cli/src/main.rs#L570) | `codex app-server` supports local stdio (`--stdio` aliases `--listen stdio://`); the CLI labels App Server experimental. Do not confuse its flags with the standalone server binary |
| [Protocol method declarations](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server-protocol/src/protocol/common.rs#L554) | Public source defines start/resume/fork/read/list and turn start/steer/interrupt, serialization scopes, server requests and notifications; methods/fields have explicit experimental gates |
| [Thread parameters](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L62) and [turn parameters](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L174) | Model/provider/cwd/config/approval/sandbox and turn effort are explicit inputs; nullable/omitted fields and sticky overrides matter. No generic mutation idempotency guarantee is established by `clientUserMessageId` |
| [Server thread state](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server/src/thread_state.rs#L67) | Resuming an already running thread can atomically subscribe within the serving runtime; this is not a documented cross-process takeover contract for a stock Desktop session |
| [App Server feature notes](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server/README.md) | Human-command checkpoints, model-provider requirements, project trust, native verification restrictions, attachment metadata and other capabilities have distinct conditions. Thread resource attachments do not mean attaching an external controller to a live thread |
| [TypeScript SDK README](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/sdk/typescript/README.md) and [exec implementation](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/sdk/typescript/src/exec.ts) | SDK wraps CLI execution/JSONL, supports streamed turns and persisted resume; it is not itself a persistent App Server broker |
| [Apache-2.0 LICENSE](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/LICENSE) and [NOTICE](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/NOTICE) | Modification/distribution has license and notice conditions. Source access is not model-weight, hosted-service, trademark, or private-Desktop authorization |

## What this review does and does not establish

Code and source-defined contracts justify the chosen boundary and identify reuse
opportunities. They do not prove startup amortization, live child behavior,
cross-process ownership, provider capability, macOS rendering, or recovery after
real writes. No benchmark gains or live provider results are asserted here.
PR-specific documentation checks and exact-head CI results belong in the PR
description; future runtime evidence must satisfy the roadmap before rollout.
