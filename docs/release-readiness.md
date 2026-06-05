# Release Readiness

SKS 2.0.5 is the local collaboration closure patch for the 2.0 line. It turns `sks with-local-llm on` from a saved toggle into a verified worker state by requiring a fresh schema-valid Ollama generation smoke before `verified`, promotes Local LLM and Python Codex SDK to Codex Control Plane backend surfaces, and pins `@openai/codex-sdk` to the 0.137 compatibility baseline.

The 2.0.5 release gate adds hermetic Local LLM structured-output/tool-repair/all-pipeline checks, GPT Final Arbiter enforcement for any local-participating pipeline, Python SDK capability/stream/sandbox/all-pipeline checks, Codex 0.137 plugin/runtime/approval compatibility checks, and real optional checks for Local LLM smoke/throughput/cache, Python SDK, Codex 0.137, and Zellij worker-pane proof.

SKS 2.0.4 is the local LLM / publish-readiness closure patch for the 2.0 line. It keeps the 2.0.2 MAD, Codex App Fast UI, provider, and Zellij release surface, then closes the new release DAG gaps for `sks update`, `$with-local-llm-on`, and `$with-local-llm-off` fixture coverage while keeping package-install mutation safety guarded and ledgered.

The 2.0.4 release gate requires all-feature completion/deep-completion to include the local LLM command fixtures, mutation callsite coverage to report zero uncovered risky package-install callsites, release metadata to mention 2.0.4 across versioned docs, and the package/lockfile/TypeScript/Rust/dist version surfaces to agree before publish checks proceed.

SKS 2.0.2 is the P0 closure patch for the Codex App Fast UI and MAD Zellij worker-pane release. Native worker execution routes through `runCodexTask`, UltraRouter records orchestrator/worker profile decisions, Reliability Shield hardens SDK streams, and Zellij remains the pane-level visual proof surface that links slot/generation/session records to SDK thread/provider/service-tier evidence.

The 2.0.2 release gate keeps the 2.0.0 `codex-control:*` and `ultra-router:*` coverage, keeps the 2.0.1 Codex App UI snapshot/preservation/clobber-guard/doctor repair checks, and adds actual `sks --mad` no-mutation proof, config.toml-backed provider context checks, MAD Zellij default pane-worker proof, WorkerPaneManager single-owner proof, no-production-MJS runtime checks including `bin/*.mjs`, and the TypeScript/Python boundary check.

SKS 1.21.8 continues to use OpenAI Codex CLI `rust-v0.136.0` as the current compatibility baseline while preserving the 0.135 routing/readiness fixes and inherited 0.134/0.133 matrices. Readiness records 0.136 session archive/unarchive commands, app-server `--stdio` and resumed-turn/status behavior, `CODEX_API_KEY` remote registration, short-lived remote-control server tokens, elevated Windows sandbox setup, feature-gated image-generation extension support, ChatGPT auth refresh/relogin-required handling, command-safety hardening, sandbox cleanup, Bedrock region fallback, and rmcp 1.7.0 compatibility. The local Codex App readiness check still reports user-config Fast UI blockers separately when `~/.codex/config.toml` contains top-level `model_reasoning_effort`.

The current `sks.release-readiness.v1` report covers actual Codex config-load truth, Codex config EPERM self-heal, doctor real-fix readiness, MAD launch preflight, Zellij readiness/proof, install-time Zellij dependency repair, Zellij socket-dir launch metadata, MAD attach-command visibility, Zellij clipboard/mouse-mode launch evidence, native-agent visual lane count evidence, and official Fast mode service-tier propagation. `ok: true` in the 1.21.3 readiness report means config readability, actual/fake Codex config-load proof, project config policy splitting, EPERM repair proof, MAD preflight, Zellij-only runtime checks, background-layout launch wiring, socket-dir fallback evidence, attach-command output evidence, clipboard command/mouse-mode evidence, native-agent right-pane lane evidence, and `-c service_tier=fast` propagation evidence have no remaining blockers.

Historical, live, or broader Codex/MAD/UX/PPT/DFix/Hook trust gates are reported when evidence exists, but they are marked `not_in_1_18_parallel_gate` when not run by this closure DAG. They are not silently treated as passed.

## Version, provenance, and side-effect readiness (1.21.0)

`release:version-truth` is the version surface gate. It verifies
`package.json`, `package-lock.json`, `src/core/version.ts`, `src/core/fsx.ts`,
`src/bin/sks.ts`, Cargo metadata/lockfile state, `dist/build-manifest.json`,
CHANGELOG, README display text when present, and the generic
`dist/scripts/release-metadata-check.js` entrypoint built from `src/scripts/release-metadata-check.ts`.

