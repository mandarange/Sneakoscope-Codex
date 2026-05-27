# Release Readiness

SKS 1.18.6 writes the `sks.release-readiness.v1` report for the deep runtime-truth closure DAG: TypeScript-only runtime, `dist` freshness/parity manifest, native route proof artifact structure, Codex App agent cockpit, work-item-first task graph, schema-bound follow-up work items, actual route blackbox backfill checks, persistent tmux lane supervisor, lifecycle-wired real tmux pane proof, real Codex dynamic smoke v2, process-tree cleanup executor v2, cleanup command UX, AST-aware intelligent work graph, fake-vs-real proof policy v2, runtime truth matrix, scheduler proof hardening, parallel verification DAG, project-scoped session namespace, continuous agent janitor, Source Intelligence, X AI/Codex Web policy, Codex official Goal mode, main no-Scout, worker Scout-limited, release metadata, docs truthfulness, and official-docs compatibility. `ok: true` means there are no remaining 1.18.6 runtime-truth closure DAG gaps.

Historical, live, or broader Codex/MAD/UX/PPT/DFix/Hook trust gates are reported when evidence exists, but they are marked `not_in_1_18_parallel_gate` when not run by this closure DAG. They are not silently treated as passed.

```bash
npm run xai-mcp:capability
npm run source-intelligence:policy
npm run source-intelligence:all-modes
npm run codex-web:adapter
npm run goal-mode:official-default
npm run agent:main-no-scout
npm run agent:worker-scout-limited
npm run agent:background-terminals
npm run agent:tmux-right-lanes
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
npm run agent:tmux-lane-persistence
npm run agent:tmux-lane-no-flicker
npm run agent:tmux-supervisor-integrated
npm run agent:tmux-slot-lane-runtime
npm run agent:proof-contract-reconciled
npm run agent:scheduler-proof-hardening
npm run agent:tmux-physical-lifecycle-wired
npm run agent:tmux-physical-proof-v2
npm run agent:cleanup-executor
npm run agent:cleanup-executor-v2
npm run agent:cleanup-command-ux
npm run agent:intelligent-work-graph
npm run agent:ast-aware-work-graph
npm run proof:fake-vs-real-policy
npm run proof:fake-real-policy-v2
npm run release:runtime-truth-matrix
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

- `.sneakoscope/reports/release-readiness-1.18.6.json`
- `.sneakoscope/reports/release-readiness-1.18.6.md`
- `.sneakoscope/reports/all-feature-completion-1.18.6.json`
- `.sneakoscope/reports/all-feature-completion-1.18.6.md`
- `.sneakoscope/reports/official-docs-compat-1.18.6.json`
- `.sneakoscope/reports/official-docs-compat-1.18.6.md`
- `.sneakoscope/reports/agent-real-codex-dynamic-smoke-1.18.6.json`
- `.sneakoscope/reports/agent-real-tmux-physical-proof-1.18.6.json`
- `.sneakoscope/reports/runtime-truth-matrix-1.18.6.json`

The report covers version drift, release metadata freshness, stale `dist` prevention, native proof artifact structure, Codex App cockpit artifacts, janitor/session isolation, parallel verification proof, official docs compatibility, docs truthfulness, Source Intelligence proof, Goal mode status, agent terminal generation closure, persistent tmux lanes, real tmux physical pane truth, cleanup executor proof, AST-aware work graph quality, fake-vs-real subsystem levels, runtime truth matrix, task graph/work queue expansion, follow-up work item schema, actual route blackbox backfill metrics, and remaining 1.18.6 P0-P5 closure gaps.

## Priority Closure

| Priority | Status Surface |
| --- | --- |
| P0 | Source Intelligence, safety, release, proof, runtime, task graph, follow-up schema, route backfill, no-Scout, terminal, real tmux proof, cleanup executor, fake-vs-real policy, and Goal blockers |
| P1 | Codex App dashboard/operator visibility for active slots, total work items, pending/active/completed counts, backfill, generation history, source, X AI, Codex Web, Goal, terminal, tmux physical proof, cleanup status, and work graph score |
| P2 | Parallel provider queries, release DAG groups, local-only caches, refill latency, queue metrics, janitor throttling, capture-pane caps, bounded work graph scans, and worker-pool speed summaries |
| P3 | README, policy docs, migration, troubleshooting, CLI help, `--work-items`, active-slot semantics, real smoke envs, cleanup commands, and onboarding |
| P4 | Human-readable summaries for source intelligence, X AI used/not used, Goal fallback, terminal close, tmux persistence, physical pane proof, cleanup, scheduler health, and worker Scout evidence |
| P5 | Regression catalog for fake pane rejection, missing capture/list-panes, output-last-message absence, cleanup dry-run/apply, work graph partial quality, non-agent route stand-ins, source refs, and Goal refs |

MAD-SKS readiness remains high-friction: full-system authority requires explicit user authorization, scoped target roots, separate consent for system access, DB writes, package installation, service control, admin operations, network, Computer Use, destructive delete, and generated-asset edits. The SKS harness protected core remains immutable even under MAD-SKS.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots, X AI raw responses, Codex Web raw responses, and generated gpt-image-2 review images are local-only by default.
