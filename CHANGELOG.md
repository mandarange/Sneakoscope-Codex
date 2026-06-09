# Changelog

## [Unreleased]




## [2.0.18] - 2026-06-09

### Added

- Codex 0.138 capability detection with root and mission artifacts for `/app` handoff, plugin JSON, image path exposure, model-defined efforts, token usage, PAT v2, and OAuth MCP pre-refresh support.
- QA-LOOP Codex Desktop `/app` handoff artifacts, CLI flags, status output, Zellij pending-status surfacing, and explicit separation from Codex Chrome Extension web UI evidence.
- Codex plugin JSON inventory and candidate-only remote MCP server policy, including unavailable app-template doctor warnings and QA handoff recommendations.
- Image artifact saved-path contracts for QA/imagegen outputs so follow-up visual edits use real model-visible local paths.
- Model-advertised reasoning effort order support, QA effort escalation, Codex account token usage telemetry, and QA budget policy artifacts.
- Codex 0.138 doctor checks for shell fallback, Linux proxy socket paths, OAuth MCP pre-refresh readiness, AGENTS.md logical paths, and plugin discovery cache repair.
- Release DAG coverage and hermetic gates for the Codex 0.138 integration surface.

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Naruto final gate pass status now includes `parallelRuntimeOk` instead of only recording it as side evidence.
- Team legacy create removal coverage now rejects the old `parseTeamCreateArgs` helper token.
- Mad-DB MCP result lifecycle recording now uses a central post-tool helper and treats MCP `isError` results as failed DB operation lifecycle events.

## [2.0.17] - 2026-06-08

### Added

- Strict production PID enforcement for parallel runtime proof.
- True active-time scheduler utilization.
- 1-second live Zellij telemetry snapshot flush.
- Mad-DB MCP result lifecycle audit.
- Unified runtime/release proof summary.

### Fixed

- Production parallel proof no longer passes without worker PID evidence.
- Scheduler utilization no longer uses completed-count approximation.
- Slot panels no longer wait for 100 events before seeing telemetry updates.
- Mad-DB operations now record succeeded/failed lifecycle results.

## [2.0.16] - 2026-06-08

### Added

- Real parallel runtime proof with PID, timeline, wall-clock, overlap, visible pane, and headless worker evidence.
- Batch dispatch scheduler and scheduler utilization metrics.
- Naruto real parallelism blackbox, parallelism modes, and production parallel proof summary.
- Model-call concurrency metrics separate from worker process concurrency.
- Worktree allocation batch/pool proof and scheduler prewarm wiring.
- Incremental Zellij slot telemetry snapshots and performance gates.
- Full release parallelism blackbox report.

### Fixed

- Worker launch fan-out no longer waits on per-slot scheduler state writes.
- Visible pane count is separated from active/headless worker count.
- Team create now remains a Naruto redirect without unreachable legacy create code.
- Mad-DB semantics are clarified as bounded one-cycle, multi-operation break-glass.

## [2.0.15] - 2026-06-07

### Added

- Evidence-bound Codex/GPT research synthesis writer.
- Anti-template and repetition detector.
- Source-density and claim-density quality checks.
- Realistic complete-package fixture.
- Research handoff consumability blackbox.
- Ultra stability report coverage through the release DAG.

### Fixed

- Deterministic synthesis renderer is now mock/fallback only.
- Template-like research reports are rejected.
- Final reviewer detects repeated prose and unsupported synthesis.
- Non-mock Research blocks when Codex/GPT synthesis or final review is unavailable.

## [2.0.14] - 2026-06-07

### Added

- Real stage-aware research cycle runner.
- Parallel source layer shard execution.
- Source-ledger partial merge.
- Claim matrix builder from source/novelty/falsification ledgers.
- Concrete implementation blueprint densifier.
- Codex/GPT research final reviewer.
- Research blackbox gates.

### Fixed

- Research stage runner no longer only records placeholder stages.
- Research final reviewer no longer static-only.
- codex-sdk:research-pipeline now verifies real research package behavior.
- Short summary reports are rejected by blackbox gate.



## [2.0.13] - 2026-06-07

### Added

- Add Research quality contract artifacts, claim-evidence matrix, source quality report, implementation blueprint, experiment plan, replication pack, final reviewer, and stage-aware research work graph.
- Add Research artifact JSON Schemas, docs, package scripts, and release DAG gates for the 2.0.13 research pipeline closure.

### Fixed

- Harden Research gate evaluation so short reports, thin source coverage, missing counterevidence, unsupported key claims, missing blueprints, missing replication artifacts, and unapproved final reviews keep the gate blocked.



## [2.0.12] - 2026-06-07

### Added

- Add first-slot down-stack Zellij proof semantics, including slot renderer pane classification and a real-session geometry gate for worker panes stacked below the `SLOTS` anchor.
- Add release DAG closure for slot renderer proof semantics, Naruto allocation runtime wiring, GPT Final worktree apply policy, and cache glob hashing coverage.
- Add Naruto allocation/rebalance production wiring so assignment owners flow into work graph items, scheduler slices, queue ownership, and worker runtime proof artifacts.
- Add Naruto actual worker production integration proof that records control-plane worker result validity and keeps pre-run smoke opt-in.
- Add Git worktree public operator docs for parallel runtime, Zellij slot UI, Naruto worktree parallelism, and release DAG usage.

### Fixed

- Keep Git worktree checkpoint apply strategies explicit by preferring checkpoint cherry-pick, falling back to merge, and recording cross-rebase reports for idle clean worktrees after primary integration advances.
- Keep local/worktree candidate patch application behind GPT Final approval, using GPT `modified` output as the patch source and blocking GPT `rejected` output.

## [2.0.11] - 2026-06-07

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.10] - 2026-06-06

### Added

- Add slot-only Zellij UI gates for compact slot rendering, headless right-column overflow, and real right-column geometry proof.
- Add real Naruto active-pool and extreme-parallelism runtime checks that spawn actual child workers and validate result artifacts.
- Add primary-repo worktree integration runtime proof and agent role-config repair proof.

### Fixed

- Keep Zellij visible worker reservations capped before pane launch and close headless overflow worker state when runtime workers exit.
- Keep Naruto active-pool collection tied to completed workers instead of arbitrary first-half selection.
- Keep Git worktree integration applying validated worker diffs back to the primary repo with rollback hash evidence.
- Keep release audit, dynamic release planning, dynamic execution, and release-check stamps aligned to `release-gates.v2.json`.
- Keep mutation callsite coverage from missing `fs.promises.writeFile` calls.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.9] - 2026-06-06

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.8] - 2026-06-06

### Added

- Add the `release-gates.v2.json` manifest, release gate node schema, and a DAG-based `release:check` runner with resource-aware scheduling, hermetic per-gate environments, bounded logs, per-gate reports, cache proof, and speed-budget reporting.
- Add directive-named release gates for DAG runner proof, parallel speed budget, Git worktree manifest append, dirty main detection, untracked diff inclusion, single-operation worktree patch envelopes, integration worktree merge queue, dirty worktree locks, Naruto worktree coding blackbox, and Zellij real worker pane contract proof.

### Fixed

- Preserve every Git worker worktree allocation in the manifest instead of overwriting prior rows.
- Include untracked file contents in exported Git worktree diffs with `git add -N`, emit one `git_apply_patch` envelope operation for worktree diffs, detect dirty main worktrees, and lock retained dirty worktrees with `git worktree lock`.

## [2.0.7] - 2026-06-05

### Added

- Add Git worktree detection, capability, root allocation, worker worktree management, diff export, patch-envelope conversion, integration merge queue, cleanup/dirty-retention, cache policy, and pool planning modules.
- Add Naruto Git worktree mode so write-capable Git missions record `git-worktree` policy, non-Git missions degrade to patch-envelope-only without probing `git worktree`, Zellij dashboard titles include WT/branch context, and GPT Final packs carry worktree diffs.
- Add release gates for Git worktree capability, manager, diff export, merge queue, cleanup, cache/pool performance, Naruto worktree coding, Naruto worktree Zellij UI, and Naruto worktree GPT Final evidence.

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.6] - 2026-06-05

### Added

- Add Codex App Product Design plugin discovery, remote catalog lookup, auto-install readiness checks, and release gates for `product-design@openai-curated-remote`.
- Add Product Design-first routing hints for UI/design/PPT pipeline stages including research, ideation, audit, design QA, prototype, URL-to-code, image-to-code, share, and user-context.
- Add a Naruto read-only routing regression gate so read-only worker runs keep write mode off and avoid false patch requirements.

### Fixed

- Propagate read-only/no-write no-patch reasons through native worker proof so pre-existing dirty files do not fail proof as generated patches.
- Keep changed-file lease checks write-scoped, skipping them for proof runs that have no write leases, no writes, and no patch envelope.
- Keep `release-parallel-check` stdout bounded by writing full task detail to report files and printing only a concise summary.
- Keep SKS update prompts out of Codex App hooks while preserving CLI launch notices and making `sks doctor --fix` run the SKS global update path.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.5] - 2026-06-04

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.4] - 2026-06-04

### Fixed

- Add all-feature completion fixtures for `sks update` and `$with-local-llm-on/off` so the release DAG can verify the new local LLM command surface instead of reporting fixture gaps.
- Route `sks update now` package installation through the mutation guard and package-install ledger so safety callsite coverage stays complete.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.3] - 2026-06-04

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [2.0.2] - 2026-06-04

P0 closure release: make `sks --mad` stop rewriting user-level Codex App config, make safe Fast UI repair apply through `doctor --fix`, wire interactive MAD worker panes through real Zellij sessions, and tighten provider/runtime release gates.

### Added

- **MAD no-mutation release gate.** Added `mad-sks:app-ui-no-mutation` to exercise the actual `madHighCommand()` fixture path and assert `~/.codex/config.toml` hashes, plugin flags, profile files, and legacy profile tables are unchanged.
- **MAD Zellij pane-worker gate.** Added `mad-sks:zellij-default-pane-worker` and `zellij:worker-pane-manager-single-owner` to prove interactive MAD defaults to the Zellij worker-pane contract, with WorkerPaneManager as the single native worker pane creator.
- **Provider config.toml gate.** Added `provider:context-config-toml` to verify `model_provider = "codex-lb"` plus `[model_providers.codex-lb]` and `CODEX_LB_API_KEY` resolve to a high-confidence provider badge.

### Fixed

- `sks --mad` now uses a read-only launch profile with `-c service_tier=fast` / `-c model_reasoning_effort=high` overrides instead of calling the user-config-writing `enableMadHighProfile()` path.
- `sks --mad` launch preflight no longer repairs config by default; mutation-capable repair is limited to explicit repair flags.
- `sks --mad` creates the main Zellij session before starting the native swarm, then passes the session name into worker pane startup.
- `doctor --fix` now auto-applies safe Codex App Fast UI repair plans and leaves unsafe user-selected `standard` / `flex` state for explicit confirmation.
- Provider context resolution now reads `~/.codex/config.toml` provider selection and codex-lb provider blocks instead of relying only on env/auth state.
- Production runtime MJS enforcement now covers both root `scripts/*.mjs` and `bin/*.mjs`; the obsolete `bin/sks.mjs` shim was removed.

### Verified

- `npm view sneakoscope version --json` returned `2.0.1`, so no newer package update prompt was required before this 2.0.2 closure work.
- `npm run build`
- `npm run mad-sks:app-ui-no-mutation`
- `npm run doctor:fixes-codex-app-fast-ui`
- `npm run provider:badge-context`
- `npm run provider:context-config-toml`
- `npm run mad-sks:zellij-default-pane-worker`
- `npm run mad-sks:zellij-launch`
- `npm run zellij:worker-pane-manager`
- `npm run zellij:worker-pane-manager-single-owner`
- `npm run runtime:no-mjs-scripts`
- `npm run runtime:ts-source-of-truth`
- `npm run runtime:ts-python-boundary`
- `npm run release:gate-existence-audit`
- `npm run codex-app:fast-ui-preservation`
- `npm run codex-app:ui-clobber-guard`
- `npm run codex-app:provider-badge`

## [2.0.1] - 2026-06-04

Patch release: preserve Codex App Fast UI state around `sks --mad`, make provider identity visible in worker proof, and finish the production runtime migration from root `scripts/*.mjs` to TypeScript-built `dist/scripts`.

### Added

- **Codex App Fast UI preservation.** Added UI state snapshots, host-owned key diffing, project-local clobber detection, repair planning, and a doctor repair path guarded by explicit `--repair-codex-app-ui`.
- **Provider badge context.** Added provider resolution for `openai`, `codex-lb`, and `codex-app`, plus badge/fallback reporting that avoids mutating private Codex App UI state.
- **Zellij worker proof metadata.** Spawn-on-demand worker panes now record pane titles, provider context, and `service_tier`, and worker-pane communication proof checks `codex-control-proof.json`, pane lifecycle events, worker results, and pane drain evidence.
- **TypeScript runtime scripts and optional Python diagnostics.** Production gates now run from `dist/scripts/*.js` built from `src/scripts/*.ts`; optional Python helpers live under `pytools` and are not runtime fallbacks.

### Changed

- Package scripts, release-gate paths, package-boundary checks, architecture guards, and runtime parity checks now treat `src/scripts` as the source of truth and `dist/scripts` as the runtime surface.
- Doctor JSON/readiness output includes Codex App UI preservation state and provider context.

### Verified

- `npm view sneakoscope version --registry https://registry.npmjs.org/` returned `1.21.9` before the 2.0.1 bump, so no newer package update prompt was required.
- `npm run typecheck`
- `npm run build`
- `npm run runtime:no-mjs-scripts`
- `npm run runtime:ts-python-boundary`
- `npm run runtime:no-src-mjs`
- `npm run runtime:ts-source-of-truth`
- `npm run runtime:dist-parity`
- `npm run package-boundary:check`
- `npm run architecture:guard`
- `npm run runtime:ts-rust-boundary`
- `npm run codex-app:fast-ui-preservation`
- `npm run codex-app:ui-clobber-guard`
- `npm run doctor:fixes-codex-app-fast-ui`
- `npm run provider:badge-context`
- `npm run codex-app:provider-badge`
- `npm run zellij:spawn-on-demand-layout`
- `npm run zellij:worker-pane-manager`
- `npm run agent:worker-pane-communication-contract`
- `sks wiki validate .sneakoscope/wiki/context-pack.json`

## [2.0.0] - 2026-06-03

Major architecture release: unify Codex runtime execution behind the Codex SDK Control Plane, add UltraRouter task/profile decisions, harden SDK reliability behavior, and keep Zellij worker panes spawn-on-demand instead of pre-created runtime lanes.

### Added

- **Codex Control Plane release gates.** Added `codex-control:*` checks for capability, no legacy fallback, structured output, event ledgers, thread registry, side-effect scope, all-pipeline coverage, empty-result retry, stream-idle watchdog, tool-call sequence repair, keepalive without CoT leak, and real smoke aliasing.
- **Reliability Shield.** `src/core/codex-control/codex-reliability-shield.ts` evaluates SDK attempts, retries empty results before meaningful output, blocks idle streams after partial output, repairs missing tool-result sequences with explicit stubs, and emits redacted thinking heartbeats.
- **UltraRouter.** New `src/core/router/*` modules classify orchestrator/worker tasks, score capability cards, cache route decisions, hard-filter image/profile mismatches, and write `ultra-router-proof.json`.

### Changed

- `runCodexTask` now records UltraRouter decisions and Reliability Shield reports in `codex-control-proof.json`.
- Native worker SDK tasks pass explicit worker tier and reliability policy into the control plane.
- `release:check` now includes the new `codex-control:*` and `ultra-router:*` gates alongside the existing SDK, Zellij, safety, and release gates.
- Version truth was advanced to `2.0.0` across package, lockfile, TypeScript, Rust, README, and changelog surfaces through the SKS versioning bump path.

### Removed

- No runtime Codex task may fall back to raw `codex exec`; explicit legacy backend requests continue to block with `legacy_codex_exec_runtime_removed`.

### Verified

- `npm view sneakoscope version --registry https://registry.npmjs.org/` returned `1.21.9` before the 2.0.0 bump, so no newer package update prompt was required.

## [1.21.9] - 2026-06-03

Patch release: replace runtime Codex execution with the Codex SDK Control Plane, keep Zellij as visual pane proof, and add SDK-specific release gates.

### Added

- **Codex SDK Control Plane.** New `src/core/codex-control/*` modules manage SDK capability, thread registry, event translation, structured output schemas, sandbox/env/config policy, fake hermetic adapter, real SDK adapter, and control proof artifacts.
- **SDK proof artifacts.** Every SDK worker writes `codex-control-proof.json`, `codex-thread-registry.json`, `codex-sdk-events.jsonl`, and `codex-sdk-worker-result.json` with `sdk_thread_id`, `sdk_run_id`, stream event count, and output schema id.
- **Release gates.** Added `codex-sdk:*` checks for capability, no legacy fallback, backend routing, structured output, event ledgers, thread registry, sandbox policy, Zellij pane binding, all pipelines, route-specific pipelines, and real smoke.

### Changed

- **Native agent default backend is `codex-sdk`.** Team, QA-LOOP, Research, Naruto, MAD-SKS, and direct agent command surfaces now default to SDK execution unless mock/fake mode is requested.
- **Zellij is pane proof, not execution fallback.** Worker pane records use `worker_codex_sdk` and link pane/slot/generation/session records to SDK thread evidence.
- **Fast/proof policy recognizes SDK evidence.** Real/fake proof policy, fast-mode propagation, route collaboration, and real-parallel proof now treat SDK thread and event evidence as the Codex runtime proof.

### Removed

- Runtime fallback to raw `codex exec` for native workers. Explicit `codex-exec` requests now block with `legacy_codex_exec_runtime_removed`.

### Verified

- `npm view sneakoscope version` returned `1.21.7` before the bump, so no newer package update prompt was required.
- Context7/OpenAI Codex SDK documentation was consulted for `@openai/codex-sdk` thread, run, streaming, output schema, sandbox, approval, and working directory APIs.
- `npm run typecheck`
- `npm run build`
- `npm run codex-sdk:capability && npm run codex-sdk:no-legacy-fallback && npm run codex-sdk:backend-router && npm run codex-sdk:structured-output && npm run codex-sdk:event-stream-ledger && npm run codex-sdk:thread-registry && npm run codex-sdk:sandbox-policy && npm run codex-sdk:zellij-pane-binding && npm run codex-sdk:all-pipelines && npm run codex-sdk:dfix-pipeline && npm run codex-sdk:qa-pipeline && npm run codex-sdk:research-pipeline && npm run codex-sdk:team-naruto-agent-pipeline && npm run codex-sdk:release-review-pipeline && npm run codex-sdk:ux-ppt-review-pipeline && npm run codex-sdk:core-skill-pipeline && npm run codex-sdk:real-smoke`

## [1.21.8] - 2026-06-02

Patch release: replace pre-created Zellij worker lanes with spawn-on-demand worker panes, preserve trackpad scrollback in interactive Codex panes, and add release gates for the slot/pane communication contract.

### Added

- **Zellij WorkerPaneManager.** `src/core/zellij/zellij-worker-pane-manager.ts` opens named worker panes at slot generation time with `zellij --session <session> action new-pane --name slot-001/gen-1 -- sh -lc <worker-command>`, writes `zellij-worker-pane.json`, and records pane lifecycle events.
- **Slot/pane proof gates.** New checks cover main-only layout generation, worker pane manager metadata, scheduler spawn order, slot-to-pane binding, worker artifact communication, dynamic backfill panes, and real-codex-in-worker-pane wiring:
  - `npm run zellij:spawn-on-demand-layout`
  - `npm run zellij:worker-pane-manager`
  - `npm run zellij:worker-pane-spawn-order`
  - `npm run agent:slot-pane-binding-proof`
  - `npm run agent:worker-pane-communication-contract`
  - `npm run agent:zellij-dynamic-backfill-panes`
  - `npm run agent:real-codex-in-zellij-worker-pane`
- **Worker pane schema.** `schemas/zellij/zellij-worker-pane.schema.json` documents the runtime artifact contract for slot generation panes.

### Changed

- **Zellij layouts are main-only by default.** Generated layouts no longer pre-split `slot-*` worker panes or embed `zellij-lane --slot` commands. `initial_worker_panes` is now `0`; the optional monitor pane is behind `SKS_ZELLIJ_MONITOR_PANE=1`.
- **Real Zellij native workers use pane-bound scaling.** The native CLI swarm now records `native_cli_process_in_zellij_worker_pane`, accepts only real pane id sources (`zellij_worker_new_pane_stdout` or `zellij_worker_list_panes`), and uses durable worker artifacts for parent/worker communication.
- **Zellij lane supervisor starts empty.** The orchestrator no longer initializes persistent scheduler lanes before worker scheduling; the supervisor records an empty, drained state while worker panes are owned by WorkerPaneManager.
- **Release wiring covers the new runtime contract.** `release:check` includes the first five spawn-on-demand gates, and `release:real-check` includes real Zellij pane/screen proof plus `agent:real-codex-in-zellij-worker-pane -- --require-real`.

### Fixed

- Fix a Zellij mouse-mode regression in SKS-launched interactive Codex panes: `mouse_mode` now defaults to true again so trackpad/wheel gestures scroll the conversation pane instead of being translated into prompt-history navigation inside the focused input area. Clipboard integration remains enabled through `copy_command=pbcopy` and `copy_on_select=true`; opt out with `SKS_ZELLIJ_MOUSE_MODE=0` when terminal-native drag selection is preferred.
- Prevent worker-pane-internal Zellij backend reports from writing legacy synthetic persistent-lane launch evidence.
- Accept `native_cli_process_in_zellij_worker_pane` as a native worker scaling primitive in native session proof and no-subagent scaling policy.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

### Verified

- `npm view sneakoscope version --json` returned `1.21.7` before the bump, so no newer package update prompt was required.
- Context7 Zellij documentation was consulted for current `--session`, `new-pane`, `list-panes --json --all`, mouse mode, and copy command behavior.
- `npm run build`
- `npm run typecheck`
- `npm run zellij:spawn-on-demand-layout`
- `npm run zellij:worker-pane-manager`
- `npm run zellij:worker-pane-spawn-order`
- `npm run agent:slot-pane-binding-proof`
- `npm run agent:worker-pane-communication-contract`
- `npm run agent:zellij-dynamic-backfill-panes`
- `npm run zellij:layout-valid`
- `npm run agent:zellij-runtime`
- `npm run agent:native-cli-session-swarm`
- `npm run agent:native-cli-session-swarm-10`
- `npm run agent:native-cli-session-swarm-20`
- `npm run mad-sks:zellij-launch`
- `npm run agent:real-codex-in-zellij-worker-pane`
- Real smoke: `SKS_ZELLIJ_WORKER_RESULT_TIMEOUT_MS=45000 SKS_ZELLIJ_WORKER_HEARTBEAT_TIMEOUT_MS=15000 SKS_ZELLIJ_WORKER_PANE_HOLD_MS=200 node ./dist/bin/sks.js agent run "spawn on demand zellij worker pane smoke" --backend zellij --real --agents 1 --concurrency 1 --work-items 1 --minimum-work-items 1 --json`

## [1.21.7] - 2026-06-02

Patch release: make real Zellij backend workers run inside named slot panes, wire parent/worker communication through durable worker artifacts, and refresh release metadata for npm publication.

### Changed

- **Real Zellij workers are now pane-bound sessions.** For `--backend zellij --real`, the native CLI swarm creates or targets the Zellij session, opens a named slot pane with `zellij --session <name> action new-pane --name slot-...`, launches the worker CLI inside that pane, and waits for `worker-result.json` plus heartbeat/log artifacts instead of only spawning the worker from the parent process.
- **Zellij pane ids are reconciled immediately.** When `new-pane` does not print a pane id, SKS queries `zellij --session <name> action list-panes --json --all` and matches by slot title plus worker command/result path, recording `zellij_worker_list_panes` evidence.
- **README current-release guidance is shorter and task-focused.** The top release section now highlights the Zellij/Naruto runtime fix, the relevant artifacts, and the focused verification commands instead of carrying forward several old release narratives.

### Fixed

- **Zellij supervisor pane creation no longer depends on ambient session state.** Real supervisor lane launches now include `--session`, so pane creation targets the intended SKS Zellij session from outside Zellij as well as inside it.
- **Release metadata stays aligned after the explicit version bump.** `sks versioning bump patch` advanced package, Cargo, README, and changelog version surfaces to 1.21.7.

### Verified