`release:provenance` writes `.sneakoscope/reports/release-provenance.json` with
`reviewed_ref`, current commit, package/dist/src/Cargo versions, latest versioned
CHANGELOG section, `origin/main` version when available, npm registry version, and
`v<version>` tag status. Dev review mode reports `main_out_of_date` as a warning.
Publish mode treats main/tag/npm mismatches as blockers.

`side-effect:runtime-report` is included in readiness and reports mutation-ledger
runtime totals. Readiness blocks on unexpected applied mutations, global mutations
without confirmation, or config/auth/skill mutations without backup or no-op proof.

## Publish authorization policy (1.20.2)

Publishing to npm requires a full `npm run release:check` (the complete hermetic gate
set) **plus** `npm run release:real-check` for environment-dependent proof. Direct
`npm publish` may use the fast path only when `.sneakoscope/reports/release-check-stamp.json`
matches the current package/source/dist state; when that stamp is missing or stale,
`prepublish:release-check-or-fast` runs the full `release:check` once and then
re-verifies the stamp. The change-aware incremental runner
`npm run release:check:dynamic:execute` is a local/CI acceleration only — it narrows
the gate set to changed inputs and caches results, so it **cannot** authorize a publish
on its own. See `docs/dynamic-release-pipeline.md` for the two-tier model.

