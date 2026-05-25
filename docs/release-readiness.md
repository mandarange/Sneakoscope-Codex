# Release Readiness

SKS 1.18.1 writes the `sks.release-readiness.v1` report for the dynamic agent pool closure DAG: TypeScript-only runtime, `dist` freshness/parity manifest, native route proof artifact structure, Codex App agent cockpit, parallel verification DAG, project-scoped session namespace, continuous agent janitor, Source Intelligence, X AI/Codex Web policy, Codex official Goal mode, main no-Scout, worker Scout-limited, generation-aware terminal close proof, tmux right-lane pane evidence, release metadata, docs truthfulness, dynamic pool replenishment, and official-docs compatibility. `ok: true` means there are no remaining 1.18.1 closure DAG gaps.

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
npm run agent:visual-consistency
npm run release:parallel-full-coverage
npm run priority:full-closure
npm run release:metadata
npm run official-docs:compat
npm run release:readiness
```

`release:readiness` writes:

- `.sneakoscope/reports/release-readiness-1.18.1.json`
- `.sneakoscope/reports/release-readiness-1.18.1.md`
- `.sneakoscope/reports/all-feature-completion-1.18.1.json`
- `.sneakoscope/reports/all-feature-completion-1.18.1.md`
- `.sneakoscope/reports/official-docs-compat-1.18.1.json`
- `.sneakoscope/reports/official-docs-compat-1.18.1.md`

The report covers version drift, release metadata freshness, stale `dist` prevention, native proof artifact structure, Codex App cockpit artifacts, janitor/session isolation, parallel verification proof, official docs compatibility, docs truthfulness, Source Intelligence proof, Goal mode status, agent terminal generation closure, tmux right lanes, dynamic backfill metrics, and remaining 1.18.1 P0-P4 closure gaps.

## Priority Closure

| Priority | Status Surface |
| --- | --- |
| P0 | Source Intelligence, safety, release, proof, runtime, no-Scout, terminal, tmux, and Goal blockers |
| P1 | Codex App dashboard/operator visibility for source, X AI, Codex Web, Goal, terminal, and tmux |
| P2 | Parallel provider queries, release DAG groups, local-only caches, and speedup summaries |
| P3 | README, policy docs, migration, troubleshooting, CLI help, and onboarding |
| P4 | Human-readable summaries for source intelligence, X AI used/not used, Goal fallback, terminal close, tmux attach, janitor, and worker Scout evidence |

MAD-SKS readiness remains high-friction: full-system authority requires explicit user authorization, scoped target roots, separate consent for system access, DB writes, package installation, service control, admin operations, network, Computer Use, destructive delete, and generated-asset edits. The SKS harness protected core remains immutable even under MAD-SKS.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots, X AI raw responses, Codex Web raw responses, and generated gpt-image-2 review images are local-only by default.