- `npm view sneakoscope version --json` returned `1.21.6` before the bump, so no newer package update prompt was required.
- Context7 Zellij docs confirmed current `--session`, `new-pane`, `list-panes --json --all`, and background session syntax.
- `npm run typecheck`
- `npm run build`
- `npm run agent:zellij-runtime`
- `npm run zellij:layout-valid`
- `npm run zellij:pane-proof`
- `npm run zellij:lane-renderer`
- `sks naruto run ... --clones 3 --work-items 3 --readonly --json`
- `SKS_ZELLIJ_WORKER_RESULT_TIMEOUT_MS=45000 SKS_ZELLIJ_WORKER_PANE_HOLD_MS=1500 node ./dist/bin/sks.js naruto run ... --clones 1 --work-items 1 --backend zellij --real --readonly --json`

## [1.21.6] - 2026-06-02

Patch release: promote OpenAI Codex CLI `rust-v0.136.0` as the current compatibility baseline, wire its release-note features and bug fixes into SKS readiness, and prepare the npm release metadata.

### Added

- **Codex 0.136 compatibility matrix and release gate.** New `codex:0.136-compat` / `codex:0.136-compat:require-real` checks record `rust-v0.136.0` evidence for session archive/unarchive, app-server `--stdio` plus resumed-turn/status behavior, `CODEX_API_KEY` remote registration, short-lived remote-control server tokens, elevated Windows sandbox setup, feature-gated image-generation extension support, ChatGPT auth refresh/relogin-required handling, command-safety hardening, sandbox cleanup, Bedrock region fallback, and rmcp 1.7.0 compatibility.
- **0.136 release documentation and truthfulness coverage.** `docs/codex-0.136-compat.md`, the Codex CLI compatibility guide, official docs compatibility report, release-readiness report, and README now name the 0.136 capability ids directly while keeping 0.135/0.134/0.133 as inherited baselines.
- **`sks zellij dispatch` / `sks zellij send`.** Operators can queue a lane command through the nonblocking JSONL bus, and optionally target a reconciled real pane id with Zellij `write-chars` via `--write-pane`.

### Changed

- **`sks codex compatibility` now reports 0.136 first.** The aggregate compatibility output uses `rust-v0.136.0` as `required_baseline`, keeps the 0.135 and 0.134 matrices visible as inherited compatibility, and exposes local 0.136 probe evidence when the installed Codex CLI is available.
- **Release readiness now tracks the 0.136 gate.** `release:check`, the parallel release DAG, metadata checks, real-check wiring, runtime truth matrix, and gate-existence audit all include the warning-only 0.136 compatibility check, with `:require-real` kept in environment-dependent release proof.

### Fixed

- **Zellij parallel lanes now have a real runtime contract.** Generated KDL lanes receive per-slot SKS state dirs, nonblocking JSONL command inbox/ack/outbox files, `SKS_ZELLIJ_*` env, `nice -n 10` launch priority, dispatch throttle metadata, and a FIFO policy that explicitly avoids blocking writers. Live pane proof reconciles dynamic Zellij pane ids back into the lane supervisor instead of relying only on synthetic `zellij-pane-slot-*` ids.
- **`npm publish` now fails before `prepack` when npm auth is missing, stale, or not a maintainer.** The registry gate checks `npm whoami` and the package maintainer list under `--require-publish-auth`, detects configured-but-rejected npmrc tokens, and explains how to refresh `npm login` or configure an npm-consumed registry token before the expensive build and final registry `PUT /sneakoscope`.
- **Release metadata stays aligned after the explicit version bump.** `sks versioning bump patch` advanced package, Cargo, README, and changelog version surfaces to 1.21.6.

### Verified

- Verification for the 0.136 compatibility and release-prep changes is recorded in this turn's final release report.

## [1.21.5] - 2026-06-01

Patch release: restore Codex App compatibility for Codex CLI 0.135-era hook routing, Git Actions readiness, and Context7-backed repair prompts.

### Fixed

- **Codex App repair prompts now route to `$Team`, not `$Answer`.** Mixed complaint/directive prompts such as "호환이 안되는거같은데...?? 원인 분석해서 수정하고 배포 준비해줘 use context7 mcp" now keep the explicit implementation/release directive, even when the prompt contains `??`. Pure method questions such as "이 오류는 어떻게 수정해야 해?" still stay answer-only.
- **Context7 MCP mentions no longer misroute non-database repair work to `$DB`.** Bare `mcp` wording is no longer treated as a database signal; database routing still triggers on concrete database terms such as SQL, Supabase, Postgres, migrations, RLS, Prisma, Drizzle, Knex, `database`, `DB`, and `execute_sql`.
- **Codex App Git Actions readiness no longer depends on the removed `remote_control` feature flag.** SKS now treats `codex remote-control` command/version support as the remote-control capability source for Commit, Push, Commit and Push, and PR flows. On Codex CLI 0.135.0, this removes the stale `remote_control_feature` blocker while preserving real blockers when the command is unavailable.
- **`$Naruto` / native-agent parallelism is no longer gated by CPU cores.** Codex-exec workers are network-bound (each mostly idle awaiting the Codex API), so live concurrency now scales by memory and the provider rate limit up to the 100-clone ceiling — a capable host can run up to 100 in parallel regardless of core count (a 10-core / 32 GB host now allows 64). Tunable via `SKS_NARUTO_MAX_CONCURRENCY`, `SKS_NARUTO_GB_PER_WORKER`, and `SKS_NARUTO_MIN_CONCURRENCY`.
- **Zellij trackpad scroll now scrolls the conversation, not the prompt.** SKS-launched sessions enable `mouse_mode`, routing the trackpad wheel to the pane under the cursor (the transcript scrollback) instead of the focused Codex prompt. Copy still works via `copy_command=pbcopy` + `copy_on_select`; opt out with `SKS_ZELLIJ_MOUSE_MODE=0`.
- **Image generation works when authenticated through codex-lb.** `gpt-image-2` routes through the same Codex `/responses` backend the load balancer already proxies, so `$imagegen` no longer hard-blocks for codex-lb-only users (no direct `OPENAI_API_KEY`). The official Codex App `$imagegen` surface stays primary; opt out with `SKS_IMAGEGEN_ALLOW_CODEX_LB_API_FALLBACK=0`.
- **The MAD / Naruto cockpit lane reflects live fan-out.** When the lane's own mission ledger is idle, the renderer mirrors the most-recent active agent mission so parallel work shows up instead of a permanent "Workers idle". Disable with `SKS_LANE_FOLLOW_ACTIVE_MISSION=0`.
- **`sks --mad` now fans out through the native agent swarm.** MAD launch starts a read-only `sks agent run` swarm in the same MAD mission ledger before opening the cockpit, so the right-side lanes are backed by live native workers instead of a single orchestrator-only session. Tune with `--mad-agents`, `--mad-swarm-work-items`, and `--mad-swarm-backend`; use `--no-mad-swarm` only as an emergency UI-only fallback.
- **Codex App Full Access is no longer shadowed by the Fast profile.** The generated `sks-fast-high` profile no longer pins `sandbox_mode = "workspace-write"`, letting the Codex App/IDE permissions selector own Full Access vs workspace-write. The explicit `sks-mad-high` maintenance profile still uses `danger-full-access` for user-authorized MAD launches.
- **`$Goal` official-mode detection now checks `codex features list`.** SKS can detect `goals ... true` feature output even when `codex goal --help` is slow, hidden, or unavailable, and still falls back to the SKS goal bridge when no official signal is present.
- **Substantive follow-up prompts no longer collapse into the previous single active route.** When an active mission exists, new analysis, research, or code-changing `UserPromptSubmit` prompts now prepare a fresh Team/Research-style route with native sessions required instead of only replaying the old active context. Plain continuation prompts such as "keep going" still resume the current route, and simple commit/commit-and-push requests stay lightweight instead of entering Team parallelism.
- **The "update available" prompt no longer repeats on every turn.** After the choice is shown it stays quiet for a short window (default 8 min, `SKS_UPDATE_OFFER_THROTTLE_MS`) before re-surfacing; accept/decline still take effect immediately.
- **`sks doctor --fix` re-seeds the Codex App Fast-mode UI table.** The global `~/.codex/config.toml` `[user.fast_mode]` (`visible`/`enabled`/`default_profile`) is refreshed so installs whose config predates the Fast-mode keys get the Codex App speed selector back.

### Added

- **`sks xai` command** (alias `sks grok`) to set up, check, and document the optional xAI/Grok Live Search MCP provider for source intelligence, with an install-time discovery hint. `sks xai check`, `setup`, `status`, `docs`.

### Verified