`prepublishOnly` also runs `release-registry-check.mjs --require-publish-auth`
before `prepack`. That check uses the documented npm `whoami` identity and the
published package maintainer list to prove the current shell can publish
`sneakoscope`; otherwise it fails early with an `npm login --registry
https://registry.npmjs.org/` instruction instead of allowing the final registry
`PUT` to fail after the package build. If npm config already contains a token but
`whoami` returns `E401`, the token is treated as stale/revoked/wrong-scope and
the gate reports the redacted config location. Token-based publishing must be
configured through npm itself, for example an npmrc entry such as
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` plus an exported
publish-capable token; a raw `NPM_TOKEN` environment variable alone is not enough
unless npm config references it.

```bash
npm run xai-mcp:capability
npm run source-intelligence:policy
npm run source-intelligence:all-modes
npm run codex-web:adapter
npm run goal-mode:official-default
npm run agent:main-no-scout
npm run agent:worker-scout-limited
npm run agent:background-terminals
npm run zellij:layout-valid
npm run zellij:spawn-on-demand-layout
npm run zellij:worker-pane-manager
npm run zellij:worker-pane-spawn-order
npm run agent:slot-pane-binding-proof
npm run agent:worker-pane-communication-contract
npm run agent:zellij-dynamic-backfill-panes
npm run agent:task-graph-expansion
npm run agent:follow-up-work-schema
npm run agent:dynamic-pool-route-blackbox
npm run agent:backfill-route-blackbox
npm run agent:cli-options-to-task-graph
npm run agent:route-truth-backfill
npm run team:backfill-route-blackbox
npm run team:actual-route-backfill
npm run research:backfill-route-blackbox
npm run research:actual-route-backfill
npm run qa:backfill-route-blackbox
npm run qa:actual-route-backfill
npm run zellij:lane-renderer
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run agent:zellij-runtime
npm run agent:proof-contract-reconciled
npm run agent:scheduler-proof-hardening
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run agent:cleanup-executor
npm run agent:cleanup-executor-v2
npm run agent:cleanup-command-ux
npm run retention:cleanup-safety
npm run agent:intelligent-work-graph
npm run agent:ast-aware-work-graph
npm run proof:fake-vs-real-policy
npm run proof:fake-real-policy-v2
npm run release:runtime-truth-matrix
npm run imagegen:capability
npm run imagegen:gpt-image-2-request-validator
npm run codex-control:capability
npm run codex-control:no-legacy-fallback
npm run codex-control:structured-output
npm run codex-control:event-stream-ledger
npm run codex-control:thread-registry
npm run codex-control:side-effect-scope
npm run codex-control:all-pipelines
npm run codex-control:empty-result-retry
npm run codex-control:stream-idle-watchdog
npm run codex-control:tool-call-sequence-repair
npm run codex-control:keepalive-no-cot-leak
npm run ultra-router:classification
npm run ultra-router:auto-router
npm run codex:0.136-compat
npm run codex:0.135-compat
npm run codex:0.134-official-compat
npm run codex:profile-primary
npm run codex:managed-proxy-env
npm run strategy:adhd-orchestrating-gate
npm run strategy:parallel-modification-plan
npm run strategy:file-ownership-plan
npm run strategy:verification-rollback-dag
npm run appshots:capability
npm run appshots:operator-policy
npm run appshots:evidence
npm run appshots:source-intelligence
npm run appshots:thread-attachment-discovery
npm run appshots:triwiki-voxel
npm run appshots:privacy-safety
npm run mcp:0.134-modernization
npm run mcp:readonly-runtime-scheduler
npm run codex:0.134-runner-truth
npm run source-intelligence:codex-history-search
npm run hooks:0.134-context-parity
npm run agent:parallel-write-kernel
npm run agent:parallel-write-blackbox
npm run team:parallel-write-blackbox
npm run dfix:parallel-write-blackbox
npm run agent:patch-envelope-extraction
npm run agent:patch-queue-runtime
npm run agent:strategy-to-lease-wiring
npm run agent:patch-swarm-runtime
npm run agent:patch-swarm-runtime-truth
npm run agent:patch-transaction-journal
npm run agent:patch-conflict-rebase
npm run agent:strategy-to-patch-strict
npm run agent:rollback-command
npm run agent:native-cli-session-swarm
npm run agent:native-cli-session-swarm-10
npm run agent:native-cli-session-swarm-20
npm run agent:no-subagent-scaling
npm run agent:native-cli-session-proof
npm run agent:worker-backend-router
npm run agent:codex-child-overlap
npm run agent:model-authored-patch-envelope
npm run zellij:layout-valid
npm run zellij:pane-proof
npm run zellij:screen-proof
npm run mad-sks:zellij-launch
npm run agent:fast-mode-default
npm run agent:fast-mode-worker-propagation
npm run codex:fast-mode-profile-propagation
npm run mad-sks:fast-mode-propagation
npm run agent:patch-verification-dag
npm run agent:patch-rollback-dag
npm run agent:patch-proof-runtime
npm run agent:patch-swarm-route-blackbox
npm run team:patch-swarm-route-blackbox
npm run dfix:patch-swarm-route-blackbox
npm run agent:patch-proof
npm run agent:patch-rollback
npm run agent:real-codex-patch-envelope-smoke
npm run agent:real-codex-parallel-workers
npm run agent:real-codex-parallel-workers-5
npm run agent:real-codex-parallel-workers-10
npm run agent:real-codex-parallel-workers-20
npm run release:gate-existence-audit
npm run route:blackbox-realism
npm run agent:visual-consistency
npm run release:real-check
npm run release:parallel-full-coverage
npm run priority:full-closure
npm run release:metadata
npm run official-docs:compat
npm run release:readiness
```

`release:readiness` writes:

- `.sneakoscope/reports/release-readiness-1.21.8.json`
- `.sneakoscope/reports/release-readiness-1.21.8.md`
- `.sneakoscope/reports/all-feature-completion-1.21.8.json`
- `.sneakoscope/reports/all-feature-completion-1.21.8.md`
- `.sneakoscope/reports/official-docs-compat-1.21.8.json`
- `.sneakoscope/reports/official-docs-compat-1.21.8.md`
- `.sneakoscope/reports/agent-real-codex-dynamic-smoke-1.21.8.json`
- `.sneakoscope/reports/agent-real-codex-patch-envelope-smoke.json`
- `.sneakoscope/reports/agent-real-codex-parallel-workers.json`
- `.sneakoscope/reports/zellij-real-session-launch.json`
- `.sneakoscope/reports/runtime-truth-matrix-1.21.8.json`
- `.sneakoscope/reports/codex-0.136-compat.json`
- `.sneakoscope/reports/codex-0-134-official-compat.json`
- `.sneakoscope/reports/codex-0-134-runner-truth.json`
- `.sneakoscope/reports/mcp-0-134-modernization.json`
- `.sneakoscope/reports/mcp-readonly-runtime-scheduler.json`
- `.sneakoscope/reports/strategy-adhd-orchestrating-gate.json`
- `.sneakoscope/reports/appshots-evidence.json`
- `.sneakoscope/reports/appshots-thread-attachment-discovery.json`
- `.sneakoscope/reports/agent-parallel-write-kernel.json`
- `.sneakoscope/reports/agent-patch-envelope-extraction.json`
- `.sneakoscope/reports/agent-patch-queue-runtime.json`
- `.sneakoscope/reports/agent-strategy-to-lease-wiring.json`
- `.sneakoscope/reports/agent-patch-swarm-runtime.json`
- `.sneakoscope/reports/agent-patch-swarm-runtime-truth.json`
- `.sneakoscope/reports/agent-patch-transaction-journal.json`
- `.sneakoscope/reports/agent-patch-conflict-rebase.json`
- `.sneakoscope/reports/agent-strategy-to-patch-strict.json`
- `.sneakoscope/reports/agent-rollback-command.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm-10.json`
- `.sneakoscope/reports/agent-native-cli-session-swarm-20.json`
- `.sneakoscope/reports/agent-no-subagent-scaling.json`
- `.sneakoscope/reports/agent-native-cli-session-proof.json`
- `.sneakoscope/reports/agent-fast-mode-default.json`
- `.sneakoscope/reports/agent-fast-mode-worker-propagation.json`
- `.sneakoscope/reports/codex-fast-mode-profile-propagation.json`
- `.sneakoscope/reports/mad-sks-fast-mode-propagation.json`
- `.sneakoscope/reports/agent-patch-proof-runtime.json`
- `.sneakoscope/reports/agent-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/team-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/dfix-patch-swarm-route-blackbox.json`
- `.sneakoscope/reports/retention-cleanup-safety.json`

The report covers version drift, release metadata freshness, stale `dist` prevention, native proof artifact structure, Codex App cockpit artifacts, official docs compatibility, docs truthfulness, Source Intelligence proof, runtime truth matrix, Codex 0.136 release compatibility, inherited Codex 0.135/0.134 runner deltas, optional real Codex patch smoke next action, managed proxy propagation, MCP modernization, MCP readOnly runtime scheduling, Appshots thread provenance, proof-safe parallel patches, transaction journaling, conflict rebase, rollback command proof, native CLI worker process scaling, no-subagent scaling, Fast mode propagation, real Codex parallel worker proof, Zellij spawn-on-demand worker-pane proof, and the current 1.21.8 release closure gaps.

## Priority Closure

| Priority | Status Surface |
| --- | --- |
| P0 | Source Intelligence, safety, release, proof, runtime, task graph, follow-up schema, route backfill, no-Scout, terminal, real Zellij proof, cleanup executor, retention cleanup, fake-vs-real policy, and Goal blockers |
| P1 | Codex App dashboard/operator visibility for active slots, total work items, pending/active/completed counts, backfill, generation history, source, X AI, Codex Web, Goal, terminal, Zellij physical proof, cleanup status, and work graph score |
| P2 | Parallel provider queries, release DAG groups, local-only caches, refill latency, queue metrics, janitor throttling, capture-pane caps, bounded work graph scans, and worker-pool speed summaries |
| P3 | README, policy docs, migration, troubleshooting, CLI help, `--work-items`, active-slot semantics, real smoke envs, cleanup commands, retention cleanup wording, and onboarding |
| P4 | Human-readable summaries for source intelligence, X AI used/not used, Goal fallback, terminal close, Zellij persistence, physical pane proof, cleanup, scheduler health, and worker Scout evidence |
| P5 | Regression catalog for fake pane rejection, missing capture/list-panes, output-last-message absence, cleanup dry-run/apply, retention preserve/remove safety, work graph partial quality, non-agent route stand-ins, source refs, and Goal refs |
| P6 | Codex 0.136 compatibility, inherited Codex 0.135/0.134 compatibility, MCP 0.134 policy, managed proxy propagation, local Codex history search, strategy-first orchestration, Appshots evidence, parallel write kernel proof, and release gate existence audit |
| P7 | Patch swarm runtime truth, transaction journal, conflict rebase, strict strategy-to-patch coverage, rollback command proof, and real Codex patch smoke optional/required state |
| P8 | Dashboard, Trust Report, runtime truth, and human summary surfaces for patch swarm status, rollback command, changed files by agent, MCP scheduler status, and real Codex patch smoke next action |
| P9 | Native CLI Session Swarm proof, no-subagent scaling proof, and Fast mode default propagation across worker CLI, Codex exec, Zellij, and MAD paths |

MAD-SKS readiness remains high-friction: full-system authority requires explicit user authorization, scoped target roots, separate consent for system access, DB writes, package installation, service control, admin operations, network, Computer Use, destructive delete, and generated-asset edits. The SKS harness protected core remains immutable even under MAD-SKS.

Imagegen readiness is core: `npm run imagegen:capability` must detect the official Codex App `$imagegen`/`gpt-image-2` surface and explicitly report that capability detection is not output proof. Full visual verification still requires a real generated output file with path, hash, dimensions, and provider/output metadata. OpenAI Images API, Responses image-generation, codex-lb, and `CODEX_LB_API_KEY` routes are non-Codex API fallbacks; they may be used only for explicitly requested API fallback work and do not satisfy Codex App imagegen evidence. `npm run imagegen:gpt-image-2-request-validator` must prove SKS omits unsupported `input_fidelity` while preserving local-only generated-image artifacts. Fake adapters remain fixture-only and cannot satisfy full visual verification.

README architecture image replacement uses the same evidence policy but is a project asset handoff rather than a generic release gate. `npm run imagegen:readme-architecture` writes the official prompt/report, rejects stale or non-Codex output, and replaces the asset only when a real Codex App `$imagegen`/`gpt-image-2` output path and metadata prove the selected file belongs to the current prompt contract.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Codex Chrome Extension screenshots, native Computer Use screenshots, X AI raw responses, Codex Web raw responses, and generated gpt-image-2 review images are local-only by default.