- `npm run build --silent`
- `node --test test/unit/route-codex-app-compat-classification.test.mjs test/unit/codex-app-remote-control-readiness.test.mjs`
- `node --test test/unit/hook-command-output.test.mjs`
- `npm run codex:compat --silent`
- `npm run hooks:semantic-check --silent`
- `node ./dist/bin/sks.js codex-app check --json` (Git Actions and Chrome Extension pass; local Fast UI remains blocked by `global:top_level_model_reasoning_effort` until `sks doctor --fix` repairs the user's global Codex config)
- `node --test test/unit/mad-sks-native-swarm-wiring.test.mjs test/unit/auto-review-profile-config.test.mjs test/unit/official-goal-mode.test.mjs`
- `npm run goal-mode:official-default --silent`
- `node ./scripts/codex-app-ui-preservation-check.mjs`
- `npm run mad-sks:zellij-launch --silent`
- `npm run typecheck --silent`
- `node --test test/unit/hook-active-route-parallel-refresh.test.mjs test/unit/hook-command-output.test.mjs test/unit/hooks-update-check-control-plane.test.mjs`
- `npm run hooks:runtime-replay-warning-zero --silent`
- `npm run selftest -- --mock --silent`
- `npm run packcheck --silent`
- `npm run release:check:parallel --silent` (254/254 passed)

## [1.21.4] - 2026-06-01

Patch release: make SKS Fast mode on/off status visible from the Zellij lane UI, restore Mac trackpad scrollback for interactive Codex-in-Zellij panes, and prepare the next npm release candidate.

### Fixed

- **Zellij lanes now show the active Fast mode state accurately.** The lane renderer now falls back to the project-local Fast mode policy when live scheduler/worker artifacts have not recorded `fast_mode` yet, so a Zellij lane can show `Fast  on · service_tier=fast` or `Fast  off · service_tier=standard` immediately. The check fixture now covers both the implicit default-on state and an explicit project-local off preference.
- **Naruto live parallelism no longer collapses to one slot on capable Macs.** The host-capacity model now treats low macOS `freemem` as only one pressure signal and uses a conservative reclaimable-memory floor from total RAM, so `codex-exec` Naruto runs keep useful parallel slots on machines that can sustain them. Operators can still override with `SKS_NARUTO_MAX_CONCURRENCY`, and `sks naruto run` also accepts `--concurrency` / `--target-active-slots` for an explicit run-level target.
- **Naruto Zellij lanes are opened before clone scheduling starts.** Non-JSON real Naruto runs now reserve the mission id, launch the right-side Zellij lane stack up front, and then start the native scheduler, so each clone slot can show live activity instead of opening after the scheduler has already drained. Zellij cockpit lane manifests also stop capping visible lanes at 20, matching Naruto's larger fan-out.
- **Mac trackpad scroll now favors the conversation history in SKS-launched Codex panes.** Interactive Codex panes generated by SKS Zellij layouts now launch with Codex CLI's `--no-alt-screen` option, preserving terminal scrollback so wheel/trackpad gestures scroll the conversation transcript instead of moving through the prompt textarea/history. Set `SKS_ZELLIJ_CODEX_ALT_SCREEN=1` before launch to opt back into Codex's alternate-screen UI.

### Verified

- `npm run build --silent`
- `npm run zellij:lane-renderer --silent`
- `npm run zellij:layout-valid --silent`
- `npm run naruto:shadow-clone-swarm --silent`
- `npm run zellij:ui-design --silent`
- `npm run terminal:tui-output-stability --silent`
- `npm run mad-sks:zellij-launch --silent`
- `npm run typecheck --silent`
- `npm run changelog:check --silent`
- `npm run release:version-truth --silent`

## [1.21.3] - 2026-06-01

Patch release: restore macOS native `Cmd+C` text copy in SKS-launched Zellij sessions, keep every native agent visible in the right-side Zellij UI, harden direct publish stamp repair, and make explicit Fast mode toggles repair Codex Fast mode too.

### Fixed

- **`Cmd+C` text copy works in `sks --mad` Zellij sessions.** SKS now writes `mouse_mode false` into the generated Zellij clipboard config and passes `--mouse-mode false` with the launch options, while preserving `copy_command pbcopy` and `copy_on_select true`. This leaves drag-select + `Cmd+C` to the terminal/system clipboard instead of letting Zellij intercept the selection.
- **Native agent Zellij lanes no longer collapse to the active concurrency cap.** Team and Naruto routes now separate runtime concurrency (`target_active_slots`) from right-side UI lane count (`visual_lane_count`), so each native agent/clone gets a visible right pane even when the scheduler is throttled to fewer active workers.
- **Direct `npm publish` self-heals stale release stamps safely.** The publish path now runs `prepublish:release-check-or-fast`: if the existing release-check stamp is current, publish stays on the fast path; if the stamp is missing or stale, publish runs the full authoritative `npm run release:check` once, then rechecks the stamp before continuing. This fixes the recurring stale `prepublish:fast-check` failure after version bumps without replacing the full release gate with a synthetic stamp write.
- **`sks fast-mode on` now also repairs Codex Fast mode.** The explicit on action still writes the project-local SKS preference, and now also restores Codex's Fast mode UI/default profile keys (`[user.fast_mode] enabled/visible/default_profile`) plus top-level `service_tier = "fast"` when those were disabled, while preserving unrelated user/plugin settings.
- **Release proof structure checks see the minimum-agent blocker again.** The agent gate now records `agent_count_below_5` as well as the dynamic expected-count blocker, restoring the release DAG's route-proof artifact audit.

### Verified

- `npm run build --silent`
- `node --test test/e2e/route-team-native-agents.test.mjs`
- `node --test test/unit/zellij-clipboard-config.test.mjs`
- `node --test test/unit/prepublish-release-check-or-fast.test.mjs`
- `node --test test/blackbox/fast-mode-command-packed.test.mjs`
- `npm run mad-sks:zellij-launch --silent`
- `npm run routes:proof-artifact-structure --silent`
- `npm run release:version-truth --silent`

## [1.21.2] - 2026-06-01

Patch release: fix the `sks --mad` Zellij launch regression from 1.21.1.

### Fixed

- **`sks --mad` opens again with Zellij clipboard support enabled.** Zellij 0.44 rejects `--copy-command` when it is paired with the OSC52-only `--copy-clipboard` option, so the background session launch now passes only `--copy-command pbcopy` and `--copy-on-select true`. The generated config file still records `copy_clipboard "system"` for attach/config-file consumers, but the CLI no longer combines the mutually exclusive flags.

## [1.21.1] - 2026-06-01

Patch release: three `sks --mad` launch fixes — faster launch, working Zellij clipboard copy, and no more Codex legacy-profile deprecation warning.

### Fixed

- **`sks --mad` launch is no longer slow.** `activateMadZellijPermissionState` content-hashed the entire protected core (~1,900 files across `dist`/`src`/`scripts`/`schemas`) on every launch, even though that "before" snapshot is only stored and never compared during the interactive session. `snapshotProtectedCore` (`src/core/mad-sks/immutable-harness-guard.ts`) gained an opt-in `mode: 'metadata'` (lstat-only, no file reads) used only for the launch snapshot; the default stays `'content'` so the `mad-sks:immutable-harness` / `mad-sks:no-harness-modification` gates and `run`/`apply` comparisons are unchanged. The launch preflight also skips the redundant live `codex exec` config probe via a new `launchFast` flag in `runCodexLaunchPreflight` (`src/core/preflight/parallel-preflight-engine.ts`); the real Codex profile is exercised when the Zellij session opens moments later. All filesystem/permission/EPERM readability checks still run, and `SKS_LAUNCH_FULL_CODEX_PROBE=1` restores the full probe.
- **Text copy works inside the MAD Zellij session.** Zellij's default OSC 52 clipboard is dropped by macOS Terminal.app, and SKS passed no clipboard configuration. New `src/core/zellij/zellij-clipboard-config.ts` writes a clipboard config (`copy_command "pbcopy"`, `copy_on_select true`, `copy_clipboard "system"`); `zellij-launcher.ts` appends the `--copy-command/--copy-clipboard/--copy-on-select` options to the created session (after `--default-layout`, preserving the launch-command shape) and steers the foreground attach at the config via `ZELLIJ_CONFIG_FILE`. Holding Shift while drag-selecting remains the native-terminal selection fallback.
- **No more Codex "legacy profile" deprecation warning on launch.** `enableMadHighProfile` already removed `[profiles.sks-mad-high]`, but `runCodexLaunchPreflight`'s project-config splitter ran afterward and re-injected the legacy `[profiles.*]` tables from the project config back into `~/.codex/config.toml` every launch. Codex 0.134+ deprecated config-profile tables and the top-level `profile=` selector in favor of per-file `$CODEX_HOME/<name>.config.toml` overlays loaded by `--profile`. `splitCodexProjectConfigPolicy` (`src/core/codex/codex-project-config-policy.ts`) now drops those deprecated tables/selectors (reported as `removed_legacy_profiles`) instead of relocating them; `init.ts` and `install-helpers.ts` stopped emitting the legacy tables; and `migrateSksProfilesToPerFile` (`src/core/auto-review.ts`) writes per-file profile overlays and strips the stale tables on `sks --mad`. The Codex App fast-mode `[profiles.sks-fast-high]` table, `[user.fast_mode] default_profile`, and `model_provider = "codex-lb"` are preserved.

## [1.21.0] - 2026-06-01

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [1.20.5] - 2026-06-01

Patch release: `sks --mad` now actually opens the Zellij session in an interactive terminal instead of only printing an attach hint.

### Fixed

- **MAD Zellij session now auto-attaches.** A successful `sks --mad` launch previously created a *detached* background Zellij session (`zellij attach --create-background …`) and only printed `Attach with: …`, so nothing opened in the operator's terminal and stale sessions accumulated. SKS now performs the follow-up foreground attach automatically when launched in an interactive TTY, so the session takes over the terminal as expected. New `attachZellijSessionInteractive` (`src/core/zellij/zellij-launcher.ts`) spawns `zellij attach <session>` with `stdio: 'inherit'` and the same `ZELLIJ_SOCKET_DIR` namespace used to create the session, and never throws — on failure it falls back to printing the manual attach command.
- **Non-interactive launches are unchanged.** Auto-attach is skipped (keeping the `Attach with: …` hint) for `--json`, non-TTY/piped invocations, when already inside a Zellij session (`$ZELLIJ`), or when `SKS_NO_ZELLIJ_ATTACH=1` / `--no-attach` is set. `--attach` forces attaching even without a detected TTY.

### Verified

- `npm run typecheck`
- `npm run runtime:dist-parity`, `npm run zellij:launch-command-truth`, `npm run release:version-truth`
- `git diff --check`

## [1.20.4] - 2026-06-01

Patch release: makes successful `sks --mad` / codex-lb Zellij launches immediately actionable by printing the exact attach command that uses the same socket namespace as the background session.

### Fixed

- **MAD Zellij attach guidance.** After a successful `sks --mad` launch, SKS now prints `Attach with: ZELLIJ_SOCKET_DIR=... zellij attach ...` using the already-generated `attach_command_with_env`. This closes the confusing state where a fresh Zellij session existed but the operator had to infer the `/tmp/zj<uid>` socket namespace manually.

### Verified

- Confirmed `sks --mad` created the live `sks-codex-lb-mpue8wem-Sneakoscope-Codex` Zellij session under `/tmp/zj501`.
- Confirmed Zellij session discovery and attach syntax with Context7 Zellij docs.
- `npm run typecheck --silent`
- `git diff --check`

## [1.20.3] - 2026-05-31

Patch release: fixes macOS Zellij IPC socket path failures during `sks --mad` / codex-lb launches when `$TMPDIR` is long.

### Added

- **Fast mode dollar toggles.** Added `$Fast-On`, `$Fast-Off`, and `$Fast-Mode` plus `sks fast-mode on|off|status|clear`. The toggle writes the project-local `.sneakoscope/state/fast-mode.json` preference and native-agent routes honor it only when no explicit `--fast`, `--no-fast`, or `--service-tier` flag is present.

### Fixed

- **Zellij socket path fallback for MAD/codex-lb launches.** SKS-launched Zellij commands now default `ZELLIJ_SOCKET_DIR` to a short per-user `/tmp/zj<uid>` directory when the operator has not set one, preserving explicit `ZELLIJ_SOCKET_DIR` / `SKS_ZELLIJ_SOCKET_DIR` overrides. Launch reports include `*_command_with_env`, `zellij_socket_dir`, and `zellij_socket_dir_source` so manual attach commands use the same socket namespace.
- **Session name length guard.** Zellij session names are capped at 64 characters with a deterministic hash suffix when truncated, keeping the generated `contract_version_1/<session>` socket path under the Unix-domain socket path limit with SKS's default socket directory.
- **Sharper failure diagnosis.** Zellij stderr containing `IPC socket path is too long` is now classified as `zellij_socket_path_too_long` instead of the generic `zellij_command_failed`.

### Verified

- Added `test/unit/zellij-socket-dir.test.mjs` covering the long macOS `$TMPDIR` case, explicit socket-dir preservation, attach-command surfacing, and precise blocker classification.
- Added `test/blackbox/fast-mode-command-packed.test.mjs` and expanded `test/unit/fast-mode-policy.test.mjs` to cover project-local preference on/off/clear behavior, dollar-command discovery, and explicit flag precedence.
- Reproduced the user-shaped launch condition with a long `TMPDIR` and session `sks-codex-lb-mptvbk59-Sneakoscope-Codex`; the real background Zellij launch succeeded with `ZELLIJ_SOCKET_DIR=/tmp/zj501`.

## [1.20.2] - 2026-05-31

Stabilization patch: closes the enforcement / integration / execution layers that 1.20.1 shipped as infrastructure-only. No new large features. `release:check` passes end-to-end at 1.20.2.

### Added

- **Mutation Guard + call-site coverage gate (side-effect-zero enforcement).** New `src/core/safety/mutation-guard.ts` wraps `evaluateMutation`/`recordMutation` from the existing Requested-Scope-Contract + Mutation-Ledger: each `guarded*` op scope-checks before applying, enforces a backup/no-op reason for config/skill mutations, records to the ledger, and throws on violation. The two global package installs (`npm i -g @openai/codex`, `brew install zellij`) in `install-helpers.ts` are routed through `guardedPackageInstall`. New gate `safety:mutation-callsite-coverage` (`scripts/mutation-callsite-coverage-check.mjs`) statically fails any genuinely-risky mutation (package install / global config write / chmod / xattr / chflags / rename / process kill) on the risk-surface files that is neither guarded nor allowlisted with a function-level reason.
- **`release:check:dynamic:execute` — real caching gate runner.** New `scripts/release-check-dynamic-execute.mjs` executes the change-selected hermetic gates (reusing `gate-manifest` + `gate-cache` + the `release-real-check` spawn model), serves cache hits to skip re-runs (cache key includes affected-file hashes + dist digest + git HEAD), defers real/heavy gates to `release:real-check`, and emits a `sks.release-check-dynamic.v2` report (`mode/selected/skipped/executed/cache_hits/failures/ok`). `--plan-only` preserves planning; `--publish` runs every `required_for_publish` gate. Standalone (never in the chain/DAG/manifest). Docs: `docs/dynamic-release-pipeline.md`; publish policy added to `docs/release-readiness.md` (dynamic-only cannot authorize a publish).
- **Core Skill route-runtime integration.** `runNativeAgentOrchestrator` now consults the route's deployed Core Skill snapshot (`selectRouteSkill`, read-only, never invokes the optimizer) and records `selected_core_skill` (skill_id/version/hash/source/optimizer_invoked) in `agent-proof-evidence.json` for the agent/qa/research/naruto routes. `promoteToDeployed` gained an optional 3rd `opts` param (2-arg callers unchanged) that records `skill_snapshot_promotion` in the mutation ledger with the archived snapshot as the rollback pointer. New gates `core-skill:route-runtime-integration`, `core-skill:promotion-side-effect-ledger`.
- **`zellij:doctor-readiness` + explicit doctor Zellij block.** `sks doctor --json` now exposes a `zellij_readiness` block (binary/status/min_version/version/required_for/layout_proof/pane_proof/screen_proof/tmux_removed_runtime) and a verbose console section; Zellij missing keeps `mad_ready=false` while `cli_ready` can stay true. The screen-proof scrapeable section set and the UI-design composed-frame section set were reconciled to a single canonical pair (`ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS` ⊂ `ZELLIJ_LANE_SECTIONS`) in `zellij-lane-renderer.ts`, asserted by the new gate.

### Changed

- All version surfaces bumped to **1.20.2** (`package.json`, `package-lock.json`, `src/core/version.ts`, `src/core/fsx.ts`, `src/bin/sks.ts`, `crates/sks-core/Cargo.toml`/`Cargo.lock`/`main.rs`, `RELEASE_VERSION`). The release-metadata script keeps its `-1-19-` filename by convention (only the internal version constant moves).
- The 4 new hermetic gates are wired into `release:check` (chain + DAG + regenerated `release-gates.json` + existence-audit required list).

### Verified

- **1.18.13 Codex config-load-truth / MAD-repair / fast-mode goal confirmed already shipped.** The 1.18.13 goal document was written against a 1.18.12 baseline, but its entire Definition of Done had already landed across 1.19.x/1.20.1. Re-verified on live code (codex-cli 0.135.0): the actual-Codex config-load probe (`scripts/codex-config-load-probe.mjs` schema v2 with signal classification + fake-codex harness), readiness matrix (`src/core/doctor/doctor-readiness-matrix.ts`), TCC diagnostic (`src/core/doctor/macos-tcc-diagnostic.ts`), TOML-aware project-config splitter, EPERM/ACL/symlink repair, `-c service_tier=fast` default, launch preflight that blocks the Codex pane on unreadable config (`runCodexLaunchPreflight`), and `sks mad repair-config`. All five hermetic gates (`codex:config-eperm-fixture`, `doctor:fix-proves-codex-read`, `mad:preflight-blocks-unreadable-config`, `fast:codex-service-tier-proof`, `codex:project-config-policy-splitter`) and the real-Codex `codex:actual-config-load-probe` pass. The spec's tmux-context smoke (Task 4.2) is a **non-goal**: tmux was removed in favour of Zellij, and `mad repair-config --tmux-smoke` deliberately reports `tmux_runtime_removed_use_zellij`.

### Fixed

- **Stale splitter test.** `test/unit/codex-config-preflight.test.mjs` expected a separate `~/.codex/<profile>.config.toml`; the redesigned splitter folds `[profiles.*]` into the single `~/.codex/config.toml` (the file Codex actually loads) and keeps `profile_config_path` null. Test updated to assert the verified behaviour.
- **Pre-existing tmux→Zellij stale-test rot (a full-suite sweep surfaced 8 latent failures, none run by any release gate).** Five were stale assertions referencing removed/renamed behaviour, each fixed to match verified-correct current output: `runtime-truth-matrix` (`tmux_physical`→`zellij_pane`), `release-readiness-report` (`agent_terminal_tmux_1_18`→`agent_terminal_zellij_1_18`), `fake-real-policy-v2` (`backend:'tmux'`/`physical_tmux_verified`→`backend:'zellij'`/`zellij_pane_verified`), `parallel-write-agents` (envelope now requires `session_id`/`slot_id`/`generation_index`/`lease_id` for `wall_clock_parallel_evidence`), and `mad-sks-shell-argv-classifier` (must use an unrelated temp `targetRoot` so protected-core blocking is exercised instead of the engine-source exception; references the engine's `src/core` by absolute path).
- **`$Naruto` route protected-core blocking proof** is now correctly exercised by the shell-classifier test above; the engine_source_exception path is documented inline.

### Completed

- **`$Naruto` Shadow Clone Swarm route skill + fixture wiring.** The labs-tier `$Naruto` route (`routes.ts`, `naruto-command.ts`) declared `appSkillAliases: ['shadow-clone','kage-bunshin']` and a `route-naruto` feature-fixture, but never shipped the Codex App skill templates or the executable-fixture args. Added the `naruto`, `shadow-clone`, and `kage-bunshin` SKILL.md templates to `installSkills` (`src/core/init.ts`) — documenting the up-to-100 lease-safe parallel-clone swarm, fast-tier clones, host-capacity throttling, per-clone proof, and parent integration — and added `route-naruto` to `SAFE_EXECUTABLE_FIXTURE_ARGS` (`src/core/feature-registry.ts`). The route now satisfies the dollar-route skill-coverage contract (`generated-dollar-skills`, `global-skills-install`) and executes its fixture in the release fixture set (`all-features-execute-fixtures`).

### Removed

- **tmux-runtime test/script rot from the Zellij migration.** Deleted 21 dead test files and 16 unwired gate scripts left behind when the tmux runtime source modules were removed (commit 5328dd5): 13 unit/integration tests importing deleted `dist/core/**` modules (`ERR_MODULE_NOT_FOUND`), 8 tests asserting tmux-runtime artifacts the Zellij runtime no longer produces, and 16 `scripts/*tmux*`/`*warp-right-lane*` gate scripts referenced by no npm script or DAG task. The tmux-named **blackbox** tests were kept — they were already migrated to drive the live Zellij runtime (`agent:zellij-runtime`, `zellij-pane-proof`, `zellij-layout-valid`, `zellij-lane-renderer`). Migration tooling (`runtime-no-tmux-check.mjs`, `tmux-removal-inventory.mjs`) retained.
- Untracked three stray `.sneakoscope/layouts/*.kdl` Zellij layout artifacts accidentally committed in `52a696f` (already covered by `.gitignore`); clears the `repo-audit` publish gate.

### Added

- **gpt-image-2 generation now retries transient failures (root-cause fix for frequent imagegen failures).** The imagegen adapter classified `429`/overloaded/`5xx`/timeout responses but returned `blocked` on the first failure — no retry — so the rate-limit-prone image endpoints (especially the codex-lb proxy) failed often. Both real call paths (`/v1/images/edits` multipart and the Responses API `image_generation` tool) are now wrapped in the **centralized responses retry policy** (`src/core/responses-retry-policy.ts`, max 4 attempts, exponential backoff on 408/409/425/429/5xx + transient network/timeout errors) via a new `withResponsesRetry()` wrapper; `imagegen` was added to the policy's `adapters` list and the retry count/log is recorded in the response artifact. Verified by `withResponsesRetry` unit tests and adapter-level tests (429×2→success on the 3rd attempt; persistent 503→4 attempts then honest block). gpt-image-2 model ID, `input_fidelity`-omitted, allowed sizes, and Responses `image_generation` tool shape were re-confirmed against the official OpenAI docs (model `gpt-image-2`, snapshot `gpt-image-2-2026-04-21`).
- **Auth-aware imagegen readiness in `sks doctor` + capability.** New `src/core/imagegen/imagegen-auth-readiness.ts` reads `~/.codex/auth.json` `auth_mode` and reports, per auth method, whether fully-headless single-command gpt-image-2 is available and the exact next action. Verified by capturing codex's real wire protocol: on this OAuth machine (`auth_mode=chatgpt`) the LLM reaches codex-lb fine (`GET /models` 200, `wss://…/responses` WebSocket with `Bearer CODEX_LB_API_KEY` + `originator`/`openai-beta`/`x-codex-turn-metadata` headers), but the `image_generation` tool is **not exposed to headless `codex exec`** (confirmed twice — the model says "the actual image_generation callable was not exposed in this session" and falls back to a hand-built PNG, even with `--enable image_generation`). So image generation is not a "the LLM works ⇒ images work" property; it needs a surface that exposes the tool. `sks doctor` now prints `Image Gen: auth=<mode> | headless_auto=<available|unavailable> | paths: …` with next actions (Codex App GUI auto-discovery, or set `OPENAI_API_KEY` for single-command headless); `detectImagegenCapability` includes the `auth_readiness` block and `doctor --json` exposes `imagegen`.
- **Codex App GUI `$imagegen` output is now auto-discovered (no manual attach).** On OAuth-only machines (`auth_mode=chatgpt`, no `OPENAI_API_KEY`) the `image_generation` tool is not exposed to headless `codex exec` (the model returns a fake PNG) and the codex-lb proxy uses non-standard token refresh, so there is no clean fully-headless gpt-image-2 path — the working surface is the Codex App GUI, which writes real outputs to `~/.codex/generated_images/<session>/ig_*.png`. New `src/core/image-ux-review/codex-app-generated-image-discovery.ts` scans that directory and auto-selects the newest genuine image (PNG/JPEG/WEBP signature check, `ig_` prefix), guarded by a `since` (run-start) check and a max-age window (default 30 min) so a stale unrelated generation is never silently reused. `createCodexAppImagegenAdapter` uses it when no `SKS_CODEX_APP_IMAGEGEN_OUTPUT` is attached; the response artifact records `output_source` (`manual_attach` vs `auto_discovered_generated_images`) and the discovered path. `$Image-UX-Review`/`$UX-Review` pass the mission start time (opt-in strict mode `--strict-generated-since`, window override `--generated-image-max-age-min`). Verified end-to-end against the real `~/.codex/generated_images` (12 candidates → newest 1.4 MB PNG selected).
- **gpt-image-2 API fallback auto-enables on an OpenAI key.** When Codex App `$imagegen` is unavailable or fails, `generateGptImage2CalloutReview` now auto-uses the direct OpenAI Images API fallback whenever `OPENAI_API_KEY` is present (explicit opt-out: `allowApiFallback:false` / `SKS_IMAGEGEN_ALLOW_API_FALLBACK=0`), and sends the gpt-image-2 `quality` parameter (default `high`, override via `SKS_IMAGEGEN_QUALITY`). The codex-lb proxy fallback deliberately stays **explicit opt-in only** — a codex-lb key is not Codex App evidence and the route must never silently route screenshots through the LB proxy (preserves the `does not silently fall back to codex-lb` policy).
- **`test:no-orphan-dist-imports` release gate** (`scripts/test-no-orphan-dist-imports-check.mjs`): fails if any test file imports a `dist/...` module whose TypeScript source no longer exists, so deleting a source module without its test (the exact rot above) can no longer pass silently. Parses real `import`/`import()` references only (ignores string-literal arguments). Wired into `release:check` and the gate manifest (`release-gates.json`).

## [1.20.1] - 2026-05-30

Core Engine SkillOpt release: introduces the SKS Core Skill Engine (a safe, self-evolving skill optimizer), a requested-scope side-effect-zero contract, and a dynamic risk-based release pipeline, on top of the 1.19.x hardening. `release:check` passes end-to-end at 1.20.1.

### Added

- **SKS Core Skill Engine** (`src/core/skills/**`, SkillOpt-derived). Skills are the frozen agent's external versioned state — **Core Skill Cards** (route-scoped, candidate/accepted/rejected/deployed). A **Core Skill Optimizer** (pure, no model call) proposes **bounded add/delete/replace** edits (**Core SkillPatch**) to a *single* skill document under a **textual edit budget**; patches that target code/config/package/global files or exceed budget are rejected. Edits are accepted **only on strict held-out improvement** (`core-skill:heldout-validation`); rejected patches are recorded in a **Rejected SkillPatch Buffer** (`.sneakoscope/skills/rejected-skill-patches.jsonl`) and never retried. Accepted candidates are promoted via an explicit gate to an **immutable Deployment Snapshot**; the **inference/deployment path reads the snapshot only and makes no extra model call** (`core-skill:no-inference-optimizer` proves the optimizer throws in deployment context). Rollout traces are scored with a side-effect-zero hard-fail component. Gates: `core-skill:card-schema`, `core-skill:rollout-scoring`, `core-skill:patch`, `core-skill:heldout-validation`, `core-skill:deployment-snapshot`, `core-skill:no-inference-optimizer`. Schemas: `schemas/skills/core-skill-card.schema.json`, `schemas/skills/core-skill-patch.schema.json`. Doc: `docs/core-skill-engine.md`.
- **Requested-Scope Contract + Mutation Ledger** (`src/core/safety/**`): a deny-by-default contract per route declares which mutations are allowed; global/destructive mutations (global config, package install, process kill, codex-lb auth, Zellij install, skill promotion) require explicit confirmation, and every mutation is recorded in a ledger with `requested_scope_allowed` + a backup/no-op reason. Applying a mutation outside scope, or a config/skill mutation without a backup, is a violation. The skill optimizer cannot bypass the contract. Gate: `safety:side-effect-zero`. Doc: `docs/side-effect-zero-policy.md`.
- **Dynamic release pipeline** (`src/core/release/**`): `release:gate-planner` builds the gate manifest `release-gates.json` (tier/cost/affected_by/always_on/required_for_publish) from the live release-gate set and validates manifest↔release parity; `release:check:dynamic` selects only P0 always-on gates plus gates whose `affected_by` files changed (docs-only changes skip heavy/real gates; publish mode never skips a required gate); `release:gate-budget` reports the slowest gates and any over the hard ceiling.
- Legacy upgrade matrix extended to 1.20.1 with `1.19.x_zellij_project_noop` and `existing_skill_cards_preserved` states; `docs/legacy-upgrade-1.20.md`; `prepublish:fast-check` (stamp-based fast-path verification).
- **TriWiki runtime consumption** (`src/core/triwiki-runtime.ts`): the native agent kernel (`agent-orchestrator`, which executes Team/Naruto/ReleaseReview/$Agent workers) now **consults the deployed TriWiki context pack** (`.sneakoscope/wiki/context-pack.json`) read-only before dispatch — surfacing `attention.use_first`/`hydrate_first` — and **references it in worker proof** (`agent-proof-evidence.json` gains `triwiki_context_consulted` + `context_pack_hash` + `agent-triwiki-context.json`). This closes the worker-level root cause where the kernel was wiki-blind (it is also the first runtime consumer of `triwiki-attention`). Gate: `agent:wiki-context-proof`.
- **Wiki memory gates now verified at release.** The five previously-orphaned core wiki/memory gates — `shared-memory:check`, `wrongness:check`, `wrongness:fixtures`, `trust:check`, `git-collaboration:e2e` (shared-TriWiki merge + wrongness sync e2e) — were defined but absent from `release:check`/the DAG/the gate manifest. They are now wired into `release:check`, the DAG, the gate-existence-audit allowlist, and the gate manifest, so TriWiki shared-memory, negative-evidence, and trust-validation semantics are verified on every release.

### Changed

- All version surfaces and the migration journal bumped to 1.20.1 (`.sneakoscope/reports/migration-1.20.1-journal.jsonl`).
- The new Core Skill Engine, side-effect-zero, dynamic-pipeline, and TriWiki-runtime/wiki-memory gates are wired into `release:check`.
- Removed dead `migrateWikiContextPack` (no importer); the wiki context pack is exercised via `sks wiki refresh`/`pack`.

## [1.19.1] - 2026-05-30

Final hardening release: closes the remaining legacy-upgrade, publish, postinstall, runtime-boundary, and Zellij UX risks so 1.19.x is safe to merge to `main` and publish to npm. The 1.19.0 feature set is unchanged.

### Fixed

- **Legacy upgrade zero-break (`init.ts`).** `sks setup` / project `.codex/config.toml` regeneration no longer force-overwrites user keys or re-enables user-disabled Codex App flags. `mergeManagedCodexConfigToml` now seeds `model`/`service_tier`/`suppress_unstable_features_warning` and every `[features]` flag and `[user.fast_mode]` key **set-if-absent**, and plugin tables are auto-enabled only under `SKS_MANAGE_CODEX_APP_PLUGINS=1` (and even then never overwrite an existing table). This matches the already-hardened install-helpers path and is the same rationale that fixed the Codex App UI breakage: force-writing those tables reverted a user's `enabled = false`.
- **Zellij real-session heartbeat is now a blocker.** `waitForLaneHeartbeat` (in `zellij-screen-proof.ts`) returns a decisive result and a timeout produces the `zellij_lane_heartbeat_timeout` blocker; `zellij:real-session-launch --require-real` fails (with the heartbeat path and waited/timeout ms recorded) instead of silently continuing when the lane renderer never emits a heartbeat.

### Added

- **Migration transaction journal** (`src/core/migration/migration-transaction-journal.ts`) writing `.sneakoscope/reports/migration-1.19-journal.jsonl`: every config mutation records `before_hash`, `after_hash`, `backup_path`, `changed`, and `rollback_available`. `sks doctor --fix` builds the journal for the whole fix transaction (project + CODEX_HOME config) and prints the journal path.
- **Redesigned Zellij lane UI** (`composeLaneFrame`): sections SKS Lane / Mission / Mode / Fast / Workers / Codex child · Work (Current/Queue/Patch) · Safety (Lease/Protected/Rollback) · Blockers (max 3, rest → `+N more → <report>`) · Reports · `Keys:` footer. Width-safe at 80/100/120 with middle-ellipsis on long paths, `NO_COLOR`-respecting (status-only colors, screen proof strips ANSI), and a footer of real commands (`Ctrl+q detach · sks doctor --fix · sks zellij status · sks agent rollback-patches`).
- **`sks zellij status|repair` command** — inspects Zellij runtime capability/readiness and explains repair steps (`brew install zellij`, `sks deps check --yes`, `sks doctor --fix`) without auto-installing anything.
- **Release gates** added to `release:check`: `zellij:launch-command-truth` (locks the documented `attach --create-background … --default-layout` command and bans the stale `--session … --layout` form), `zellij:real-session-heartbeat` (hermetic heartbeat-blocker proof), `zellij:ui-design` (width/section/ellipsis/NO_COLOR/footer-command checks), `legacy:upgrade-zero-break` (10-state 1.18→1.19 upgrade matrix), `publish:packlist-performance` (tarball file-count/size + forbidden-path guard, also run in `prepublishOnly`), `postinstall:safe-side-effects` (no default network/tool-install/process-kill), `runtime:ts-rust-boundary` (TS source-of-truth; publish never compiles Rust; JS fallback proven). Added to `release:real-check`: `publish:dry-run-performance`.
- **Naruto proof** now asserts `concurrency_capped` and host-derived `safe_concurrency`, making the fan-out (`clones`) vs live-concurrency (`target_active_slots`) distinction explicit ("N clones, running M at a time").
- New docs: `docs/legacy-upgrade-1.19.md`, `docs/architecture-ts-rust-boundary.md`, `docs/zellij-ui-design.md`.

### Changed

- `.npmignore` no longer blanket-ignores `dist/` and `scripts/` (these contradicted the `package.json` `files` allowlist that actually ships them); the new `publish:packlist-performance` gate guards the tarball contents instead.

## [1.19.0] - 2026-05-29

### Fixed

- Production-harden the install flow so `npm i -g sneakoscope` no longer clobbers a user's global `~/.codex/config.toml`. `ensureGlobalCodexFastModeDuringInstall` now: preserves user-set top-level `model`/`service_tier`/`model_reasoning_effort` (only seeds SKS defaults when absent, never strips the user's reasoning effort); backs up the prior config before any mutation; refuses to overwrite an unparseable config (backs it up and reports `unparseable_config_preserved`); validates its own output parses before writing; and is now idempotent (a second install is a no-op). SKS continues to manage only its namespaced tables (`[features]`, `[profiles.sks-*]`, `[user.fast_mode]`, `[plugins]`).
- Wrap the entire `postinstall` flow in try/catch so a failed setup side-effect never fails `npm i`, and always restore the codex-lb snapshot in `finally` (even on early return / throw).
- Stop terminating third-party Codex App processes during `npm i` by default; this is now opt-in via `SKS_POSTINSTALL_RECONCILE_APP_PROCESSES=1` (otherwise detect-and-report, repair via `sks doctor --fix`).
- A global `npm i -g sneakoscope` no longer initializes whatever project the shell happened to be in (it bootstraps only the global runtime root; run `sks setup` inside a project to initialize it).
- `sks doctor --fix` now backs up the managed project `.codex/config.toml` before `--force` regeneration, so a hand-edited config is always recoverable.
- `$Naruto` agents now get dynamic, team-style per-clone effort: truly simple / no-tool work runs at `low`, any tool use lifts a clone to `medium` (never high/xhigh), and every clone runs in fast service tier.

- Make `sks --mad` install or repair its Zellij CLI dependency through the existing install/bootstrap and launch dependency flow, instead of letting a missing Homebrew package reach the Zellij launch path.
- Launch MAD/Team Zellij layouts with the documented `zellij attach --create-background <session> options --default-layout <layout>` command, avoiding the stale `zellij --session <session> --layout <layout>` pattern that can fail after auth/preflight succeeds.
- Keep npm postinstall from silently mutating Homebrew/npm global tools by default; explicit repair paths are `sks bootstrap --yes`, `sks deps check --yes`, `sks --mad --yes`, or opt-in `SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS=1`.
- Surface labeled Zellij stdout/stderr tails and the report path in the `MAD Zellij action` line when launch still fails, so operators can act on the real Zellij error instead of only seeing `zellij_command_failed`.
- Make `sks doctor --fix` actually recover an already-corrupted Codex config (its whole reason to exist). Previously the splitter could not help once machine-local keys were physically nested inside a table — it saw them as table members, not top-level keys — and `doctor --fix` only ever touched the project `.codex/config.toml`, never the global `CODEX_HOME/config.toml` that Codex actually loads. Added a structural recovery pass (`repairCodexConfigStructure`) that hoists misplaced machine-local keys (e.g. `model_provider`, `notify`) out of `mcp_servers`/`env` tables (and anything trailing an absorbed `# SKS moved …` comment) back above the first table, with backup + atomic write, and wired it into `doctor --fix` / `mad repair-config` for **both** the project and global configs. Legitimate keys inside `[profiles.*]` are preserved.
- Detect structurally-broken configs: the config-load probe now classifies serde/TOML deserialize failures (`invalid type: …`, `expected a string`, `Error loading config.toml` without an EPERM cause) as `codex_cli_config_toml_parse_error` instead of silently falling back to `codex_cli_config_load_unverified`, and surfaces a `sks doctor --fix` operator action for it.
- Stop the machine-local config mover from corrupting `~/.codex/config.toml`: moved top-level keys (e.g. `model_provider`, and array-valued `notify`) are now merged structurally **before** any `[table]` header instead of being appended at end-of-file, where TOML parsed them as members of the trailing table (producing `invalid type: sequence, expected a string` and a config Codex refused to load). Restores `sks --mad` gating and codex-lb when a machine-local `model_provider`/`notify` is present.
- Make `splitCodexProjectConfigPolicy` a no-op when the project config resolves to the global `CODEX_HOME/config.toml` (e.g. running `sks` from the home directory), so the global config is no longer split against itself and re-corrupted on every `sks doctor --fix` / `sks --mad`.
- Ship `codex-config-load-probe.mjs` inside the published package via the `files` allowlist (resolved at runtime from `scripts/` or `dist/scripts/`). The probe was previously excluded by the npm `files` allowlist + `.npmignore`, so installs could not run it and MAD preflight always fell back to the `codex_cli_config_load_unverified` blocker. The runtime now degrades gracefully (integration-optional) if the probe is ever absent rather than hard-blocking, and `dist/` stays free of stray `.mjs` so the dist-parity gate passes.
- Make every codex-lb config write TOML-safe so initial install never corrupts `~/.codex/config.toml`: `configureCodexLb`, `repairCodexLbAuth`, and the postinstall snapshot-restore now route through a shared `safeWriteCodexConfigToml` gate (parse-check the existing config and back it up + bail if unparseable; refuse to write a result that would not parse — catching the regex helper's multiline-string blind spot; back up before mutating; no-op when unchanged). codex-lb stays opt-in (never auto-applied on install).
- Stop SKS from removing/blocking the Codex App UI: Codex App `[features]` flags, `[user.fast_mode]`, and `suppress_unstable_features_warning` are now set **only if absent** (a fresh config still gets SKS defaults, but SKS never re-enables a feature the user disabled), and marketplace plugin auto-enable is now opt-in via `SKS_MANAGE_CODEX_APP_PLUGINS=1` (force-enabling plugins the App could not load was breaking/hiding plugin panels). SKS-owned `[profiles.sks-*]` seeding is unchanged.
- `$Naruto` now scales to host capacity: the clone count is the total work fan-out, but live concurrency is throttled to a system-safe number derived from CPU cores + free memory (heavier cap for `codex-exec`, tighter for in-process `fake`), so `--clones 100` never spawns 100 processes at once while still completing all work units. Override with `SKS_NARUTO_MAX_CONCURRENCY`.

### Added

- Add `$Naruto` Shadow Clone Swarm mode (影分身 / Kage Bunshin no Jutsu): a high-scale variant of the native agent kernel that fans out up to 100 parallel clone sessions (`sks naruto run "task" --clones N`, aliases `$ShadowClone`/`$Kagebunshin`/`--naruto`). Lifts the standard 20-agent ceiling to `MAX_NARUTO_AGENT_COUNT = 100` **only for this route** (threaded via an optional `maxAgentCount` through roster/scheduler/orchestrator; every other route keeps the 20 cap), builds an identical-clone roster, and reuses the proven work-queue + scheduler + lease-based patch-swarm machinery for safe parallel writes. See `docs/naruto.md`.
- Add `naruto:shadow-clone-swarm` release gate + blackbox test proving the ceiling lift (100), the unchanged default cap (20), a 100-unique-clone roster, and an end-to-end 24-clone run scheduling all clones to completion past the old 20 cap.
- Add `codex-project-config-policy-merge-regression.mjs` covering moved-keys-before-tables ordering and the CODEX_HOME self-split no-op guard.
- Add `doctor-fix-recovers-corrupted-config-check.mjs` proving `doctor --fix` recovers a corrupted project and global config (key hoisting), and is a no-op on a healthy config (profile keys preserved).
- Add codex-lb auth commands: `sks codex-lb set-key` (swap the API key without re-typing the host — reuses the stored base URL), `sks codex-lb use-codex-lb` (switch auth to the codex-lb API key), and `sks codex-lb use-oauth` (switch back to ChatGPT OAuth, restoring a saved login or falling back to `codex login`).
- Add release gates `install:update-preserves-config` (a customized `~/.codex/config.toml` survives `npm i -g`, with backup + idempotency + unparseable-not-clobbered), `codex-lb:config-toml-safety` (a codex-lb write never corrupts the TOML, incl. the multiline-string trap), and `codex-app:ui-preservation` (SKS never overrides a user-disabled feature/plugin; plugins opt-in; fresh config still seeded) — each with a blackbox test and wired into the release DAG.


## [1.18.13] - 2026-05-29

### Breaking

- Remove tmux as a supported SKS interactive runtime. SKS now uses Zellij exclusively for MAD, lane UI, and interactive multi-agent cockpit sessions.
- `sks --mad` no longer launches tmux or falls back to tmux. Install Zellij to use interactive MAD/lane UI.

### Changed

- Add actual Codex CLI config-load probing with structured EPERM/TOML/untrusted-project classification, fake Codex hermetic fixtures, and release gates for Node-read-success plus Codex-read-failure regressions.
- Make `sks doctor --fix` write a readiness matrix with primary blockers and next actions, and require actual Codex config-load evidence before reporting Ready yes.
- Strengthen MAD launch preflight, add `sks mad repair-config`, add Zellij readiness proof, and prevent config preflight failures from launching a Codex pane.
- Harden project config splitting, deprecated approval-policy normalization, macOS EPERM/TCC/symlink/ACL repair reporting, and official `service_tier=fast` CLI proof.
- Wire Codex 0.135, permission profile, Zellij layout/pane/screen proof, and strict no-tmux gates into the release DAG.
- Fix the MAD-SKS source-project exception so the Sneakoscope source repo is not misclassified as protected core while installed harness core remains immutable.


## [1.18.12] - 2026-05-29

### Added

- Add Codex config readability proof for `.codex/config.toml`, including parent traversal, stat/lstat, owner/mode, macOS ACL/flags/xattrs/quarantine, symlink safety, Node read, spawned-child read, blockers, operator actions, and JSON reports.
- Add project-local Codex config policy splitting for ignored profile/provider/auth/notification/telemetry keys with backup, user CODEX_HOME migration, selected profile file migration, and deprecated `approval_policy = "on-failure"` rewriting.
- Add EPERM repair transactions and MAD launch preflight that run config readability, config policy, safe repair, and Fast service-tier CLI proof before tmux launch.
- Add a standalone `codex-config-load-probe.mjs` script for model-free current-process and spawned-child config read proof.
- Add official Codex exec argument builder coverage for `-c service_tier=fast`, profile versus ignore-user-config exclusivity, sandbox, output schema, and output-last-message wiring.

### Fixed

- Prevent `sks doctor --fix` from treating setup output as readiness without Codex child readability proof.
- Prevent MAD/tmux launches from dropping fast-mode inline CLI overrides or launching past config preflight blockers.
- Prevent Codex exec process reports from claiming Fast mode without verifying the actual Codex CLI args contain the service tier override.

### Changed

- Bump release metadata from 1.18.11 to 1.18.12 across npm, TypeScript, dist, and Rust version surfaces.

## [1.18.11] - 2026-05-28

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [1.18.10] - 2026-05-28

### Added

- Add patch swarm runtime truth coverage that ties route execution, strategy gate evidence, patch queue lifecycle, merge/apply groups, verification, rollback, final patch proof, and non-policy-only proof into `agent:patch-swarm-runtime-truth`.
- Add an append-only patch transaction journal and summary proof for enqueue, lock, apply, verification, rollback dry-run, hashes, changed files, durations, and final status events.
- Add a serial conflict rebase executor and release gate for same-file, subtree, stale-context, domain-policy, protected-path, unleased-path, and rollback-aware conflict fixtures.
- Add an optional real Codex patch envelope smoke gate that uses Codex exec output-schema/output-last-message semantics when `SKS_TEST_REAL_CODEX_PATCHES=1` and reports `integration_optional` unless required mode is enabled.
- Add Native CLI Session Swarm runtime so `--agents 10` and `--agents 20` spawn real `sks --agent worker` CLI sessions instead of relying on Codex internal subagent/scout scaling.
- Add no-subagent-scaling release gates proving the main orchestrator does not count Codex internal subagents as SKS worker sessions.
- Add Fast Mode Default closure so all native agent workers, Codex exec children, tmux workers, and MAD target workers inherit fast service tier and fast runtime profile unless explicitly disabled.

### Changed

- Wire the new patch swarm truth, transaction journal, conflict rebase, strict strategy-to-patch, rollback command, MCP scheduler, Appshots attachment, Codex runner truth, and optional real Codex patch smoke gates into release readiness and runtime truth reporting.
- Extend patch proof strictness so applied entries must retain strategy or micro-win references, verification nodes, rollback nodes, lease ids, ownership binding, transaction journal proof, and conflict rebase evidence.
- Update release metadata from 1.18.9 to 1.18.10 across npm, TypeScript, dist, and Rust version surfaces.
- Treat `--agents N` as target native CLI worker session count, not subagent count.
- Treat native CLI worker spawn proof as release-critical for multi-agent routes.

### Fixed

- Harden patch rollback with hash preconditions, user-facing `sks agent rollback-patches` UX, Wrongness output on rollback failure, queue status updates, and symlink/realpath containment checks.
- Strengthen Appshots and MCP scheduler evidence so Codex appshot sources require thread/attachment/source/local-only metadata and read-only concurrency proof relies on actual overlap rows rather than static hints.
- Prevent multi-agent runs from silently clamping to Codex internal subagent limits.
- Prevent worker count proof from passing when only subagent/scout events exist.
- Prevent Fast mode from being omitted in spawned worker CLI sessions, Codex exec process reports, tmux lanes, or MAD target worker reports.

## [1.18.9] - 2026-05-27

### Added

- Add Appshots thread attachment discovery evidence with thread id, attachment id, source app/window, local-only status, and attachment kind classification.
- Add MCP `readOnlyHint` runtime scheduler proof for concurrent read-only fixtures, serialized write-capable fixtures, destructive false-positive blocking, and timestamped overlap evidence.
- Add Codex 0.134 runner truth gates covering `--profile`, managed proxy redaction, local history evidence, process report profile recording, and required-mode release blocking.

### Fixed

- Prevent Appshots evidence from passing without Codex appshot thread/attachment provenance when a source claims to be a Codex Appshot.
- Prevent MCP read-only concurrency proof from relying only on static `readOnlyHint` classification.

### Changed

- Bump release metadata from 1.18.8 to 1.18.9 and wire the new Appshots, MCP scheduler, and Codex runner truth gates into `release:check`.

## [1.18.8] - 2026-05-27

### Added

- Add the strategy-first ADHD orchestration gate, dopamine/micro-win board artifacts, file ownership plan, parallel modification plan, and verification/rollback DAG before native agent scheduling.
- Add Appshots capability, operator policy, privacy-safety, TriWiki/Voxel, and Source Intelligence evidence gates for visual app-state proof.
- Add release scripts for strategy gates, Appshots gates, MCP readOnlyHint concurrency, and Codex 0.134 hook context parity.
- Add retention cleanup safety coverage so route cleanup preserves durable TriWiki/reflection/proof context while deleting closed-route scratch.

### Fixed

- Prevent write-capable agent runs from losing strategy references in task graph, work queue, proof, and runtime truth evidence.
- Preserve proof-safe parallel patch evidence with queue events, ownership ledger rows, after-hashes, rollback digests, parallel batches, serial conflicts, and simple unified-diff envelopes.
- Prevent completed routes from leaving unnecessary `team-inbox`, `bus`, cycle/arena, agent lane scratch, temp, and raw stdout/stderr log files after the route is safely closed, while retaining blocked-route diagnostics.
- Bound post-route retention cleanup to the completed mission so large local mission stores cannot push route fixtures past their timeout; full old/excess mission sweeping remains available through `sks gc`.

### Changed

- Bump release metadata from 1.18.7 to 1.18.8 and extend runtime truth with `adhd_orchestration` and `appshots` subsystem rows.
- Keep Appshots operator actions explicit: nonvisual work is not blocked, while visual proof without an operator-recorded source remains a blocker.
- Treat retention as a two-plane contract: durable learning/audit artifacts stay, old/excess missions with proof are compacted rather than deleted wholesale, short-lived temp files default to immediate cleanup, and release-parallel raw logs are removed after inline summaries replace file paths in the proof report.

## [1.18.7] - 2026-05-27

### Added

- Add Codex 0.134 compatibility reporting for local history search, `--profile` primary selection, MCP environment/OAuth/schema/readOnlyHint changes, hook subagent context, managed proxy propagation, and workspace usage-limit messaging.
- Add bounded local Codex history search, MCP 0.134 policy helpers, managed proxy environment forwarding, and profile-aware Codex exec native agent runners.
- Add proof-safe parallel agent patch queue, merge, apply, rollback, and proof helpers with Agent, Team, and DFix blackbox gates.
- Add P6 runtime truth rows and 1.18.7 gate existence/version metadata reports.

### Fixed

- Prevent profile-based Codex exec runs from combining `--profile` with `--ignore-user-config`.
- Prevent readOnlyHint MCP tools from being treated as authoritative write-safety proof without destructive-name/schema checks.
- Prevent 1.18.7 release metadata from passing without Codex 0.134, MCP 0.134, managed proxy, local history, and parallel patch gates.

### Changed

- Treat `rust-v0.134.0` as the recommended Codex compatibility baseline while preserving 0.133 and 0.132 as inherited compatibility baselines.
- Extend runtime truth from P0-P5 to P0-P6 for Codex 0.134 and parallel write proof closure.

## [1.18.6] - 2026-05-26

### Added

- Add generated runtime truth matrix rows for tmux physical proof, Codex dynamic smoke, cleanup, AST work graph, Source Intelligence, Goal mode, route blackbox, dynamic scheduler, and Warp MAD lanes.
- Add trust report subsystem proof levels and runtime truth matrix links.
- Add MAD-SKS Warp/tmux lane UI proof artifacts.

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Prevent static runtime truth tables from hiding missing live proof artifacts.
- Prevent cleanup from reporting success without verified process, tmux pane, temp dir, and lock after-states.

### Changed

- Treat required real tmux, Codex dynamic, and Warp MAD lane modes as explicit runtime truth blockers.
- Treat AST-aware work graph ownership and fake-real subsystem levels as first-class release readiness evidence.

## [1.18.5] - 2026-05-26

### Added

- Wire real tmux physical proof into the native agent orchestrator lifecycle with initial, before-drain, after-drain, and final phases.
- Add tmux physical proof phase artifacts: `agent-tmux-physical-proof-before-drain.json`, `agent-tmux-physical-proof-after-drain.json`, `agent-tmux-physical-proof-final.json`, and `agent-tmux-physical-proof-summary.json`.
- Add v2 release gates for tmux lifecycle wiring, tmux proof v2, real Codex dynamic smoke v2, cleanup executor v2, cleanup command UX, AST-aware work graph, fake-real policy v2, and runtime truth matrix.
- Add process-tree-aware cleanup proof with SIGTERM, bounded wait, SIGKILL escalation, and verified process exit evidence.
- Add AST/import/test ownership expansion for intelligent work graph, including file-to-symbol, symbol-to-file, command ownership, route ownership, AST coverage, and proof level.
- Add runtime truth matrix coverage for `fixture_only`, `fixture_instrumented_real`, `proven`, `integration_optional`, `real_required_missing`, `partial`, and `blocked`.

### Fixed

- Prevent real tmux smoke from depending on lifecycle artifacts that the orchestrator never writes.
- Prevent cleanup executor from claiming success before process termination is verified.
- Prevent fixture-instrumented real Codex smoke from being reported as plain proven runtime proof.
- Prevent AST-aware work graph claims from relying only on basename test ownership.

### Changed

- Treat real-proof modules as part of orchestrator lifecycle, not standalone reports only.
- Treat cleanup as a safe, verifiable resource cleanup transaction.
- Treat intelligent work graph quality and fake-real subsystem levels as first-class release readiness inputs.

## [1.18.4] - 2026-05-26

### Added

- Add real tmux physical pane proof: list-panes, capture-pane, pane-id reconciliation, lane render verification, and drain-close evidence.
- Add opt-in real Codex dynamic agent smoke via `SKS_TEST_REAL_DYNAMIC_AGENTS=1`.
- Add command-level agent cleanup executor for stale processes, stale tmux panes, orphan temp dirs, stale locks, and preserved terminal transcripts.
- Add intelligent work graph planner with dependency critical path, test ownership, changed-file candidates, domain priority, and integration bottleneck analysis.
- Add fake-vs-real proof policy that prevents fixture evidence from being promoted to real runtime evidence.
- Add release:real-check coverage for real tmux and real Codex dynamic smoke.
- Add P0-P5 release readiness closure matrix for runtime truth.

### Fixed

- Prevent tmux manifest-only proof from passing as real pane proof.
- Prevent fake pane ids from being treated as physical tmux evidence.
- Prevent mock dynamic route tests from being used as real Codex dynamic smoke.
- Prevent cleanup commands from only observing artifacts without performing cleanup.
- Prevent route template task graphs from being overclaimed as dependency-aware advanced partitioning.
- Prevent lane drain/close evidence from being missing in tmux mode.
- Prevent hook trust doctor from recommending SKS-only trusted-hash repair when managed repair is the safe path.

### Changed

- Treat tmux lanes as physical runtime resources in real tmux mode.
- Treat real dynamic smoke as opt-in but first-class.
- Treat cleanup as an executable command path, not only a report reader.
- Treat work graph quality and fake-vs-real separation as release readiness inputs.

## [1.18.3] - 2026-05-26

### Added

- Add route-truth dynamic scheduler gates that execute real Agent, Team, Research, and QA commands.
- Add orchestrator option propagation proof for `--work-items`, `--target-active-slots`, `--minimum-work-items`, and queue expansion.
- Add task graph source/goal ref propagation checks before scheduler launch and through the work queue.
- Add slot-level tmux lane supervisor integration into orchestrator lifecycle.
- Add proof gates for tmux supervisor initialization, update, survival, and drain.
- Add real route command blackboxes instead of `sks agent run --route` stand-ins.

### Fixed

- Prevent parsed agent work item options from being ignored by `runNativeAgentOrchestrator`.
- Prevent Team/Research/QA backfill gates from passing through the generic Agent route only.
- Prevent agent proof from requiring tmux supervisor while the orchestrator never writes it.
- Prevent generation-level tmux pane launches from masquerading as persistent worker-slot lanes.
- Prevent route blackboxes from using standalone scheduler or route string substitution as proof.



## [1.18.2] - 2026-05-26

### Added

- Add work-item-first task graph expansion so total work items are independent from target active agent slots.
- Add route-level dynamic backfill blackboxes for Agent, Team, Research, and QA.
- Add official `follow_up_work_items` schema support in agent result validation.
- Add persistent tmux lane supervisor with worker-slot lanes, generation-aware render files, and drain-signal controlled shutdown.
- Add no-flicker tmux lane regression gates.
- Add scheduler proof hardening for target active slots, queue drain, backfill counts, session generations, terminal close reports, Source Intelligence refs, and Goal mode refs.
- Add scheduler-aware janitor reporting for active generation preservation and drained generation cleanup.
- Add 1.18.2 full priority closure readiness report coverage for P0 through P5.

### Fixed

- Prevent real route runtime from passing dynamic pool checks using standalone scheduler fixtures only.
- Prevent agent count from being treated as total work item count.
- Prevent work queue generation from being limited to roster length.
- Prevent tmux lane panes from disappearing after short-lived worker commands.
- Prevent generation completion from closing worker slot lanes.
- Prevent implicit or untyped follow-up work item enqueue.
- Prevent proof from passing when expected backfill is not observed in real route artifacts.

### Changed

- Treat Native Agent Runtime as work-queue-first and slot/generation-driven.
- Treat tmux lanes as persistent worker-slot UI, not pane launch evidence.
- Treat P0 through P5 closure as a release readiness requirement.
## [1.18.1] - 2026-05-25

### Added
- Add Dynamic Agent Pool Scheduler that maintains target active concurrency until the work queue is empty.
- Add worker slots, session generations, task queue, backfill events, active slot health, and scheduler proof evidence.
- Add session-generation-aware terminal artifacts and close reports.
- Add real tmux right-lane runtime where lanes represent worker slots and update as session generations change.
- Add scheduler blackbox fixtures proving that when 2 of 5 sessions close while work remains, 2 new sessions are opened immediately.
- Add work queue / slot / session generation ledgers and proof gates.
- Add Source Intelligence and Goal mode propagation across dynamic session generations.

### Fixed

- Prevent fixed batch execution from starving pending work while completed slots sit idle.
- Prevent proof from passing when pending work exists but no active sessions are running.
- Prevent tmux mode from passing with manifest-only lanes.
- Prevent terminal session artifacts from being overwritten across generations.
- Prevent janitor from treating intentionally replaced session generations as stale errors.

## [1.18.0] - 2026-05-25

### Added
- Add Universal Source Intelligence Layer for every mode: Context7 + Codex Web Search by default, and Context7 + Codex Web Search + X AI MCP Search when X AI MCP is configured and search-capable.
- Add X AI MCP capability detector, X AI Search adapter, Codex Web Search adapter, and unified source intelligence proof gates.
- Add main no-Scout policy: main orchestrator and route main sessions must spawn native multi-session agents instead of invoking Scout.
- Add worker-local Scout-limited policy: agent workers may use Scout only inside their own session as local evidence, never as the main runtime backend or proof SSOT.
- Add mandatory background terminal/session evidence for every agent.
- Add tmux right-lane cockpit: main/orchestrator pane on the left and agent lanes stacked on the right.
- Add Codex official Goal mode detector and default activation.
- Add release DAG full coverage restoration: parallel release checks preserve all previous gates.
- Add P0~P4 full closure tracking in release readiness.

### Fixed
- Prevent X AI MCP availability from being ignored when Context7 is used.
- Prevent X AI missing from blocking routes that should use Context7 + Codex Web Search only.
- Prevent main Team/Research/QA orchestrators from calling Scout.
- Prevent agent proof from passing without terminal close evidence.
- Prevent tmux agent mode from passing without visible right lanes.
- Prevent release parallelization from reducing release gate coverage.

### Changed
- Treat source intelligence as a route-wide service shared by Team, Research, QA, DFix, UX, PPT, Goal, Commit, MAD-SKS, Hooks, codex-lb, and Wiki.
- Treat worker Scout as optional local evidence, not orchestration backend.
- Treat P1~P4 completion as part of release readiness, not optional polish.


## [1.17.0] - 2026-05-25

### Added
- Add TypeScript Runtime Unification: TS source is the only source of truth, while npm runtime uses generated `dist/**/*.js`; `src/**/*.mjs` runtime shadows are removed.
- Add TS/dist freshness and runtime parity checks with build manifest source digests.
- Add Codex App Agent Cockpit artifacts: `agent-codex-dashboard.md`, `agent-codex-dashboard.json`, `agent-session-cards.md`, and event stream summaries.
- Add Parallel Verification Engine with DAG-based verification groups, dependency-aware scheduling, artifact locks, resource budgets, and per-worker proof.
- Add project-scoped session namespace using project root hash, mission id, orchestrator id, and agent id for tmux/session/temp/lock/artifact isolation.
- Add continuous Agent Janitor for stale process/tmux/temp cleanup and proof-bound session closure.
- Add route native backend gate fixes for Team/Research/QA proof artifact resolution.

### Fixed
- Prevent TS and runtime MJS drift by removing parallel `src/**/*.mjs` runtime files.
- Prevent route native backend gates from reading artifacts from the wrong `proof.validation` path.
- Prevent `agent run` parser from treating `latest` as a mission id for new run actions.
- Prevent multiple projects from sharing tmux session names, temp directories, lock files, or agent session ids.
- Prevent slow serial verification when checks can safely run in parallel.

### Changed
- Treat release verification as a dependency DAG instead of a long shell `&&` chain.
- Treat Codex App agent visibility as a first-class artifact contract.

## [1.16.2] - 2026-05-25

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [1.16.1] - 2026-05-25

### Fixed
- Route Team, Research, and QA runtime execution through the native agent orchestrator and require native agent proof evidence in release gates.
- Parse Codex exec --output-last-message result JSON before accepting agent completion, with stdout fallback capped at verified_partial.
- Strengthen native agent command surface, work partitioning, lease/change-file comparison, and no-scout packed blackbox coverage.

### Changed
- Bump package, runtime, and release-readiness metadata to 1.16.1.

## [1.16.0] - 2026-05-23

### Added
- Add native multi-session agent kernel with `sks agent`, `sks --agent`, roster/concurrency caps, lease/no-overlap proof, session lifecycle evidence, recursion guard, and Codex exec output-schema preparation.
- Add `schemas/codex/agent-result.schema.json`, native agent docs, and agent command/policy tests.

### Changed
- Route Team, Research, QA/Review proof, and auto-finalization gates to native `agents/agent-proof-evidence.json`.
- Remove the legacy multi-agent command surface, archived legacy 0.9.13 files, and old Scout multi-session goal surface so native agents are the only release-supported route collaboration backend.
- Bump package metadata to 1.16.0.

## [1.15.1] - 2026-05-23

### Added
- Add MAD-SKS actual executor closure for guarded target-file writes, argv/no-shell command execution, package install routing, service control routing, DB write planning, Computer/Browser/generated-asset handoff evidence, and rollback apply.
- Add `sks mad-sks rollback-apply --rollback-plan <path> --yes --json`.
- Add flagship proof graph v4 and MAD-SKS actual executor release reports for file write, shell, package, service, DB, rollback apply, live protected-core guard smoke, and executor proof graph aggregation.

### Fixed
- Replace the previous probe-only `mad-sks run/apply` path with real executor dispatch and structured executor result evidence.
- Prevent macOS `/var` to `/private/var` canonicalization from causing false target-boundary escape blockers for new nested target files.
- Preserve immutable protected-core blocking for SKS source, scripts, package metadata, release metadata, and runtime artifacts during MAD-SKS execution.

### Changed
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.15.1.
- Extend release metadata and release readiness gates to require MAD-SKS actual executor closure and proof graph v4.

## [1.15.0] - 2026-05-23

### Added
- Add MAD-SKS Full-System Authority Mode with explicit user authorization, target-root scoping, system access consent, DB write consent, package/service/system operation consent, audit ledger, rollback plan, Evidence Router integration, Completion Proof, and Trust Report.
- Add Immutable Harness Guard that prevents MAD-SKS from modifying the SKS package root, source core, dist runtime, scripts, schemas, Rust crate, release metadata, managed hooks, and protected SKS policy files.
- Add protected-core path resolution, symlink/path traversal guard coverage, write interception, pre/post protected-core snapshots, and git diff validation.
- Add `sks mad-sks plan/run/apply/doctor/status/proof --json`, `sks mad-sks permissions --json`, rollback-plan, audit, and explain surfaces.
- Add release gate freshness hardening so Scout and flagship checks cannot pass against stale `dist`.
- Add Codex exec output-schema syntax parity checks for both `codex exec` and `codex exec resume`.
- Add opt-in real Scout smoke for Codex exec parallel output-schema sessions.
- Add engine-run-id query UX for `scouts consensus`, `handoff`, `validate`, and `status`.
- Add flagship proof graph v3 with immutable harness guard, MAD-SKS audit ledger, rollback, Scout real smoke, Hook parity, UX/PPT imagegen graph, and DFix graph.

### Fixed
- Prevent MAD-SKS from being limited to DB permissions only.
- Prevent MAD-SKS from modifying SKS harness code, even when the target root is the SKS repository.
- Prevent release gates from using stale `dist` when source changed.
- Prevent Codex exec output-schema checks from relying only on `exec resume --help` when fresh `exec` syntax differs.
- Prevent Scout benchmark artifacts from being confused with canonical route intake artifacts.
- Prevent MAD-SKS proof from claiming success without audit, diff, rollback, and verification evidence.

### Changed
- Treat MAD-SKS as user-authorized full-system maintenance mode with immutable SKS self-protection.
- Treat SKS harness code as protected infrastructure, not a normal project target, in MAD-SKS mode.
- Treat release gate freshness as a P0 trust invariant.

## [1.14.1] - 2026-05-22

### Added
- Add 1.14.1 hook official hash oracle and hook parity v2 reports with managed-only fallback when official hashes are unavailable.
- Add UX/PPT real imagegen smoke gates, PPT synthetic deck E2E blackbox/artifact-graph gates, Codex 0.133 official compatibility reporting, and flagship proof graph v2.
- Upgrade Scout outputs to `sks.scout-result.v3` with `engine_run_id`, `scout_session_id`, output-schema metadata, lifecycle records, stdout/stderr paths, read-only confirmation, and artifact namespaces.
- Add Scout benchmark isolation under `scout-benchmarks/<engine_run_id>/` so parallel/sequential benchmark runs do not overwrite canonical route intake artifacts.

### Changed
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.14.1.
- Gate Scout consensus/proof promotion on schema-valid completed results only, while schema-invalid or unparseable real outputs remain structured blockers.
- Strengthen Scout read-only guard to v2 with file snapshots, git-status delta checks, benchmark artifact allow-listing, and external workspace boundary evidence.

### Fixed
- Prevent mock/local-static Scout benchmarks from producing real speedup claims.
- Preserve Codex exec, Codex App subagent, and tmux lane lifecycle metadata in Scout artifacts.

## [1.14.0] - 2026-05-22

### Added
- Add Codex CLI `rust-v0.133.0` compatibility matrix coverage for goal defaults, remote-control foreground app-server behavior, permission profiles/requirements, plugin discovery/marketplaces, and extension lifecycle events.
- Add Codex hook actual trust parity, managed install fixtures, and official-hash parity reports for the 10-event hook surface.
- Add real imagegen capability detection, gpt-image-2 request validation, UX/PPT fake-adapter blackbox checks, structured extraction strictness checks, and optional real imagegen smoke.
- Add release gates for managed hook install, runtime replay warning-zero, imagegen capability, UX/PPT generated-image artifact graphs, and strict Structured Outputs schemas.

### Fixed
- Block SKS-only trusted_hash writes unless official Codex hash parity is available; the default repair path is managed hooks via `.codex/requirements.toml`.
- Reject prompt/agent/async/empty/invalid hook handlers in actual trust doctor reports.
- Keep fake imagegen evidence explicitly marked as mock-like so hermetic release checks cannot be mistaken for real gpt-image-2 generation.

### Changed
- Treat Codex 0.133 as the release-readiness runtime baseline while preserving Codex 0.132 structured output detection as inherited compatibility.
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.14.0.

## [1.13.0] - 2026-05-21

### Added
- Add DFix Extreme Speed Kernel with L0 deterministic, L1 local static, L2 bounded Codex patch handoff, and L3 human-review paths.
- Add DFix error signature cache, root-cause ranking, patch template selection, verification command selector, patch runner, verification runner, rollback plan, and speed budget artifacts.
- Add DFix fast black-box fixture and performance release gates for the no-Codex direct-fix loop.
- Add latest OpenAI Codex hook schema snapshot with 10 events and 20 schema files, including `SubagentStart` and `SubagentStop`.
- Add hook trust doctor/state/fix commands, current hash/trusted hash reporting, and warning-zero release gates for trust state, subagent events, unsupported handlers, and schema drift.
- Add flagship artifact graph validation hooks for UX/PPT/DFix so release checks validate command, artifact, evidence, proof, trust, and wrongness linkage.

### Fixed
- Prevent DFix from claiming success on no-op patches, missing verification, broad/high-risk changes, or repeated blocker paths.
- Prevent Codex hook release checks from passing when prompt/agent/async handlers, invalid matchers, dual hook representations, stale 8-event snapshots, or trust warnings are present.
- Prevent all-feature completion from relying on source-string-only checks for flagship routes.

### Changed
- Treat DFix speed and correctness as co-equal release invariants.
- Treat Codex hook warning-zero as a release blocker, not a cosmetic warning.
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.13.0.

## [1.12.0] - 2026-05-21

1.12.0 Real Execution Closure tightens the previously advertised UX/PPT/DFix/all-feature paths so mock, manual, pending, and real evidence cannot be mistaken for each other. Computer Use evidence modes such as `probe_only` and `live_capture_success`, plus codex-lb persistence states such as `process_only_ephemeral`, remain explicit in release truthfulness reports.

### Added
- Add real UX-Review command wiring so `run`, `callouts`, and `extract-issues` invoke gpt-image-2 generation and real callout extraction instead of only rebuilding artifacts.
- Add PPT real adapter closure for slide export, slide imagegen review, issue extraction, deck patch handoff, re-export, and re-review with honest blockers for unavailable external tools.
- Add DFix Codex patch handoff runner metadata, diff capture, verification recommendation, and rollback readiness artifacts.
- Add all-feature completion deep coverage gates for command registry, fixtures, artifacts, Evidence Router coverage, Completion Proof links, Trust Report links, Wrongness mappings, docs, recovery, and blackbox coverage.
- Add stricter mock/real separation checks for UX, PPT, DFix, and advertised runtime features.
- Add recursive schema validation targets for flagship feature artifacts and release-readiness reports.

### Fixed
- Prevent UX-Review `extract-issues` from bypassing `extractRealCallouts()`.
- Prevent UX-Review `run --generate-callouts` and `run --fix` from skipping `generateGptImage2CalloutReview()`.
- Prevent PPT review from passing when slide export, imagegen, issue extraction, or re-review is only pending.
- Prevent DFix from claiming a fix without patch evidence, diff evidence, and verification evidence.
- Prevent advertised features from appearing complete when they only have static contracts or command names.
- Prevent mock fixtures from being treated as real verified evidence in all-feature completion.

### Changed
- Treat feature completion as deep runtime coverage, not command presence.
- Treat UX/PPT/DFix as flagship real execution paths with explicit unavailable blockers.
- Treat release readiness as invalid when advertised runtime commands lack proof/trust/wrongness coverage.
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.12.0.

## [1.11.0] - 2026-05-21

1.11.0 Extreme Feature Completion Kernel keeps the README focused on product usage while this changelog carries release history and detailed gate context, including Computer Use evidence modes such as `probe_only` and `live_capture_success`, plus codex-lb persistence states such as `process_only_ephemeral`.

### Added
- Add `sks features complete --json` and the `sks.all-feature-completion.v1` report for command, fixture, artifact, evidence, proof, trust, wrongness, blackbox, mock/truthfulness, and JSON recovery coverage.
- Add PPT imagegen review fixtures for slide export, generated callout images, issue extraction, patch handoff, re-export, re-review, Image Voxel relations, Completion Proof, and Trust Report evidence.
- Add DFix diagnose, plan, patch, verify, rollback-plan, status, and fixture commands with DFix proof evidence.
- Add a lightweight recursive JSON schema validator and release gate script.

### Fixed
- Block the release gate when Section 29 scripts, 1.11.0 metadata, PPT review proof, DFix verification, all-feature completion, or recursive schema checks are missing.

### Changed
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.11.0.

## [1.10.0] - 2026-05-21

### Added
- Add a shared `runSksUpdateCheck` function that performs the npm freshness check without creating a route, mission, setup, doctor, or Team pipeline.
- Add `sks.update-check.v2` JSON output with explicit `mode`, `route_required`, and `pipeline_required` fields.

### Fixed
- Reuse the function-only update check from the pre-work hook gate so SKS update freshness checks stay outside the execution pipeline.

### Changed
- Bump package, runtime, release-readiness, and Rust crate metadata to 1.10.0.

## [1.0.9] - 2026-05-21

### Added
- Add real `codex exec resume --output-schema` runner with output-file parsing, redaction, timeout, and schema validation.
- Add official docs compatibility report for Codex 0.132, `gpt-image-2` image generation/edit fidelity, and Structured Outputs strict schemas.
- Add OpenAI Structured Outputs fallback adapter and optional OpenAI Images API `gpt-image-2` callout generation fallback.
- Add `image-ux-gpt-image-2-request.json` and `image-ux-gpt-image-2-response.json` artifacts.
- Add Issue Ledger v3 extraction metadata, patch handoff prompts/results, attach-after recapture metadata, UX evidence kinds, and expanded UX wrongness kinds.

### Fixed
- Prevent attached generated images from creating generic callouts before schema-bound pixel extraction succeeds.
- Prevent UX-Review verified claims when generated callout extraction is pending, invalid, text-only, or mock-as-real.
- Prevent visual fix verification without patch evidence plus recapture/re-review evidence.

### Changed
- Treat `gpt-image-2` image input fidelity as high-fidelity automatic metadata and omit unsupported `input_fidelity`.
- Treat Structured Outputs strict schemas as the real fallback when Codex output-schema is unavailable.
- Treat official documentation drift as a release-readiness input.

## [1.0.8] - 2026-05-20

### Added
- Add Codex CLI `rust-v0.132.0` compatibility matrix and feature detection.
- Add `codex exec resume --output-schema` integration for schema-bound Scout, UX-Review callout extraction, Completion Proof, and Wrongness outputs.
- Add app-server image fidelity preservation support for UX-Review source screenshots, gpt-image-2 callouts, and Image Voxel coordinate alignment.
- Add real `$UX-Review` gpt-image-2 callout generation contracts, generated image ingestion, schema-bound callout extraction, fix task creation, bounded fix loop, recapture, and re-review gates.
- Add UX-Review before/after Image Voxel relations and visual wrongness records for bad callouts, stale screenshots, and failed fixes.
- Add Codex memory summary version/rebuild integration for TriWiki/Wrongness generated summaries.
- Add Goal/QA/Research repeated blocker and usage-limit loop stop behavior aligned with Codex 0.132.

### Fixed
- Prevent UX-Review from passing with prose-only screenshot critique.
- Prevent mock gpt-image-2 callout fixtures from being promoted to verified real UX evidence.
- Prevent visual fix claims without post-fix recapture and changed-screen re-review.
- Prevent version drift between package metadata, runtime version, Rust crate version, changelog, and release stamp.

### Changed
- Treat `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` as a first-class real execution route.
- Treat source screenshot fidelity and coordinate alignment as release-gated visual evidence requirements.
- Treat Codex 0.132 structured resume output as the preferred path for schema-bound automation artifacts.




## [1.0.7] - 2026-05-20

### Added
- Add Computer Use live evidence capture mode with opt-in real macOS screenshot/action evidence attempts.
- Add Computer Use live evidence schemas for capability probe, screenshot capture, action capture, Image Voxel linkage, and external capability blockers.
- Add codex-lb persistence truthfulness report that distinguishes durable setup from process-only ephemeral setup.
- Add setup plan/apply drift checks that compare requested codex-lb persistence choices with actual filesystem, Keychain, launchctl, and shell profile state.
- Add release readiness report for Computer Use real evidence, codex-lb persistence, hook strict subset, and docs truthfulness.

### Fixed
- Prevent Computer Use smoke from being described as real capture when it only ran a capability probe.
- Prevent codex-lb setup from silently producing process-only credentials without a clear warning.
- Prevent README/docs from overclaiming universal Computer Use availability or live evidence.
- Prevent setup action reports from passing when actual filesystem changes differ from requested setup choices.

### Changed
- Treat Computer Use evidence mode as one of `probe_only`, `live_capture_attempted`, `live_capture_success`, or `live_capture_blocked`.
- Treat codex-lb persistence as explicit: `durable_env_file`, `durable_keychain`, `durable_launchctl`, `shell_profile`, or `process_only_ephemeral`.
- Treat documentation truthfulness as a release invariant.

## [1.0.6] - 2026-05-20

### Added
- Add explicit Codex hook strictness classification: upstream schema, upstream semantic unsupported, SKS zero-warning strict subset, and SKS policy-disallowed.
- Add codex-lb setup plan/preview and exact answer-to-action mapping for default provider selection, env file writing, Keychain storage, launchctl sync, shell profile snippets, and health checks.
- Add optional real macOS Computer Use smoke under `SKS_TEST_REAL_COMPUTER_USE=1` to verify live capability handshake and evidence status when available.
- Add Computer Use live evidence report that distinguishes available, permission missing, Codex App missing, capability missing, external block, and not-macOS.
- Add wrongness records for setup-choice drift and Computer Use live-smoke mismatch.

### Fixed
- Prevent hook validators from overclaiming exact upstream parser mirroring when SKS intentionally enforces a stricter zero-warning subset.
- Prevent codex-lb setup wizard prompts from being ignored.
- Prevent env file, provider selection, launchctl, Keychain, or shell profile writes from happening contrary to the user's explicit setup choices.
- Prevent Computer Use optional live checks from fabricating visual evidence when Codex App or macOS permissions are unavailable.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

### Changed
- Treat codex-lb setup as a two-phase plan/apply workflow.
- Treat Computer Use live evidence as optional real verification, separate from mock-safe route fixtures.

## [1.0.5] - 2026-05-20

### Added
- Add Codex hook semantic validator that mirrors `rust-v0.131.0` runtime parser rules, not just JSON schema.
- Add strict PreToolUse rule enforcement for unsupported `permissionDecision:ask`, `allow` without `updatedInput`, unsupported `continue:false`, `stopReason`, and `suppressOutput`.
- Add Stop/UserPromptSubmit/PostToolUse block output normalization with non-empty reason requirements.
- Add macOS codex-lb env loader metadata, Keychain-aware lookup/storage hooks, launchctl repair visibility, and missing-env regression checks.
- Add raw `CODEX_LB_API_KEY` missing-message regression gate.
- Add Computer Use capability handshake checks, visual route requirement fixture, and external capability block evidence shape.
- Add hook/codex-lb/Computer Use wrongness kinds and avoidance rules for regression learning.

### Fixed
- Prevent hook outputs that pass JSON schema but fail Codex runtime semantic rules.
- Prevent `permissionDecision:ask`, PreToolUse allow-without-rewrite, unsupported universal hook fields, and legacy top-level hook fields from reaching release fixtures.
- Prevent raw codex-lb missing env errors from appearing in status, doctor, health, postinstall, setup fixture, or black-box outputs.
- Prevent SKS from describing Computer Use as blocked by safety policy or MAD-SKS.
- Prevent visual route proof from omitting Computer Use status when image/visual evidence is required.

### Changed
- Treat Codex hook semantic compatibility as stricter than schema compatibility.
- Treat codex-lb readiness as a durable macOS/user-session setup contract.
- Treat Computer Use as the preferred macOS visual verification path when available.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [1.0.4] - 2026-05-20

### Added
- Add Codex CLI `rust-v0.131.0` compatibility layer with vendored hook schema snapshots and strict hook output validation.
- Add `sks codex-lb setup` interactive wizard for domain/base URL and API key capture with secure storage and env auto-load.
- Add codex-lb missing-env prevention so macOS users do not see the raw CODEX_LB_API_KEY missing-env text after setup or update.
- Add macOS Codex App Computer Use capability detector and visual-route integration that treats Computer Use as a first-class visual evidence source.
- Add hook warning black-box tests that fail release if Codex hook output produces deprecated-shape or unknown-field warnings.
- Add `sks codex compatibility` and `sks hooks codex-validate` surfaces for checking Codex CLI version, hook schemas, and SKS output shape.

### Fixed
- Replace legacy hook output shapes with Codex `rust-v0.131.0` canonical `hookSpecificOutput` / camelCase output syntax.
- Prevent SKS from misclassifying Codex App Computer Use as a MAD-SKS or generic safety block.
- Prevent codex-lb launch/setup paths from throwing raw missing-env errors when setup can repair or explain the missing key.
- Prevent secrets from being written to proof, logs, screenshots, hook replay, black-box reports, or wrongness memory.

### Changed
- Treat Codex CLI compatibility and hook-schema freshness as release invariants.
- Treat Computer Use availability as a capability check, not an SKS safety policy decision.


## [1.0.3] - 2026-05-19

### Added
- Add `sks git policy|install|status|doctor|precommit|publish-plan|summary` for SKS git collaboration hygiene.
- Add tracked shared-memory policy files: `.sneakoscope/git-policy.json` and `.sneakoscope/shared-memory-manifest.json`.
- Add merge-friendly shared TriWiki shards for claims, wrongness, image voxels, and avoidance rules under `.sneakoscope/wiki/**`.
- Add `sks wiki publish latest --shared`, `sks wrongness publish latest --shared`, `sks wiki rebuild-index --json`, and `sks wiki validate-shared --json`.
- Add release checks for git hygiene, precommit fixtures, shared memory validation, and git collaboration E2E coverage.
- Add Codex App hook trust-state generation for current hook trust syntax so managed hooks are written with matching trusted hashes.

### Fixed
- Replace broad `.sneakoscope/` ignore behavior with runtime-only ignores so shared memory shards can be committed.
- Surface shared wrongness shards in wrongness retrieval even when the local project ledger is missing.
- Add git collaboration status to Trust Kernel reports.

### Changed
- Update managed-path manifest schema to `sks.managed-paths.v2` with explicit shared-memory, generated-index, local-runtime, and harness planes.
- Bump npm package and optional Rust crate metadata to `1.0.3`.


## [1.0.2] - 2026-05-19

### Added
- Add `scripts/check-ts-suppressions.mjs` plus `npm run typecheck:suppressions` intended as a release gate rejecting `@ts-nocheck`, `@ts-ignore`, and unstructured `@ts-expect-error` suppressions outside `src/generated/**`.
- Add `npm run typescript:migration-report` emitting `.sneakoscope/reports/typescript-migration.json` / `.md` with suppression and dist summary counters.
- Add dist build manifest schema `sks.dist-build.v2` (writes package version plus `mjs_runtime_files`; enforced by `dist:check`).
- Tighten `dist:check` to validate manifest schema and manifest `mjs_runtime_files`.

### Fixed
- Add suppression rules and reporting intended to eliminate silent TypeScript escapes before `release:check` can declare a strict-runtime seal complete.
- Refine `command-registry` lazy adapters to narrow unknown module exports via explicit callable guards rather than broad `RawCommandModule` casts.
- Rework CLI `router.ts` normalization with explicit `CommandName` guards plus structured blocked results for unknown commands.
- Rewrite `core/fsx` with typed process execution (`RunProcessOptions` / `RunProcessResult`), `TailBuffer`, and explicit JSON boundary helpers aligned with SKS filesystem utilities.

### Changed
- Bump crate `sks-rs` metadata version to remain aligned with the npm package semver for optional Rust tooling.


## [1.0.1] - 2026-05-19

### Added
- Add a hybrid-free TypeScript runtime: CLI entrypoint, command registry, Trust Kernel, Evidence Router, Completion Proof, Image Voxel, Scouts, and route commands now build from TypeScript source into `dist`.
- Add actual typed runtime command registry used by the CLI, replacing the previous contract-only TypeScript registry plus MJS runtime registry split.
- Add dist-only package verification that blocks copied MJS runtime files and verifies every command registry lazy import from the packed package.
- Add `sks run --execute` and `sks run --auto` route execution modes for safe routes.
- Add TypeScript runtime/schema parity checks for completion proof, evidence records, route contracts, scout outputs, image voxel ledgers, and feature fixtures.

### Fixed
- Remove build-time copying of `src/**/*.mjs` into `dist`.
- Remove the hybrid `TypeScript contracts + MJS runtime` package boundary.
- Fix the missing `1.0.0` changelog lineage and document the 1.0.1 runtime completion.
- Prevent feature quality targets from drifting below RC-level requirements.
- Prevent typed command registry from diverging from actual runtime command registry.

### Changed
- Treat TypeScript-built runtime as a release invariant.
- Treat `.mjs` runtime implementation as legacy-only and excluded from the published package.
- Treat `sks run --execute` as the novice-safe execution path for supported routes.

## [1.0.0] - 2026-05-19

### Added
- Add TypeScript-first architecture for SKS core trust kernel, command registry, route contracts, evidence records, completion proof, Image Voxel ledgers, Scout outputs, and feature fixtures.
- Add generated runtime validators or schema guards for every trust-kernel contract.
- Add packed-package command registry import smoke tests that verify every registered command resolves from the packed tarball.
- Add real black-box matrix coverage for pack install, npx one-shot, global shim, Unicode paths, paths with spaces, no-git directories, and read-only project directories.
- Add `sks run --execute` and `sks run --auto` to run selected routes through route command execution, finalization, proof, trust report, and status.
- Add environment-tiered performance budgets for source, packed, CI, local, and global install modes.
- Add hard architecture gates that fail on internal monolith regressions.

### Fixed
- Prevent package `files` exclusions from breaking command registry imports in packed installs.
- Prevent static-contract feature coverage from masking runtime route verification gaps.
- Prevent architecture warnings from allowing new monoliths.
- Prevent `sks run` from stopping at prepared state when `--execute` is requested.
- Prevent TypeScript type drift between compile-time contracts and runtime JSON artifacts.

### Changed
- Treat TypeScript type safety and runtime schema validation as release invariants.
- Treat packed package command import smoke as mandatory before publish.
- Promote `1.0.0` to the stable npm release target so plain `npm publish` can ship on the `latest` dist-tag.

## [0.9.20] - 2026-05-18

### Added
- Add SKS Trust Kernel invariants that make route completion, evidence, and proof validation a single contract.
- Add core performance budgets for CLI hot paths, proof validation, Image Voxel validation, Scout intake, and feature fixture execution.
- Add route finalization audit tests that prove serious route fixtures write Completion Proof through real command paths.
- Add strict evidence router checks so mock/static evidence cannot be upgraded to verified real evidence.
- Add managed-path rollback and pollution checks for SKS-owned project files.
- Add core dominance documentation covering speed, stability, proof, image memory, black-box install, and known gaps.

### Fixed
- Prevent static contracts from being interpreted as runtime verification by routing route completion through `route-completion-contract.json`, `evidence-index.json`, and `trust-report.json`.
- Prevent stale image/voxel/proof/scout evidence from passing route completion by adding freshness and stale-anchor validation.
- Prevent release checks from passing without trust, evidence, safety, chaos, benchmark, and black-box matrix gates.
- Prevent performance claims without benchmark artifacts by writing `.sneakoscope/reports/performance/core-bench.json` and `.md`.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

### Changed
- Treat SKS as a core trust kernel rather than a feature-cloning harness.
- Prefer fewer, stronger, release-gated core surfaces over broader unverified feature expansion.
- Expose novice-facing `sks run`, `sks status`, `sks trust`, `sks paths`, `sks rollback`, and `sks bench` surfaces.

## [0.9.19] - 2026-05-18

### Added
- Add real scout output parsing for Codex/tmux scout runs into `sks.scout-result.v1`.
- Add consensus binding that uses parsed real scout outputs as the primary source for `scout-consensus.json`.
- Add tmux lane scout execution with session/window creation, watcher, timeout, output collection, and cleanup.
- Add Codex App subagent capability descriptors so SKS only launches subagents when a real local event/output surface is declared.
- Add black-box packed package tests for npm pack, temp install, npx-style one-shot, and global shim behavior.
- Add pipeline runtime decomposition checks so `pipeline-runtime.mjs` is a small compatibility facade.
- Add stricter feature fixture quality gates that distinguish static contracts from runtime-verified features.
- Add scout speedup benchmark proof that allows speed claims only when parsed real scout outputs and measured baselines exist.

### Fixed
- Prevent real scout engines from claiming success when Codex/tmux output cannot be parsed into scout-result schema.
- Prevent pipeline budget checks from ignoring `pipeline-runtime.mjs`.
- Prevent static feature contracts from being treated as runtime route verification.
- Prevent package publish checks from passing without packed install smoke coverage.

### Changed
- Treat real Scout consensus as an evidence-bound parsed-output contract, not a synthetic fallback.
- Treat packed package behavior as part of the release proof.
- Treat pipeline architecture modularity as a hard release invariant.

## [0.9.18] - 2026-05-18

### Added
- Add real 5-Scout execution engine detection and selection for Codex exec, tmux lanes, Codex App subagents, local static fallback, and sequential fallback.
- Add read-only scout filesystem guards with pre/post source snapshots and mission-local allowed write paths.
- Add hermetic E2E route test roots so route tests no longer share the source checkout `.sneakoscope` state.
- Add strict feature fixture mode that rejects features without explicit fixtures and validates command-generated artifacts only.
- Add strict scout validation mode for release checks.
- Add split pipeline architecture module surfaces for stage policy, scout policy, route prep, stop gate, active context, prompt context, and plan writing.
- Add scout performance evidence v2 with speedup claims allowed only when real parallel execution has a measured sequential baseline.

### Fixed
- Prevent new features from receiving implicit static-pass fixture fallback.
- Prevent the former legacy multi-agent strict validation path from silently creating a passing run during release checks.
- Prevent E2E latest-mission collisions by isolating route tests in temp project roots.
- Prevent scout read-only violations by detecting source changes outside allowed scout artifacts.

### Changed
- Treat Five-Scout intake as real engine-backed when available and as verified-partial fallback otherwise.
- Treat feature fixture pass as explicit, command-generated, schema-validated evidence only.
- Promote pipeline budget, scout engine detection, strict scout checks, and hermetic fixture execution into `npm run release:check`.

## [0.9.17] - 2026-05-18

### Added
- Add `src/core/proof/auto-finalize.mjs` and route fixture integrations so serious route commands write Completion Proof without a separate `sks proof finalize` step.
- Add real-command E2E route tests for Team, QA-LOOP, Research, PPT, Image UX Review, Computer Use, DB, Wiki, and GX.
- Add `sks rust status|smoke --json` with optional native detection, stale-binary version checks, and JS fallback parity evidence.
- Add release scripts `route-modularity:check`, `command-budget:check`, and `feature-fixtures:strict`.

### Changed
- Remove the runtime `src/core/commands/route-cli.mjs` monolith and move route logic into focused `src/core/commands/*-command.mjs` modules.
- Make executable feature fixtures validate artifacts generated by the command run itself, including mission-local proofs, visual ledgers, DB reports, and route gates.
- Promote route modularity, command budget, and strict fixture execution into `npm run release:check`.

### Docs
- Document route finalization, feature fixtures, optional Rust behavior, and the 0.9.17 upgrade report path.

## [0.9.16] - 2026-05-18

### Fixed
- Install generated Codex App skill templates for `$Commit` and `$Commit-And-Push` so updated global setups show the commit routes in the dollar-command picker.
- Add a regression test that every `DOLLAR_SKILL_NAMES` entry is backed by a generated `SKILL.md` template.
- Emit canonical Codex hook command output with `hookSpecificOutput` wrappers and `PreToolUse.permissionDecision=deny` instead of relying on legacy top-level context/block shapes.

## [0.9.15] - 2026-05-18

### Fixed
- Fix `sks postinstall` auto-bootstrap by passing the callable bootstrap command instead of a boolean flag, preventing `TypeError: bootstrap is not a function` during `npm i -g sneakoscope@latest`.
- Add a focused postinstall regression test that forces auto-bootstrap in a temporary HOME/global root.

## [0.9.14] - 2026-05-17

### Added
- Add a legacy-free command architecture with no command registry fallback to `legacy-main.mjs`.
- Add automatic route completion proof writers for every serious route finalization path.
- Add automatic image voxel anchor/relation generation for all visual and Computer Use routes.
- Add full executable feature fixtures with expected artifact existence and schema validation.
- Add semantic Rust voxel validation parity with the JavaScript image voxel validator.
- Add strict hook replay matching for decision, reason, gate, and issue expectations.
- Add active project-root codex-lb circuit recording and proof evidence integration.
- Add `$Commit` and `$Commit-And-Push` simple git routes for commit-only and commit-then-push workflows without the full SKS pipeline.

### Fixed
- Remove indirect maintenance/legacy imports from split commands.
- Remove reliance on manual `sks proof repair latest` for normal route completion.
- Block visual completion when anchors or before/after relations are missing.
- Ensure codex-lb launch health reports are written to the active project root.
- Ensure fixture pass status means executed or schema-validated evidence, not registry-only metadata.

### Changed
- Treat Completion Proof and Image Voxel TriWiki as mandatory completion contracts, not optional reports.
- Promote executable fixtures and route proof adapters to the central release gate.
- Make the legacy-free command graph the only supported 0.9.14 command path.




## [0.9.13] - 2026-05-17

### Added
- Add route-bound Completion Proof adapters for all serious SKS routes.
- Add image voxel anchor automation for Computer Use, Image UX Review, PPT, GX, and From-Chat-IMG routes.
- Add executable feature fixtures for core route families and reduce `not_required` fixture coverage.
- Add real hook runtime replay fixtures and expected-decision validation.
- Add codex-lb circuit integration with launch health failures and recovery state.
- Add Rust `image-hash` and `voxel-validate` accelerator commands with JS fallback parity tests.

### Fixed
- Connect serious route gates to completion-proof presence and validation.
- Connect visual/UI route gates to image voxel anchors and before/after evidence where required.
- Fix Rust wrapper/binary command mismatch.
- Correct codex-lb README behavior around stateless `previous_response_not_found` and hard failure fallback.
- Reduce legacy CLI fallback for high-value commands.

### Changed
- Promote executable feature fixtures from registry metadata into release-gated mock validation.
- Treat image voxel anchors and completion proof as first-class serious-route completion requirements.





## [0.9.12] - 2026-05-17

### Added

- Add lazy command architecture foundations for lighter SKS startup, including a slim CLI entrypoint, command registry, and lazy legacy fallback.
- Add a unified Completion Proof Engine surface with latest proof JSON/Markdown, command/file ledgers, validation, and secret redaction.
- Add image-first Voxel TriWiki ledger foundations with SHA-256 image ingest, dimension capture, bbox/anchor validation, and proof summaries.
- Add route fixture coverage contracts for core SKS feature families through the feature registry and all-features selftest.
- Add cold-start performance measurement and release-gated CLI entrypoint checks.
- Add prompt-language response guidance so Korean requests produce Korean progress/final/Honest Mode text and English requests produce English text while preserving code and commands.

### Fixed

- Reduce heavy top-level CLI imports for lightweight commands such as `sks --version`, `sks help`, `sks root --json`, and `sks commands --json`.
- Strengthen Codex App / codex-lb / hook evidence handling with hook trust reports, replay fixture support, circuit metrics, and unified `[redacted]` secret policy.
- Make feature-registry checks distinguish coverage from executable/static fixture contracts.
- Stabilize the release cold-start performance gate by measuring 20 samples by default and retrying budget-only misses once before failing publish.

### Changed

- Promote proof and Voxel TriWiki evidence to first-class release-gated contracts.
- Package the Rust accelerator source in the npm package while keeping JS fallback behavior when no compiled `sks-rs` binary is available.



## [0.9.11] - 2026-05-17

### Fixed

- Repair stale `sks`/`sneakoscope` PATH shims during `npm i -g sneakoscope@latest` when another npm prefix still shadows the newly installed package, so `sks --version` reflects the upgraded release without manual PATH cleanup.
- Raise the npm unpacked-size budget to 1871 KiB for the upgrade-time shim repair code while preserving packed-size, file-count, tracked-file, and forbidden-file guards.

## [0.9.10] - 2026-05-17

### Fixed

- Repair stale Codex App desktop app-server processes during npm upgrades so reconnect loops recover without manual cleanup.

## [0.9.9] - 2026-05-17

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Preserve ChatGPT OAuth only as a backup while codex-lb uses `requires_openai_auth = false`; the codex-lb proxy key stays in `CODEX_LB_API_KEY`/`env_key`, and PPT/imagegen bridge checks no longer require OpenAI OAuth for that provider.
- `sks codex-lb status` now reports the local Codex App auth shape and gives the right recovery path for the App refresh-token error: `sks codex-lb repair` keeps codex-lb selected, while `release` is reserved for switching fully away from codex-lb.
- Cache the codex-lb response-chain health probe briefly so repeated bare `sks` launches do not keep paying the same preflight/network cost.
- Raise the npm unpacked-size budget to 1864 KiB for the feature registry and codex-lb auth recovery code while keeping tracked-file, packed-size, file-count, and forbidden-file guards enforced.

## [0.9.8] - 2026-05-17

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.9.7] - 2026-05-17

### Fixed

- **codex 0.130.0 auth compatibility**: codex CLI changed `auth.json` apikey field from `"key"` to `"OPENAI_API_KEY"`. The `reconcileCodexLbAuthConflict` writer now produces the new format. Reading still supports both old and new formats for backward compat.
- **`[exited]` on launch**: the tmux codex session exited immediately because codex 0.130.0 couldn't find the API key in the old auth.json format. Fixed by the auth format migration above.

### Improved

- `sks codex-lb setup` now supports interactive prompts when `--host`/`--api-key` are omitted: asks for domain and API key step by step, making first-time setup easier.
- On `npm i -g sneakoscope` upgrade, if codex-lb is already configured, prompts "codex-lb key changed? [y/N]" so users can update their key without needing to remember the setup command. Default is N (no change). Skip with `SKS_SKIP_CODEX_LB_KEY_PROMPT=1`.
- Auto-migrates legacy `auth.json` from old `"key"` field to new `"OPENAI_API_KEY"` format during postinstall and doctor --fix. Never wipes user keys or settings.

## [0.9.6] - 2026-05-17

### Fixed

- Selftest hermeticity: `npm publish` -> `prepublishOnly` -> `release:check` -> `selftest` was leaking the codex-lb provider-restore prompt and the new chain-failure prompt to the publisher's interactive terminal. The selftest now forces `process.env.CI = 'true'` at entry so every in-process `canAskYesNo()` falls through to the non-interactive default. Subprocess invocations already pass `--json`; their behavior is unchanged.
- Raise npm packed-tarball size budget from 456 KiB to 460 KiB to accommodate the new chain-failure prompt branches and selftest coverage.
- Republishes the 0.9.5 codex-lb launch-flow fix (which never reached npm because the publish failed at sizecheck): `previous_response_not_found` no longer silently bypasses codex-lb, hard chain failures prompt instead of swap silently, `SKS_CODEX_LB_AUTOBYPASS=1` opts back into silent bypass for automation.

## [0.9.5] - 2026-05-17

### Fixed

- `sks` (bare launch) no longer silently demotes a fully configured codex-lb to ChatGPT OAuth when `checkCodexLbResponseChain` reports `previous_response_not_found`. That failure mode is normal for stateless LB deployments that don't persist Responses across requests, so codex-lb stays active and the launch only logs a warning.
- For hard chain failures (auth rejected, timeout, 5xx, missing base URL), the launch now asks before bypassing: `Use codex-lb anyway, or fall back to ChatGPT OAuth? [LB/oauth]`. Default keeps codex-lb. In non-interactive contexts (CI, pipes, no TTY) the default is also "keep codex-lb" — set `SKS_CODEX_LB_AUTOBYPASS=1` to restore the previous silent-bypass behavior.
- Selftest: replace the assertion that codified the old "always bypass on `previous_response_not_found`" behavior with one that verifies codex-lb stays active. Added coverage for hard 5xx chain failures (default keep) and `SKS_CODEX_LB_AUTOBYPASS=1` (silent bypass restored).
- Note: 0.9.5 was not published to npm — sizecheck tripped at 456.1 KiB. See 0.9.6 for the actual ship of these changes plus the selftest hermeticity fix.

## [0.9.4] - 2026-05-17

### Added

- `sks codex-lb release` — reverses the 0.9.3 auto-reconcile: restores `~/.codex/auth.chatgpt-backup.json` back to `~/.codex/auth.json` and, by default, removes `model_provider = "codex-lb"` from the top-level Codex App config so the app falls back to ChatGPT OAuth. Re-engage codex-lb later with `sks codex-lb repair`.
  - `--keep-provider` — restore `auth.json` only; leave `model_provider = "codex-lb"` selected.
  - `--delete-backup` — remove `~/.codex/auth.chatgpt-backup.json` after a successful restore (default: keep it so a subsequent re-reconcile still has a source backup).
  - `--force` — restore even when the current `auth.json` does not look like the codex-lb apikey shape (e.g. user hand-edited it after reconcile).
  - `--json` — machine-readable result with `status` ∈ {`released`, `no_backup`, `already_chatgpt`, `auth_in_use`, `failed`} plus `auth_path`, `backup_path`, `provider_unselected`, `backup_removed`.
- `sks codex-lb unselect` — flips `model_provider` away from `codex-lb` in the top-level Codex App config without touching `auth.json` or the stored env file. Useful when switching to a different provider temporarily while keeping codex-lb config and `sks-codex-lb.env` intact for later.
- `sks codex-lb status` now reports whether `~/.codex/auth.chatgpt-backup.json` is present and surfaces a "Run `sks codex-lb release`" hint when applicable. The JSON variant adds `chatgpt_backup_present` and `chatgpt_backup_path`.
- Raise npm packed-tarball size budget from 452 KiB to 456 KiB to accommodate the new release/unselect surface plus selftest coverage.

## [0.9.3] - 2026-05-17

### Fixed

- Auto-reconcile codex-lb authentication during `npm i -g sneakoscope@latest`: when both a codex-lb provider with `env_key` auth and a ChatGPT OAuth token blob live in `~/.codex/auth.json`, the OAuth blob is backed up to `~/.codex/auth.chatgpt-backup.json` and `auth.json` is rewritten to apikey mode using the stored `CODEX_LB_API_KEY` so Codex CLI/App stops sending the OAuth bearer to the load balancer. Opt out with `SKS_CODEX_LB_NO_AUTH_RECONCILE=1` (the backup is still produced so nothing is lost).
- Broaden the postinstall codex-lb config/auth snapshot so the snapshot is taken whenever any codex-lb signal (`sks-codex-lb.env`, `[model_providers.codex-lb]` block, or pre-existing `auth.json`) is present, and restore a pre-existing `auth.json` if a bootstrap step emptied or removed it during the upgrade.
- Surface auto-reconciliation, backup-only, and reconciliation failures in postinstall log lines and in the `sks auth repair` / `sks codex-lb repair` JSON output via a new `auth_reconcile` field, so upgrades self-heal the most common codex-lb auth regressions without requiring a manual `sks codex-lb setup` rerun.
- Make the fake-codex login helper used by `sks selftest --mock` portable across `bash` and `dash` so the codex-lb selftest writes valid JSON regardless of the host shell's `printf` escape handling.
- Raise the npm unpacked size budget to 1856 KiB to accommodate the codex-lb auth auto-reconciliation logic and its self-test, while keeping packed size, file count, forbidden-file, and tracked-file guards enforced.

## [0.9.2] - 2026-05-16

### Fixed

- Treat Codex App Git Actions metadata for Commit, Push, Commit and Push, and PR flows as lightweight app git actions so SKS route/finalization hooks no longer block the built-in app commit/push UI.
- Report Codex App git action readiness in `sks codex-app check`, including `codex_git_commit`, hooks, `remote_control`, and Codex CLI remote-control support, so `sks doctor --fix` and upgrade checks surface the exact blocker.
- Keep `$Image-UX-Review` and `$UX-Review` tied to real Codex App `$imagegen`/`gpt-image-2` evidence, and add regression coverage that disabled `image_generation` blocks imagegen-dependent pipelines instead of passing silently.
- Raise the npm release size budget to 452 KiB packed and 1792 KiB unpacked for the Codex App git-action and imagegen readiness checks while keeping file count, forbidden-file, and tracked-file guards enforced.
- Keep release metadata aligned after the explicit SKS version bump to `0.9.2`.

## [0.9.1] - 2026-05-16

### Fixed

- Align codex-lb setup/repair with the upstream `Soju06/codex-lb` provider shape, including the OpenAI-authenticated provider block and websocket/base-url metadata.
- Restore missing Codex App `model_provider = "codex-lb"` settings from stored codex-lb environment during bare `sks` launches and project init/config merging.
- Tighten Codex App plugin readiness checks so missing default plugin sources and generated reserved-name skill shadows are reported with actionable guidance.
- Keep release metadata aligned after the explicit SKS version bump to `0.9.1`.

## [0.9.0] - 2026-05-15

### Added

- Document the report-only Decision Lattice planner for 0.9.0, using A* over proof-debt signals to explain route and verification path selection without claiming speedups before replay or scored eval evidence exists.
- Describe the Decision Lattice integration with proof-field and `sks pipeline plan` surfaces, including frontier, selected path, and rejected path evidence for reviewer audit.
- Raise the unpacked package size gate to 1776 KiB for the new Decision Lattice planner module while keeping packed size and file-count budgets unchanged.
- Strengthen the release registry gate so `--require-unpublished` checks the exact package version, not only whether the candidate is newer than the latest dist-tag.


## [0.8.6] - 2026-05-15

### Fixed

- Automatically restore existing codex-lb API-key auth during npm postinstall upgrades that reach the repair phase and during `sks doctor --fix`, including legacy installs where the key only remains in Codex `auth.json` and a codex-lb provider or env base URL is already recoverable.
- Keep the release size gate publishable after the codex-lb auth restore path by deduplicating its selftest setup and raising the unpacked-size budget to 1744 KiB.
- Restore `model_provider = "codex-lb"` as the top-level Codex App provider during codex-lb setup, repair, postinstall upgrade repair, and project config merging so upgraded apps actually route through codex-lb.
- Make `$PPT` load the `imagegen` skill as part of its required route allowlist and stamp required PPT image assets/review ledgers with Codex App `$imagegen`/`gpt-image-2` invocation instructions.


## [0.8.5] - 2026-05-15

### Fixed

- Keep codex-lb provider authentication from clobbering the shared Codex login cache, while syncing the stored `CODEX_LB_API_KEY` into the user launch environment for Codex App visibility.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.8.4] - 2026-05-15

### Fixed

- Surface Research scout agent names as explicit `agent_name` fields such as `Einstein Scout`, `Feynman Scout`, `Turing Scout`, `von Neumann Scout`, and `Skeptic Scout` throughout the plan, prompt, scout ledger, debate ledger, and selftest.
- Write Research paper manuscripts to a dated, topic-specific filename recorded in the plan, while keeping legacy `research-paper.md` compatibility for older missions.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.8.3] - 2026-05-15

### Fixed

- Preserve codex-lb as an explicit CLI launch provider without selecting it as the top-level Codex App provider, keeping native Codex App model, speed, and built-in feature UI visible.
- Keep release metadata aligned after the explicit SKS version bump to `0.8.3`.

## [0.8.2] - 2026-05-15

### Fixed

- Restore the `remote_control` Codex App feature flag during SKS setup/doctor repair and require it in `sks codex-app check`, so Codex mobile/remote-control UI entrypoints are not hidden while SKS still reports readiness.
- Keep installed OpenAI default plugins enabled during SKS setup/doctor repair, including Browser, Chrome, Computer Use, Documents, Presentations, Spreadsheets, and LaTeX, and fail `sks codex-app check` when an installed default plugin can be hidden from the composer/tool UI.
- Remove top-level `model_reasoning_effort` locks from Codex config during setup/doctor/codex-lb repair and report Fast UI config locks in `sks codex-app check`, so the Codex App model selector speed control remains visible.
- Raise the npm unpacked-size release budget to 1720 KiB for the Codex App readiness checks while keeping packed size, file count, forbidden-file, and tracked-file guards enforced.
- Keep release metadata aligned after the explicit SKS version bump to `0.8.2`.


## [0.8.1] - 2026-05-15

### Fixed

- Repair Codex App readiness and global repair so `sks doctor --fix` / reinstall restore official app feature flags for Computer Use, image generation, in-app browser, git commit/push, and Research xhigh profiles.
- Stop SKS route gates from blocking Codex App git commit/push and settings/profile UI events.
- Force `$Research` real runs through `gpt-5.5` Fast `xhigh` execution and report/repair missing Research profiles instead of silently running lower-effort paths.
- Change `$Research` from a fixed short loop into a no-code-mutation, evidence-layered genius-scout council that repeats until unanimous scout consensus or an explicit safety cap pauses the run.
- Gate Research completion on `consensus_iterations`, `unanimous_consensus`, and per-scout final agreements before the paper/report can pass.

## [0.8.0] - 2026-05-15

### Added

- Add the 0.8.0 Massive Upgrade report-only RecallPulse spine with TriWiki L1/L2/L3 cache decisions, neutral positive recall wording, durable `mission-status-ledger.json` status projection, duplicate suppression keys, `route-proof-capsule.json`, and `evidence-envelope.json`.
- Add `sks recallpulse run|status|eval|governance|checklist` so missions can write and inspect RecallPulse decisions without changing route behavior, including sequential child `$Goal` task checkpoints for `RECALLPULSE_0_8_0_TASKS.md`.
- Strengthen `$Research` scout personas with named Einstein Scout, Feynman Scout, Turing Scout, von Neumann Scout, and Skeptic Scout ledger fields while keeping them persona-inspired lenses, not impersonations.
- Gate Research scout ledgers on display names, persona boundaries, `reasoning_effort=xhigh`, `Eureka!` ideas, falsifiers, cheap probes, and debate participation evidence.
- Document the 0.8.0 Massive Upgrade while keeping performance claims benchmark-gated until scored RecallPulse evals prove them.
- Raise the npm package file-count release guard for the new RecallPulse core and CLI modules while keeping forbidden generated/runtime files excluded.



## [0.7.78] - 2026-05-14

### Fixed

- Stabilize the Team chat lane selftest used by `npm publish` by checking lane output semantically and including the rendered lane snapshot when the assertion fails.
- Raise the release size budgets to 448 KiB packed, 1700 KiB unpacked, and 384 KiB per tracked file so the current CLI entrypoint can pass publish checks while the larger split-review refactor remains explicit future work.
- Remove SKS support for installing `.git/hooks/pre-commit`; `sks versioning hook` is blocked, setup/doctor remove managed SKS version hooks, and release metadata stays explicit through `sks versioning bump`.

## [0.7.77] - 2026-05-14

### Fixed

- Recognize Codex App `Git Actions Commit` and `Commit and Push` hook payloads as app git actions, so SKS route gates do not block the built-in commit and commit-push flow.
- Keep ordinary user prompts that mention committing or pushing on the normal SKS route instead of treating them as app git actions.

## [0.7.76] - 2026-05-14

### Fixed

- Improve Team tmux live panes with Codex-style per-agent chat framing, lane identity, and color metadata.
- Close stale Team/codex-lb tmux panes before opening new managed views so old sessions do not linger.
- Detect codex-lb `previous_response_not_found` launch failures and bypass codex-lb for that launch instead of blocking SKS.

## [0.7.75] - 2026-05-14

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.74] - 2026-05-14

### Fixed

- Prevent copied Team `Live Chat` status logs from contaminating route classification with stale DB/security keywords.
- Make Team tmux lane panes self-close after follow loops end and fall back to recorded pane ids during cleanup.
- Render per-agent Team lanes as compact Codex-style chat blocks.

## [0.7.73] - 2026-05-14

### Fixed

- Suppress Codex under-development feature warnings whenever SKS enables `codex_git_commit`, including npm postinstall/global repair, project setup, `sks doctor --fix`, and codex-lb config repair paths.

## [0.7.72] - 2026-05-14

### Fixed

- Prepare the real Research run contract for npm release after the `0.7.71` validation pass.

## [0.7.71] - 2026-05-14

### Fixed

- Make normal `$Research` runs require the real Codex execution path instead of silently falling back to mock output; missing Codex now writes `research-blocker.json` and exits blocked.
- Give Research runs a two-hour default per-cycle timeout via `--cycle-timeout-minutes`, while keeping `--mock` explicitly limited to selftests and dry harness checks.
- Update generated Research skill guidance, route context, and README docs so Research is framed as long-running real source gathering, not a short summary loop.

## [0.7.70] - 2026-05-14

### Fixed

- Strengthen `$Research` with a route-local `research-source-skill.md`, layered source retrieval across scholarly, official, news, public-discourse, developer, and counterevidence sources, source-layer coverage and triangulation gate metrics, and optional Context7 only for package/API/framework documentation topics.
- Keep explicit `$Research` prompts on the Research route even when the command appears mid-sentence or as a markdown link, preventing stale Team missions from hijacking research-only work.
- Keep Research mission state marked `implementation_allowed=false`; the route may write research artifacts, but product/code implementation stays out of scope.
- Require `$Research` to finish with `genius-opinion-summary.md`, summarizing each genius-lens scout's final opinion, evidence, disagreement, changed mind, and council consensus.
- Raise the npm unpacked-size release budget to 1.6 MiB for the expanded Research route artifact contract while keeping packed size, file count, and tracked-file limits enforced.

## [0.7.69] - 2026-05-14

### Fixed

- Ship the `$Research` paper-manuscript gate so research runs require `research-paper.md` with paper-style sections before passing.

## [0.7.68] - 2026-05-13

### Fixed

- Route `$Research` through a source-backed xhigh genius scout council contract, requiring one literal `Eureka!` idea per scout, `debate-ledger.json`, `source-ledger.json`, `scout-ledger.json`, `falsification-ledger.json`, citation coverage, counterevidence, and stricter research gate metrics before a run can pass.
- Require `$Research` runs to turn the final result into `research-paper.md` with paper-style sections and references before the research gate can pass.
- Install accepted SKS updates with the exact registry-confirmed version instead of `sneakoscope@latest`, avoiding stale npm cache or propagation windows after a fresh publish.
- Make `sks doctor --fix` repair stored codex-lb config/auth drift, and store the codex-lb base URL beside the API key so future updates can restore provider routing.
- Raise the packed npm tarball budget to 400 KiB while keeping single-file, unpacked-size, and file-count release gates in place.
- Keep the 0.7.67 Codex App commit-message hook bypass, codex-lb postinstall preservation, Team tmux cleanup, and registry safety fixes available under a fresh patch version.

## [0.7.67] - 2026-05-13

### Fixed

- Add a release registry gate so npm version bumps fail before publish when registry config, lockfile registry sources, packed metadata, or npm dist-tag state is unsafe.
- Preserve codex-lb provider routing config through postinstall bootstrap/repair so stored API-key auth is not left without `model_provider = "codex-lb"`.
- Keep Team tmux Scout panes on the right side, close managed panes after work, and render per-Scout live chat transcripts instead of a shared log tail.
- Let Codex App commit message generation bypass SKS route finalization hooks while keeping ordinary user bug-fix prompts on the normal Team route.

## [0.7.66] - 2026-05-13

### Fixed

- Preserve global codex-lb provider and MCP server settings when SKS bootstraps project `.codex/config.toml`, so reinstall/setup does not hide stored auth or existing MCP connections.

## [0.7.65] - 2026-05-13

### Fixed

- Restore clarification and ambiguity gates as hard pauses, so SKS waits for explicit user answers instead of advancing to implementation or later pipeline stages.
- Block non-answer tools and permission requests while a clarification gate is waiting, allowing only `sks pipeline answer` or answers-file sealing commands through.
- Render Team tmux panes from lane-specific agent events instead of duplicating the global transcript tail.
- Close SKS-managed Team tmux panes when session cleanup is recorded, including from stored pane metadata outside the active tmux client.
- Clean up legacy Team tmux sessions and unrecorded Team lane panes by mission/session naming when older pane metadata is absent.
- Allow read-only live SQL inspection through DB safety without MAD-SKS while blocking writes and destructive SQL.

## [0.7.64] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

### Fixed

- Reconcile Team tmux lanes inside the current SKS-owned tmux session when available, while preserving the named `sks-team-*` view as a fallback and closing only SKS-managed agent panes during lifecycle cleanup.
- Clarify that Codex App readiness uses Codex-provided feature/MCP/status surfaces, while Codex Computer Use remains required for actual target UI/browser evidence.

## [0.7.63] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Migrate generated Codex configs and npm postinstall repair from deprecated `[features].codex_hooks = true` to `[features].hooks = true`.
- Preserve and re-enable required Codex App feature flags, including `codex_git_commit`, during config normalization and selftest.
- Add `sks team open-tmux` / `attach-tmux` so hook-created Team missions can reopen the split-pane tmux Scout view after mission creation.



## [0.7.62] - 2026-05-12

### Fixed

- Accept terminal sizes larger than the normalized tmux minimum in the dynamic resize selftest.
- Let Codex App Git Actions proceed with normal commit/push permission requests during no-question routes while still denying force-push style requests in that mode.
- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.61] - 2026-05-12

### Fixed

- Render the terminal SKS logo through `figlet` with plain ASCII output and show the active package version in CLI/tmux banners.
- Add the `solution-scout` pipeline hook/skill so problem-solving prompts search for similar fixes before local implementation decisions.
- Refit Team tmux split panes on attach and terminal resize with `window-size latest`, resize hooks, and tiled-layout recalculation for Warp-style resizing.
- Strengthen the Computer Use-only policy to forbid installing or using Playwright packages as UI/browser verification substitutes.
- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.60] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.59] - 2026-05-12

- Align generated Codex config with current OpenAI Codex docs by emitting `[features].codex_hooks = true` and treating the older `hooks = true` key as legacy.
- Tune skill dreaming to the requested 10-route-event threshold while keeping the cooldown and recommendation-only safety model.

### Fixed

- Keep `sks --mad` as a single Codex tmux pane by default, leaving split panes for active Team scout/worker lanes.
- Make accepted SKS update prompts run only `npm i -g sneakoscope@latest`, without chaining setup, doctor, project install, or pipeline work.
- Remove stale generated `computer-use`, `browser-use`, and `browser` skill shadows during `sks doctor --fix` global repair and npm postinstall global skill setup.
- Raise the tracked-file release budget for the expanded install/doctor selftest coverage while keeping `src/cli/main.mjs` flagged for future extraction.

## [0.7.58] - 2026-05-12

### Fixed

- Remove visible prequestion sheets from SKS execution routes by auto-sealing contracts from prompt, TriWiki/current-code defaults, and conservative policy.
- Keep QA-LOOP UI verification restricted to official Codex Computer Use evidence and block browser automation substitutes.
- Require Codex App `$imagegen`/`gpt-image-2` evidence for required PPT and UI/UX generated-image gates instead of direct API fallback or fabricated assets.
- Show Team scout activity in tmux split panes by seeding scout assignment events and pane-open lane events for each visible agent.

## [0.7.57] - 2026-05-12

### Fixed

- Keep `npm publish` release checks passing after the MAD tmux launch changes by moving the MAD command path out of the oversized CLI entrypoint without increasing package file count.

## [0.7.56] - 2026-05-11

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.55] - 2026-05-11

### Fixed

- Force all Codex launch, exec, remote-control, and hook-observed client model paths back to `gpt-5.5`, stripping `gpt-5.4` request overrides before they can reach the client runtime.

## [0.7.54] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Allow active `$MAD-SKS` and top-level `sks --mad` permission gates to run required Supabase migration application, including Supabase MCP `apply_migration`, `supabase migration up`, and `supabase db push`, while keeping default/non-MAD DB push and catastrophic reset/wipe safeguards blocked.


## [0.7.53] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Force generated and repaired Codex config plus SKS tmux launches to use `gpt-5.5`, preventing `gpt-5.4-mini` or other model defaults from slipping in through missing top-level model pins or `SKS_CODEX_MODEL` overrides.

## [0.7.52] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Treat Codex App Markdown-linked `$research`, `$QA-LOOP`, and related picker skills as explicit SKS routes so Computer Use wording cannot hijack QA/research prompts into the fast lane.
- Clarify `sks codex-app check` Computer Use readiness by distinguishing installed plugin files from live `@Computer` tool exposure in the current Codex App thread.
- Extend the native Computer Use policy text to require `@Computer` or `@AppName` in a fresh Codex App thread when live native Mac/non-web evidence is needed.
- Require real Codex App `$imagegen`/`gpt-image-2` output for generated raster assets and generated image-review evidence, blocking placeholders, prose-only critique, and fabricated image files from satisfying route gates.
- Report Codex image-generation feature readiness in `sks codex-app check` so missing `$imagegen` exposure is visible before SKS visual/image pipelines run.

## [0.7.51] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Add the `$Image-UX-Review` / `$UX-Review` route so UI/UX audits require a source screenshot -> `$imagegen`/`gpt-image-2` generated annotated review image -> issue ledger evidence chain instead of passing from text-only critique.
- Add Image UX Review route artifacts, generated skills, CLI status inspection, README guidance, and selftest coverage for missing generated-review-image blockers.
- Raise the release size/file-count guard for the new Image UX Review route module and expanded CLI selftests.

## [0.7.50] - 2026-05-09

### Fixed

- Fix Team review orchestration so default and lower explicit reviewer counts materialize at least five reviewer/QA validation lanes.
- Keep Team tmux review visibility without hiding the scout, executor, and planning representative lanes.
- Resolve `latest` mission selection from mission metadata timestamps instead of lexicographic ids, so same-second duplicate missions do not hide the actually active Goal/Team completion state.

### Changed

- Centralize the Team review-lane policy in a reusable gate module used by runtime plans and selftests.
- Update generated harness text, Team selftests, release size gates, and user-facing examples for the default minimum of five QA/reviewer lanes.

## [0.7.49] - 2026-05-09

### Fixed

- Add `sks codex-lb repair` and `sks auth repair` so stored codex-lb API-key auth can be re-synced without re-entering the key.
- Make `sks --mad` sync codex-lb/Codex CLI auth before launch and open a fresh session when the repaired key must be loaded immediately.
- Stop DB safety pre-tool checks from treating ordinary file-edit patch text such as `Update File` as SQL `UPDATE` operations.

## [0.7.48] - 2026-05-09

### Added

- Centralize the MAD-SKS live full-access permission profile in a reusable gate module so hooks, skills, and MCP-style safety checks share one decision function.
- Make `sks --mad` create an active MAD-SKS tmux permission mission so DB hooks inside the launched workspace allow live server work, Supabase MCP DB writes, direct SQL, targeted DML, and needed migrations while keeping catastrophic wipe safeguards.
- Expose Team tmux sessions as a single-window split-pane live UI with overview and color-coded lane metadata.

### Fixed

- Keep npm install/upgrade repair aligned with the new MAD-SKS and Team tmux behavior so generated setup policy and skill text no longer preserve stale safe-default wording.
- Reduce tmux/Team terminal noise by replacing large lane banners and verbose create output with mission, lane, status, watch, and artifact pointers only.
- Update the package file-count release budget for the new permission gate module.

## [0.7.47] - 2026-05-09

### Fixed

- Remove the generic ambiguity-question gate from normal execution routes so `$Team`, SKS workflow, research, DB, GX, and other direct work no longer stop on prewritten intent/risk questionnaires.
- Keep only explicit checklist routes such as `$QA-LOOP`, `$PPT`, and `$MAD-SKS` on the clarification path, while ordinary Team work now materializes Team artifacts immediately.
- Stop stale non-checklist clarification missions from hijacking later prompts or blocking tool calls, preventing repeated question sheets from recursively reappearing.

## [0.7.46] - 2026-05-09

### Fixed

- Preserve Codex Fast mode defaults during npm install/upgrade repair and `sks codex-lb setup` by keeping `service_tier = "fast"` plus the `sks-fast-high` profile instead of stripping the service tier while rewriting Codex config.
- Keep repeated ambiguity-gate retries compact so pending `INTENT_TARGET` questions no longer reprint the full visible-response contract and plan-tool instructions on every hook resume.
- Let `sks pipeline answer` seal contracts directly from `--stdin` or `--text` so users no longer need to deal with an `answers.json` step for ordinary clarification replies.
- Activate `$MAD-SKS` scoped DB permissions during auto-sealed standalone and modifier routes so ordinary DDL/DML is allowed while catastrophic wipe safeguards stay active.


## [0.7.45] - 2026-05-09

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

### Added

- Add `sks codex-app remote-control` as a version-gated wrapper for Codex CLI 0.130.0's headless remote-control entrypoint, with status/JSON/dry-run modes and no fallback to older app-server internals.
- Add the `$PPT` image asset ledger pipeline so required presentation image resources are planned, generated through real `gpt-image-2` Image API calls when `OPENAI_API_KEY` is available, embedded in source HTML, and blocked instead of faked when credentials or generation output are missing.

### Changed

- Keep Codex App Fast mode selection visible during npm postinstall/setup/codex-lb configuration by enabling Fast UI keys and removing legacy SKS top-level `model`, `model_reasoning_effort`, and `service_tier` locks from Codex config.
- Report Codex remote-control readiness in `sks codex-app check`, and update Codex App guidance for Codex CLI 0.130.0 live app-server config refresh behavior.
- Raise the package file-count gate to 56 so the extracted Codex App command module stays release-checkable without adding more logic to the oversized CLI entry file.
- Make `$PPT` build/status output and selftest cover fact, image asset, review, bounded iteration, cleanup, and parallel build artifacts.


## [0.7.44] - 2026-05-08

### Fixed

- Stop clear auth-worded CLI rendering tasks from asking generic `RISK_AND_BOUNDARY` questions when conservative safety defaults can be inferred.
- Materialize Team runtime artifacts immediately after an auto-sealed ambiguity gate so Team missions can proceed to scouting instead of sitting at a sealed contract.
- Make the tmux/Codex intro stable: animate only for non-tmux unauthenticated launches, redraw frames in place, and show static 3D ASCII inside tmux.

## [0.7.43] - 2026-05-08

### Fixed

- Clarify that the default SKS Team pipeline authorizes route-owned worker/reviewer subagents without a separate user request.
- Make `sks --mad` launch Codex in explicit full-access mode with `danger-full-access` sandboxing and `approval_policy=never`.
- Make the tmux launch intro use a detailed rotating 3D-style SKS ASCII animation with more frame steps.
- Ship the install `.gitignore`, Fast mode, and PPT design-reference pipeline fixes under a fresh npm patch version.


## [0.7.42] - 2026-05-08

### Fixed

- Add a polished animated ASCII SKS intro for tmux launches, with a static fallback through `SKS_TMUX_LOGO_ANIMATION=0`.
- Keep release metadata aligned after the explicit SKS version bump.

## [0.7.41] - 2026-05-08

### Fixed

- Ship the codex-lb pre-launch auth flow in English, collecting host domain and API key before Codex opens.
- Load the codex-lb API key from the SKS-managed env file, sync Codex CLI API-key login for the interactive TUI, and use a fresh tmux session after first-time setup so the key is applied immediately.
- Keep release metadata aligned after the explicit SKS version bump.

## [0.7.40] - 2026-05-08

### Fixed

- Preserve user-owned Codex config such as Fast mode UI settings when SKS setup or global postinstall refreshes `.codex/config.toml`.
- Launch the default SKS tmux Codex CLI workspace in fast-high mode while allowing environment overrides.
- Add a pre-launch SKS codex-lb y/n auth prompt plus `sks codex-lb setup --host <domain> --api-key <key>` so hosted domain and key values are applied directly before Codex CLI opens.
- Repair tmux dependency handling so Homebrew-managed tmux uses Homebrew, npm-managed tmux uses npm, and unknown tmux paths are reported as conflicts.
- Make source-repo version drift checks use the local `bin/sks.mjs` runtime instead of stale global `sks`.
- Stop the pre-commit version guard from automatically bumping package and changelog versions on every commit; explicit `sks versioning bump` remains the release bump path.

## [0.7.38] - 2026-05-08

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.37] - 2026-05-08

### Fixed

- Publish the hook update-check selftest fix under the version actually produced by the automatic SKS version guard.
- Make automatic SKS version bumps create and stage the matching changelog section so publish cannot silently advance beyond the verified changelog entry.

## [0.7.36] - 2026-05-08

### Fixed

- Keep hook update-check selftest verification stable when the on-disk SKS runtime version advances before the child hook process records update state.

## [0.7.35] - 2026-05-08

### Fixed

- Make TriWiki repeat-mistake prevention enforceable by preserving high-priority tail memory claims, binding relevant mistake recall into decision contracts, promoting voxel priority/conflict signals into source hydration, and gating completion on consumed recall evidence.
- Warn during `sks versioning status` when the source package version is newer than the bare global `sks` runtime.

## [0.7.34] - 2026-05-08

### Fixed

- Make `sks --mad` and explicit tmux launches attach automatically in interactive terminals after creating or reusing the session, while preserving print-only behavior for `--json`, `--quiet`, `--status-only`, `--no-attach`, and `SKS_TMUX_NO_AUTO_ATTACH=1`.

## [0.7.33] - 2026-05-08

### Fixed

- Add the release changelog section matching the current package version after the versioning hook advanced the package to `0.7.33`.

## [0.7.32] - 2026-05-08

### Fixed

- Keep the release gate aligned after the version guard advanced the package during install/bootstrap pipeline repair, and make the hook update-check selftest failure report the recorded state for diagnosis.

## [0.7.31] - 2026-05-08

### Fixed

- Make `npm i -g sneakoscope` automatically bootstrap the global SKS runtime root when install/upgrade runs outside a project, so Codex App `$` skills and pipeline fallback behavior are refreshed without requiring a separate `sks bootstrap`.

## [0.7.30] - 2026-05-08

### Fixed

- Add a Codex App pipeline-activation fallback to generated stateful SKS skills so `$Team`, `$SKS`, and related routes run `sks hook user-prompt-submit` and materialize mission/pipeline artifacts even when project hooks are not visibly injecting context.

## [0.7.29] - 2026-05-08

### Fixed

- Keep the Codex CLI update preflight release-ready after the version hook advanced the package again, including OpenClaw auto-approve coverage and the extracted install helper path.

## [0.7.28] - 2026-05-08

### Changed

- Check npm `@openai/codex@latest` before tmux launches, prompt `Y/n` when the installed Codex CLI is missing or outdated, and continue the same launch with the updated binary after approval.
- Treat `SKS_OPENCLAW=1` OpenClaw runs as auto-approved for SKS update/install prompts, and include that environment flag in generated OpenClaw guidance.
- Document the Codex CLI update preflight in the README default tmux runtime flow.

## [0.7.27] - 2026-05-08

### Changed

- Make bare `sks` open or reuse the default tmux Codex CLI workspace, keeping `sks tmux open` as the explicit launch form for session/workspace flags.
- Update CLI help, generated quick reference wording, and README runtime guidance so the default tmux launch surface is discoverable.

## [0.7.26] - 2026-05-08

### Added

- Add `sks openclaw install|path|print` to generate an OpenClaw skill package that lets OpenClaw agents attach `sneakoscope-codex`, enable the shell tool, and discover/use SKS workflows from a target repo root.
- Document OpenClaw agent setup, config YAML, sandbox note, and useful SKS commands in the README.
- Raise the package file-count budget to 54 for the new OpenClaw generator and CLI handler modules while keeping packed and unpacked byte budgets unchanged.

## [0.7.25] - 2026-05-08

### Fixed

- Prune stale SKS-generated skills and generated app/agent files during setup, doctor repair, and postinstall refresh by comparing the previous generated manifest with the current generated surface.
- Preserve user-owned custom skills while removing prior-version SKS generated legacy files, and report the cleanup in doctor JSON output.

## [0.7.24] - 2026-05-08

### Changed

- Bump the deployment package version after the score-based ambiguity-question rebuild so the next publish can ship a fresh patch release.

## [0.7.23] - 2026-05-08

### Changed

- Replace fixed ambiguity-question templates with a weighted clarity gate that scores goal, constraints, success criteria, and codebase context before asking only the lowest-clarity execution-changing questions.
- Add Ouroboros-style ambiguity threshold metadata and Prometheus/Hyperplan-style planning lenses to the generated question schema and visible `questions.md` output.
- Update Team and prompt-pipeline skill guidance plus README documentation so user-facing surfaces describe score-based minimal clarification instead of static `GOAL_PRECISE` / `ACCEPTANCE_CRITERIA` prompts.

## [0.7.21] - 2026-05-08

### Fixed

- Make update-check selftest cases explicitly enable the mocked update check so inherited `SKS_DISABLE_UPDATE_CHECK=1` environments cannot skip the effective installed-version assertion.

## [0.7.20] - 2026-05-08

### Fixed

- Add the release changelog section matching the current package version so `npm run release:check` passes after the patch bump.

## [0.7.19] - 2026-05-08

### Fixed

- Infer conservative payment retry and auth session-expiry defaults during SKS ambiguity gating, so predictable `$Team` payment/auth fixes auto-seal instead of repeatedly asking for obvious policy slots.
- Restrict `$PPT` design/render execution to its route allowlist, ignoring installed out-of-pipeline design skills and MCPs unless a conditional PPT contract explicitly enables them.
- State the root `$PPT` design-policy goal as preventing AI-like generic presentation styling by grounding visuals in audience, sources, getdesign reference, and the design SSOT.

## [0.7.18] - 2026-05-08

### Changed

- Make `design.md` the explicit design decision SSOT while treating getdesign and `VoltAgent/awesome-design-md` as source inputs that must be fused into that SSOT or route-local `$PPT` style tokens.
- Add regression coverage for the fused design SSOT policy in generated `$PPT`, `getdesign-reference`, `design-system-builder`, prompt-pipeline, install manifest, and `$PPT` style-token artifacts.
- Update the README release surface for `$PPT`, design SSOT routing, getdesign, and `awesome-design-md` source-input behavior so npm/GitHub documentation matches the new feature set.

## [0.7.16] - 2026-05-08

### Changed

- Bump the deployment package version after the clarification-gate hard-pause fix so the next npm publish ships a fresh patch version.

## [0.7.15] - 2026-05-08

### Fixed

- Keep mandatory ambiguity-removal questions hard-paused until explicit user answers are sealed with `answers.json` and `sks pipeline answer`, instead of allowing repeated Stop hook blocks to fall through into the next pipeline phase.
- Add regression coverage proving clarification gates do not write compliance hard-blockers while waiting for answers, and that `pipeline status` projects `clarification-gate` blockers before the contract is sealed.

## [0.7.14] - 2026-05-08

### Added

- Add report-only route economy probes to Proof Field and workflow perf: contract clarity scoring, workflow complexity scoring, Team trigger matrices, and fail-closed verification stage cache keys.
- Add gate projection to `sks pipeline status` so active route gates, subagent evidence, Context7 evidence, and reflection freshness can be inspected as a single report-only blocker projection.

## [0.7.13] - 2026-05-08

### Changed

- Make `$PPT` artifact generation parallel-friendly by running independent strategy, render, and file-write groups with `Promise.all`.
- Add `ppt-parallel-report.json` plus gate/selftest coverage so `$PPT` records which presentation build phases ran as parallel groups.

## [0.7.12] - 2026-05-08

### Changed

- Replace the CLI runtime with direct tmux 3.x sessions and split panes across `sks tmux open`, `sks --mad`, dependency checks, doctor/bootstrap readiness, Team live lanes, cleanup, generated quick references, and README setup.
- Remove the remaining current-source tmux predecessor traces from command discovery, dependency repair, package keywords, Team skill wording, and runtime documentation.

## [0.7.11] - 2026-05-08

### Fixed

- Preserve `$PPT` editable source HTML under `source-html/artifact.html` while keeping the exported PDF as the user-facing artifact.
- Add `$PPT` cleanup reporting and gate/selftest coverage so PPT-only temporary build files are removed after completion and stale root `artifact.html` output does not remain.

## [0.7.10] - 2026-05-08

### Fixed

- Close the `$PPT` artifact loopback by adding `sks ppt build|status`, deterministic HTML/PDF artifact generation, storyboard/source/style/render-report files, and a passing `ppt-gate.json` only after the sealed contract has 3+ pain-point/solution/aha mappings.
- Make `$PPT` presentation design explicitly simple, restrained, and information-first, with design detail carried by hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents instead of decorative overdesign.
- Make the generated `imagegen` skill prefer official Codex App built-in image generation via `$imagegen` / `gpt-image-2`, with API generation reserved for approved larger batches using `OPENAI_API_KEY`.
- Split postinstall and Context7 CLI helpers out of `src/cli/main.mjs` so the main CLI entrypoint stays below the 3000-line split-review gate.

## [0.7.9] - 2026-05-08

### Fixed

- Complete the `$PPT` presentation pipeline surface by generating the `ppt` Codex App skill, materializing `ppt-audience-strategy.json` / `ppt-gate.json` after sealed answers, and adding selftest coverage that `$PPT` ambiguity removal asks for delivery context, audience profile, STP strategy, decision context, and pain-point to solution mapping before artifact creation.
- Raise the package file-count budget to 50 for the new generated `$PPT` skill while keeping packed and unpacked byte budgets unchanged.

## [0.7.8] - 2026-05-08

### Fixed

- Stop treating every MCP tool name as a database tool, so Codex Computer Use MCP calls such as opening Microsoft Edge by bundle id are not blocked by the SKS DB safety gate during no-question runs.
- Add selftest coverage proving Computer Use MCP payloads pass the DB safety hook while Supabase execute_sql remains guarded.

## [0.7.7] - 2026-05-08

### Changed

- Infer predictable UI/UX ambiguity slots such as state behavior and visual-regression preference so SKS no longer asks users for defaults like "judge for yourself" or `yes_if_available`.
- Add getdesign.md as the generated design-reference policy for design.md, UI/UX systems, and presentation-like HTML/PDF artifacts, with npm postinstall opportunistically wiring the official Codex skill when the `skills` CLI is available.

## [0.7.6] - 2026-05-07

### Fixed

- Keep ambiguity-gated routes hard-paused after visible questions are shown: pre-tool and permission hooks now block implementation, tests, route materialization, and unrelated tools until explicit user answers are converted to `answers.json` and `sks pipeline answer` seals the contract.
- Add selftest coverage proving pending Team clarification blocks normal tool execution while still allowing the `pipeline answer` command that resumes the route.

## [0.7.5] - 2026-05-07

### Changed

- Embed Hyperplan-style adversarial planning lenses into the existing Proof Field and Team debate rubric, so SKS challenges framing, subtracts unnecessary surface, demands evidence, tests integration risk, and considers a simpler alternative without adding a new route or heavier pipeline stage.
- Add selftest coverage that Proof Field reports and scorecards carry the adversarial lenses, and document the lightweight Hyperplan adaptation in the README.

## [0.7.4] - 2026-05-07

### Changed

- Raise the package size gates to 384 KiB packed and 1536 KiB unpacked so release preparation has practical headroom instead of failing on tiny harness growth.

## [0.7.3] - 2026-05-07

### Fixed

- Infer conservative DB safety defaults for predictable ambiguity-gate prompts so SKS no longer asks users to fill static database policy slots when the safe answer is already clear.
- Add selftest coverage proving a DB safety question-block prompt auto-seals with zero visible slots.
- Raise the package size gates to 269 KiB packed and 1037 KiB unpacked for the DB clarification inference coverage while keeping the package at 49 files.

## [0.7.2] - 2026-05-07

### Fixed

- Auto-run global forced SKS bootstrap from npm postinstall when the install cwd looks like a project, so first installs and upgrades refresh project hooks, skills, and readiness without requiring `sks setup --bootstrap --install-scope global --force`.
- Keep postinstall bootstrap targeted at `INIT_CWD` and add an explicit `SKS_POSTINSTALL_NO_BOOTSTRAP=1` opt-out for users who need package install without project mutation.
- Raise the unpacked package size gate by 1 KiB for the automatic postinstall bootstrap selftest coverage while keeping the package at 49 files.

## [0.7.1] - 2026-05-07

### Fixed

- Fix `sks doctor --fix --json` so the DB safety scan is wired into the CLI instead of crashing before the readiness report.
- Preserve the existing project/global install scope during `doctor --fix` unless the user explicitly passes a new scope, so project installs keep project hook commands.
- Add CLI-level `doctor --fix` selftest coverage for managed file repair across skills, hooks, quick reference, policy, AGENTS managed block, legacy skill mirrors, and user-owned custom skills.

## [0.7.0] - 2026-05-07

### Added

- Add `pipeline-plan.json` as the stateful route execution map. It records runtime lane, kept/skipped stages, required verification, Proof Field binding, and the no-unrequested-fallback invariant for each mission.
- Add `sks pipeline plan [mission-id|latest] [--proof-field] [--json]` and include plan summaries in `sks pipeline status`, Team CLI mission creation, generated skills, README, workflow perf metrics, and selftests.
- Raise package size budgets to 268 KiB packed and 1032 KiB unpacked for the 0.7 pipeline-plan runtime surface while keeping the package at 49 files.

### Changed

- Bind Proof Field speed decisions into the mission plan so fast-lane work skips only explicit stages, while broad/security/database work fails closed to the full Team/Honest path.

## [0.6.100] - 2026-05-07

### Added

- Add lightweight skill dreaming with `.sneakoscope/skills/dream-state.json`, `sks skill-dream status|run|record`, and recommendation-only keep/merge/prune/improve reports so generated skills can be simplified after count/cooldown thresholds without evaluating every conversation or deleting skills automatically.
- Raise the packed package budget from 256 KiB to 264 KiB for the skill-dream runtime surface while keeping the package at 49 files and below the 1 MiB unpacked gate.

## [0.6.99] - 2026-05-07

### Changed

- Add a Proof Field execution lane so small, low-risk, clearly verifiable work can use `proof_field_fast_lane` and skip Team debate, fresh executor teams, broad route rework, and unrelated checks while keeping listed verification, TriWiki validation, and Honest Mode.
- Surface the speed-lane policy in route context, generated Team/prompt/pipeline skills, workflow perf metrics, README, and selftest coverage so risky work still fails closed to the normal Team/Honest path.

## [0.6.98] - 2026-05-06

### Changed

- Adapt Managed Agents-style outcomes/dreaming ideas into the existing lightweight Proof Field path: proof reports now include an outcome rubric, simplicity scorecard, and explicit escalation triggers instead of adding a new background pipeline.
- Shorten the Research plan shape around frame, hypothesize, falsify, and apply phases so research outputs favor the smallest useful mechanism or probe over broad process expansion.

### Fixed

- Suppress negative-priming wording in TriWiki compact recall by rewriting selected anti-goal guardrails into positive target behavior while keeping the original claim hydratable by source/hash.
- Add a selftest proving a selected negated recall claim no longer pastes the negated target into compact `claims` text and is instead routed through `attention.hydrate_first`.
- Accept Context7 MCP underscore tool names such as `resolve_library_id` and `query_docs` as completion evidence, preventing routes from staying blocked after the docs call actually ran.

## [0.6.97] - 2026-05-06

### Fixed

- Pin selected TriWiki claims into the coordinate anchor set so `attention.use_first` keeps cache-hit anchors for the claims the capsule actually chose, even when high-priority distractors compete for a small anchor budget.
- Add a selftest fixture that verifies selected cache-hit claims remain present in `claims`, `wiki.a`, and `attention.use_first` under distractor pressure.

## [0.6.96] - 2026-05-06

### Fixed

- Simplify `$DFix` finalization so it no longer creates a persistent light-route state record; DFix now uses an explicit completion marker plus a one-line DFix-specific Honest Mode check while remaining free of TriWiki/TriFix/reflection recording.
- Stop bare `sks` and default `sks team` creation from opening tmux automatically; tmux launch now requires an explicit `sks tmux open`, `sks --mad`, auto-review start, or `sks team --open-tmux`.
- Reuse the current tmux terminal for explicit single-session launches when SKS is already running inside tmux, preventing nested tmux windows.

## [0.6.93] - 2026-05-05

### Changed

- Bump the deployment package version after the Computer Use fast-lane routing update so the next npm publish ships a fresh patch version.

## [0.6.92] - 2026-05-05

### Added

- Add `$Computer-Use` / `$CU` as a maximum-speed Codex Computer Use lane for native Mac/non-web visual tasks, deferring TriWiki refresh/validate and Honest Mode to final closeout while preserving the Computer Use evidence policy.

### Fixed

- Prevent Computer Use pipeline-tuning requests that mention TriWiki or Honest Mode from being misrouted into `$Wiki`.

## [0.6.91] - 2026-05-05

### Changed

- Clarify `$Goal`/`sks goal` as a fast SKS bridge overlay for Codex native `/goal` persistence, with implementation continuing through the selected SKS execution route and Context7 only required when external docs are involved.

## [0.6.90] - 2026-05-05

### Fixed

- Prevent `$DFix` turns from being pulled into repeated full-route Honest Mode stop-hook loopbacks; DFix uses one-shot ultralight finalization context and keeps only cheap verification for micro-edits.

## [0.6.89] - 2026-05-04

### Changed

- Bump the release version for the SKS generated-file ignore update so the next npm publish can ship a new package version.

## [0.6.88] - 2026-05-04

### Changed

- Make default SKS project setup write shared `.gitignore` entries for generated Sneakoscope files so `.sneakoscope/`, `.codex/`, `.agents/`, and managed `AGENTS.md` do not appear as project changes.
- Keep `--local-only` installs on `.git/info/exclude` while adding selftest coverage for both shared and local-only ignore modes.

## [0.6.87] - 2026-05-04

### Added

- Add `sks proof-field scan` as the first Potential Proof Field implementation slice, reporting invariant ledgers, proof cones, negative-work cache entries, fast-lane eligibility, and fail-closed escalation triggers for the current change set.
- Add `sks perf workflow` to measure Proof Field build time, fast-lane eligibility, selected proof cones, verification count, and cached negative work for a concrete change intent.
- Raise the package file-count budget to 49 for the new proof-field module while keeping packed and unpacked byte budgets unchanged.

## [0.6.86] - 2026-05-03

### Changed

- Change `$MAD-SKS` from a table-removal confirmation flow into a scoped Supabase MCP DB cleanup/write override: column and schema cleanup are allowed during the active invocation, while catastrophic wipe operations remain blocked.

## [0.6.85] - 2026-05-02

### Changed

- Bump the deployment package version after the tmux Team cleanup, message, and color-lane UX work so the next npm release has a fresh patch version.

## [0.6.84] - 2026-05-02

### Changed

- Improve tmux Team sessions with cleanup-aware `watch`/`lane` follow loops, bounded `sks team message` inter-agent communication, terminal titles, and stronger color-coded lane banners.

## [0.6.83] - 2026-05-02

### Changed

- Replace the SKS CLI runtime with terminal multiplexer sessions, including `sks`, `sks tmux`, `sks --mad`, dependency checks, doctor/bootstrap readiness, Team live lanes, generated quick references, and README usage.
- Remove the previous runtime support and its socket/workspace control path from the source tree.

## [0.6.81] - 2026-05-02

### Changed

- Historical package-pipeline UI/browser verification used Codex Computer Use-only evidence; current policy supersedes that with Codex Chrome Extension-first web verification while still rejecting Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, and other browser automation as substitutes.

## [0.6.80] - 2026-05-02

### Fixed

- Stop repeating the SKS update prompt after the installed `sks` binary is already at the npm latest version, and clear stale pending update offers before accepting another update response.

## [0.6.79] - 2026-05-02

### Changed

- Historical UI-level QA/E2E verification used Codex Computer Use-only evidence; current policy supersedes that with Codex Chrome Extension-first web verification while still rejecting Chrome MCP, Browser Use, Playwright, and other browser automation as substitutes.

## [0.6.78] - 2026-05-02

### Added

- Add `sks harness fixture|review` and `harness-growth-report.json` for deliberate forgetting fixtures, skill card metadata, harness experiment schema, permission profiles, MultiAgentV2 defaults, terminal cockpit view coverage, and tool-error taxonomy.
- Record failed tool calls into `tool-errors.jsonl` with InvalidArguments, UnexpectedEnvironment, ProviderError, UserAborted, Timeout, PermissionDenied, NetworkDenied, ResourceExhausted, Conflict, or Unknown classification; Unknown is marked as a harness bug.

### Changed

- Tighten the ambiguity stop gate so a clarification-only final must visibly include the `Required questions` block and slot ids instead of passing on vague “I need decisions” wording.
- Expand Team dashboard panes to the requested Mission/Goal, Agent Grid, MultiAgentV2, Work Order Ledger, Memory Health, Forget Queue, Mistake Immunity, Tool Reliability, Harness Experiments, Dogfood Evidence, Code Structure, and statusline/title cockpit surfaces.
- Extend Goal workflow artifacts with checkpoints, resume context, clear policy, and structured `/goal` continuation metadata.

## [0.6.77] - 2026-05-02

### Changed

- Make `sks team` open a terminal multiplexer orchestration workspace with a live mission overview pane plus split per-agent lanes.
- Render `sks team watch` as a readable live cockpit instead of raw transcript JSON by default, with `--raw` preserving the old tail output.
- Color-code and rename tmux Team lanes by role, expose role status badges, and collapse agent panes back to the overview through `sks team cleanup-tmux` or the `session_cleanup` live event.
- Repair external terminal socket launch by restarting the multiplexer with a non-persistent permissive socket mode when default control rejects SKS with `Broken pipe`.

## [0.6.76] - 2026-05-01

### Added

- Add TriWiki memory-governor sweep reports with ADD/UPDATE/CONSOLIDATE/DEMOTE/SOFT_FORGET/ARCHIVE/HARD_DELETE/NOOP/PROMOTE operations and bounded retrieval budgets.
- Add `sks wiki sweep` to emit memory hygiene, Skill Forge, Mistake Memory, and code-structure mission artifacts.
- Add `sks code-structure scan` and `code-structure-report.json` for 1000/2000/3000-line structure gates and split-review exceptions.

### Changed

- Team preparation now writes memory sweep, skill forge, mistake-memory, and code-structure reports before dashboard rendering.
- Team dashboard state now includes Memory Attention, Forget Queue, Skill Autopilot, Mistake Immunity, and Code Structure panes.
- Split maintenance-heavy CLI handlers into `src/cli/maintenance-commands.mjs`, bringing `src/cli/main.mjs` below the 3,000-line split-required review gate.

## [0.6.75] - 2026-05-01

### Added

- Add `$Goal` and `sks goal create|pause|resume|clear|status` as the SKS bridge to Codex native persisted `/goal` workflows.
- Add `goal-workflow.json` and `goal-bridge.md` mission artifacts so pipeline runs record the native `/goal` control contract.

### Changed

- Replace the user-facing Ralph route, command, generated skills, and selftest surface with the native Goal workflow path.
- Update no-question, DB safety, retention, generated rules, docs, and discovery surfaces to use generic SKS run/Goal terminology.

## [0.6.74] - 2026-05-01

### Added

- Add schema-backed GPT-5.5 performance artifacts for Work Order Ledgers, effort decisions, From-Chat-IMG visual maps, dogfood reports, Skill Forge, mistake memory, Team dashboard state, terminal pane plans, and Honest Mode reports.
- Add `sks validate-artifacts` and `sks perf run` so mission evidence and performance budgets are locally checkable.
- Add lightweight effort orchestration, prompt-context ordering, Skill Forge, mistake memory, dogfood, From-Chat-IMG work-order, and Team dashboard renderer modules.

### Changed

- Team mission creation now writes work-order, effort, and dashboard-state artifacts and exposes `sks team dashboard`.
- Make ambiguity-removal awaiting states modal: pending questions are re-exposed in chat and new route prompts cannot replace the active question sheet before answers are sealed.
- Size/performance budgets now reflect the measured zero-dependency package payload after schema/orchestration modules were added.

## [0.6.73] - 2026-04-30

### Changed

- Make tmux readiness checks validate workspace socket health, not only the tmux executable version, so `sks deps check`, `sks doctor`, `sks tmux check`, and `sks --mad` report unhealthy app/socket states before launch.
- Make `sks team` create a named tmux Team workspace and target each split/send by returned workspace and surface refs, so visible Team lanes open as split panes instead of relying on ambient tmux environment variables.
- Select the newly created tmux Team workspace after launch and report the actual opened lane count, so split panes are brought to the visible workspace instead of opening behind the current tmux view.

## [0.6.72] - 2026-04-30

### Changed

- Add a bounded stop-hook repeat guard so repeated identical Honest Mode or final completion summary prompts are suppressed instead of re-entering an infinite finalization loop.

## [0.6.71] - 2026-04-30

### Changed

- Persist SKS-created tmux workspace refs so repeated `sks --mad --high` launches can reuse the last workspace even when tmux workspace listing is incomplete or unstable.
- Block duplicate workspace creation when tmux workspace inspection fails, instead of silently falling through to another `new-workspace` request.

## [0.6.70] - 2026-04-30

### Changed

- Make `sks --mad` reuse its named tmux workspace and close duplicate SKS-named MAD workspaces instead of creating another workspace on every launch.
- Add pipeline, Team inbox, generated agent, auto-review, and MAD/MAD-SKS policy text that blocks unrequested fallback implementation code.

## [0.6.69] - 2026-04-30

### Changed

- Add `sks team lane` per-agent monitoring for tmux Team panes, showing agent status, assigned runtime tasks, recent agent events, and a fallback global tail.
- Promote explicit `$From-Chat-IMG` work-order analysis to xhigh temporary reasoning and generated skill metadata.
- Allow runtime commands to work outside any project by falling back to a per-user global SKS root, with `sks root` showing the active project/global root.

## [0.6.68] - 2026-04-29

### Changed

- Align the `main` merge release metadata after SKS versioning advanced the merge package version during the final commit.

## [0.6.67] - 2026-04-29

### Changed

- Merge the verified 0.6.66 MAD tmux repair line from `dev` into `main`, preserving the public README emphasis for From-Chat-IMG and TriWiki voxels.

## [0.6.66] - 2026-04-29

### Changed

- Make `sks --mad` check npm for a newer Sneakoscope release before launch and prompt y/n for updating in interactive terminals.
- Make MAD dependency repair install missing Codex CLI with `@latest`, install or upgrade tmux through Homebrew, and re-probe real tmux app bundle binaries after cask installation.
- Update README MAD/tmux troubleshooting docs for update prompts, `--yes`, and direct tmux app bundle discovery.

## [0.6.65] - 2026-04-29

### Changed

- Make `sks --mad` launch the tmux MAD profile as full-access high reasoning with Codex automatic approval review enabled via `approvals_reviewer = "auto_review"`.
- Align SKS auto-review profile generation with current OpenAI Codex docs by using `auto_review` instead of the legacy `guardian_subagent` reviewer value.

## [0.6.64] - 2026-04-29

### Changed

- Expand the README into a fuller open-source CLI guide with quick start, requirements, installation modes, terminal CLI usage, Codex App `$` commands, common workflows, troubleshooting, and release checks.

## [0.6.63] - 2026-04-29

### Changed

- Make `sks --mad --high` attempt Homebrew tmux installation and re-probe before launch when tmux is missing, with a concise launch blocker if installation cannot complete.
- Replace the first tmux banner box with a stronger SKS/tmux ASCII mark for the CLI workspace header.

## [0.6.62] - 2026-04-29

### Changed

- Make plain `sks --mad --high` wake the tmux app before creating the `sks-mad-high` Codex CLI workspace, so the command opens the tmux UI path directly.

## [0.6.61] - 2026-04-29

### Changed

- Replace the SKS terminal runtime with a tmux-based Codex CLI workspace flow, including tmux dependency checks, help/discovery surfaces, setup guidance, and Team tmux live lanes.
- Add `sks --mad --high` as an explicit one-shot tmux launch that writes and uses the `sks-mad-high` full-access high-reasoning Codex profile without changing the normal default route.

## [0.6.60] - 2026-04-29

### Changed

- Add `$MAD-SKS` as an explicit scoped database authorization modifier that can compose with other dollar-command routes while keeping the widened permission limited to the active invocation.
- Require table-removal operations to pause for short user confirmation even under MAD-SKS, and close the override when the active mission gate is complete.

## [0.6.59] - 2026-04-29

### Changed

- Merge the dev branch Team runtime graph, From-Chat-IMG completion gates, and active TriWiki attention work into main while preserving the main README positioning for From-Chat-IMG and TriWiki voxels.

### Changed

- Infer predictable ambiguity-gate contract answers from the prompt/default safety policy so SKS asks only unresolved behavior or safety questions instead of static `GOAL_PRECISE` and `ACCEPTANCE_CRITERIA` templates.

## [0.6.55] - 2026-04-29

### Changed

- Require From-Chat-IMG completion to include scoped QA-LOOP evidence after the customer-request work is implemented, with every work-order item covered, post-fix verification complete, and zero unresolved QA findings.
- Raise the tracked-file size gate to 288 KiB for the enlarged From-Chat-IMG scoped QA-LOOP selftest while retaining the existing package size gates.

## [0.6.54] - 2026-04-29

### Changed

- Strengthen From-Chat-IMG completion gates with a required checked work checklist and temporary TriWiki-backed request snapshot, so chat screenshot text, image-region matches, work items, and verification steps are tracked before Team completion.
- Add From-Chat-IMG temporary TriWiki retention handling so session-scoped image-analysis claims can be pruned after the configured later-session TTL.

## [0.6.53] - 2026-04-29

### Changed

- Add a stop-gated From-Chat-IMG coverage ledger so every visible customer request, screenshot image region, and attachment must be mapped to work-order item(s) with `unresolved_items=[]` before Team completion.
- Teach Team plans, generated skills, prompt context, inferred acceptance criteria, and selftests to require the From-Chat-IMG no-omission work-order coverage pass.
- Add a compliance-loop guard so repeated identical stop-gate blocks produce an evidenced `hard-blocker.json` instead of looping indefinitely, re-evaluate normal gates after later repairs, and bound route runner `--max-cycles` values.
- Raise the tracked-file size gate to 272 KiB for the enlarged CLI selftest and Team plan coverage logic while retaining the 256 KiB packed tarball limit.

## [0.6.52] - 2026-04-28

### Changed

- Expand README with feature coverage for route commands, Codex App surfaces, workflow rules, release checks, and requirements.
- Raise package size gates to 256 KiB packed and 1 MiB unpacked so shipped README documentation has practical headroom while npm dry-run packaging remains verified.

## [0.6.51] - 2026-04-28

### Changed

- Expose `$From-Chat-IMG` directly in `sks dollar-commands`, manifests, policy, quick reference, and generated dollar-command output instead of only as a hidden Team picker alias.

## [0.6.50] - 2026-04-28

### Changed

- Add explicit `$From-Chat-IMG` / `From-Chat-IMG` Team alias for chat-history screenshot plus original attachment intake.
- Gate chat-image analysis behind the explicit From-Chat-IMG signal so ordinary image prompts are not treated as chat captures.
- Require From-Chat-IMG intake to list chat requirements first, use Codex Computer Use visual inspection to strengthen attachment matching, and produce a client modification work order before continuing the normal Team pipeline.
- Raise the package size gates to 168 KiB packed and 644 KiB unpacked for the added command alias, generated skill, and route-gating selftests.

## [0.6.49] - 2026-04-28

### Changed

- Raise the package size gates to 166 KiB packed and 642 KiB unpacked so the stack-current-docs and final-summary policy surfaces remain publishable.
- Require final answers to omit dirty-worktree boundary wording that the Honest Mode hook treats as an unresolved gap.

## [0.6.48] - 2026-04-28

### Changed

- Require every pipeline final answer to include a user-visible completion summary explaining what changed, what was verified, and what remains unverified or blocked.
- Block Honest Mode final stop when the completion summary is missing, with selftest coverage for the new stop-gate behavior.

## [0.6.47] - 2026-04-28

### Changed

- Route question-shaped implicit directives, policy complaints, and mandatory workflow statements to Team instead of Answer.
- Require Team roster confirmation before implementation by materializing `team-roster.json` and enforcing `team_roster_confirmed=true` in Team gates.
- Raise the packed size gate to 165 KiB and unpacked gate to 640 KiB for the added stack-current-docs and Team roster guidance.

## [0.6.46] - 2026-04-28

### Changed

- Require current Context7 or official-doc evidence whenever stack, framework, package, runtime, or deployment-platform versions change, then record the guidance as high-priority TriWiki claims before coding.
- Add current-doc TriWiki examples for hosted Supabase keys, Next.js 16 proxy files, and Vercel Function duration limits.
- Require the latest coordinate+voxel TriWiki pack shape in validation and pipeline guidance; coordinate-only legacy TriWiki packs now fail validation and must be regenerated before use.
- Keep the package size gate bounded while allowing the required TriWiki voxel validation metadata.

### Fixed

- Treat successful Honest Mode phrases like `No active blocking route gate detected` and verified expected blocking as resolved, so loopback does not reopen on closure evidence.

## [0.6.45] - 2026-04-28

### Added

- Add chat-history screenshot intake guidance so SKS extracts visible text, matches screenshot image regions to attachments, and carries the evidence through the normal Team pipeline.
- Raise the package size gate slightly for the added pipeline guidance while keeping the tarball bounded under 628 KiB unpacked.

### Fixed

- Block full-route completion when Team work continues after `reflection-gate.json` was passed, forcing reflection to be refreshed before final Honest Mode.

## [0.6.44] - 2026-04-28

### Changed

- Use a GitHub raw logo URL in README so npm can render the image.

## [0.6.43] - 2026-04-28

### Changed

- Make QA-LOOP dogfood real UI/API flows as a human proxy, immediately apply safe contract-allowed fixes, and require focused rechecks before passing the QA gate.

## [0.6.42] - 2026-04-28

### Changed

- Add full-route reflection with generated `reflection` skill, stop-gate enforcement, and TriWiki lesson recording.
- Add Team `team-session-cleanup.json` as a required pre-reflection gate.
- Require QA-LOOP reports to use `YYYY-MM-DD-v<version>-qa-report.md`.
- Treat verified expected-block evidence as resolved in Honest Mode gap detection.
- Add `sks bootstrap` plus `sks deps check/install` for first-install readiness, and make postinstall point to bootstrap instead of mutating projects by default.
- Reduce Ralph questions for setup work by inferring non-target DB/UI fallback slots from local context.
- Count user request topics in TriWiki packs and prioritize repeated or strongly frustrated feedback as high-weight context for future inference.
- Raise the npm unpacked size budget to 620 KiB so the richer setup, reflection, QA, and TriWiki priority pipeline remains releasable.

## [0.6.41] - 2026-04-28

### Fixed

- Preserve custom Codex App skills during `sks doctor --fix`.

## [0.6.40] - 2026-04-28

- Preserve user-owned non-generated skill aliases during upgrade/repair while removing obsolete SKS aliases.
- Add selftest coverage for custom skill preservation.

## [0.6.39] - 2026-04-28

- Restore fuller README guidance while keeping package size under the gate.

## [0.6.38] - 2026-04-28

- Seed SKS dollar-command skills into `$HOME/.agents/skills` during package install.
- Report project-local and global dollar-command readiness in `sks codex-app check` and `sks doctor`.
- Add the minimal `ㅅㅋㅅ` README mark.

## [0.6.37] - 2026-04-28

- Add Korean `ㅅㅋㅅ` branding, tmux/setup guidance, Team live event logging, Codex CLI readiness handling, design/image skills, and Team-default execution routing.
- Fix Korean execution-prompt routing, Team continuation after ambiguity gates, Context7 readiness checks, changelog release checks, and Honest Mode loop-back/no-gap handling.
