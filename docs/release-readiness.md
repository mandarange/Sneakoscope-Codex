# Release Readiness

SKS 1.16.0 writes the `sks.release-readiness.v1` final release seal against the Codex `rust-v0.133.0` runtime compatibility matrix plus the OpenAI Codex `latest` 10-event hook schema snapshot, MAD-SKS full-system authority evidence, actual executor blackbox evidence, Immutable Harness Guard evidence, stale-`dist` freshness checks, Codex exec output-schema syntax parity for fresh `exec` and `exec resume`, native agent backend gates, legacy multi-agent removal, proof graph v3/v4, OpenAI Image Generation `gpt-image-2` docs, OpenAI Structured Outputs docs, UX-Review real imagegen smoke, PPT full synthetic deck E2E evidence, DFix evidence loops, recursive JSON schema validation, hook trust warning-zero v2, and the function-only SKS update check contract.

```bash
npm run codex:0.133-compat
npm run codex:exec-syntax-parity
npm run codex:output-schema-fixture
npm run mad-sks:permission-model
npm run mad-sks:immutable-harness
npm run mad-sks:actual-executor
npm run mad-sks:file-write-executor
npm run mad-sks:shell-executor
npm run mad-sks:package-executor
npm run mad-sks:service-executor
npm run mad-sks:db-executor
npm run mad-sks:rollback-apply
npm run mad-sks:live-guard-smoke
npm run mad-sks:executor-proof-graph
npm run release:dist-freshness
npm run image-fidelity:check
npm run imagegen:capability
npm run imagegen:gpt-image-2-request-validator
npm run ux-review:run-wires-imagegen
npm run ux-review:extract-wires-real-extractor
npm run ux-review:patch-diff-recheck
npm run ux-review:imagegen-blackbox
npm run ux-review:real-loop-fixture
npm run ux-review:generate-callouts-fixture
npm run ux-review:extract-real-callouts-fixture
npm run ux-review:patch-handoff-fixture
npm run ux-review:recapture-recheck-fixture
npm run ux-review:no-text-fallback
npm run ux-review:no-fake-callouts
npm run ux-review:image-voxel-relations
npm run ppt:imagegen-review-fixture
npm run ppt:real-export-adapter
npm run ppt:real-imagegen-wiring
npm run ppt:reexport-rereview
npm run ppt:imagegen-blackbox
npm run ux-ppt:structured-extraction
npm run ppt:slide-export-fixture
npm run ppt:no-text-fallback
npm run ppt:no-mock-as-real
npm run ppt:issue-extraction-fixture
npm run ppt:image-voxel-relations
npm run ppt:proof-trust-fixture
npm run dfix:fast-kernel
npm run dfix:blackbox-fast
npm run dfix:performance
npm run dfix:fixture
npm run dfix:patch-handoff
npm run dfix:verification-recommendation
npm run dfix:verification
npm run all-features:completion
npm run all-features:deep-completion
npm run flagship:proof-graph-v4
npm run agent:legacy-multiagent-removed
npm run release:native-agent-backend
npm run json-schema:recursive-check
npm run release:metadata
npm run memory-summary:rebuild-check
npm run loop-blocker:check
npm run official-docs:compat
npm run hooks:latest-schema-check
npm run hooks:trust-state-check
npm run hooks:trust-warning-zero
npm run hooks:subagent-events-check
npm run hooks:no-unsupported-handlers
npm run hooks:actual-parity-check
npm run hooks:official-hash-parity
npm run hooks:managed-install-fixture
npm run hooks:runtime-replay-warning-zero
npm run computer-use:live-evidence
npm run codex-lb:persistence-truth
npm run docs:truthfulness
npm run release:readiness
```

`release:readiness` writes:

- `.sneakoscope/reports/release-readiness-1.16.0.json`
- `.sneakoscope/reports/release-readiness-1.16.0.md`
- `.sneakoscope/reports/all-feature-completion-1.16.0.json`
- `.sneakoscope/reports/all-feature-completion-1.16.0.md`
- `.sneakoscope/reports/official-docs-compat-1.16.0.json`
- `.sneakoscope/reports/official-docs-compat-1.16.0.md`

The report covers version drift, release metadata freshness, stale `dist` prevention, Codex 0.133 structured output for `exec` and `exec resume`, MAD-SKS authorization manifests, allowed/forbidden scope decisions, actual executor blackbox reports, immutable protected-core snapshots, audit ledgers, rollback plans, proof graph v3/v4 links, native agent backend gates, legacy multi-agent removal, goal defaults, remote-control foreground app-server behavior, permission profiles/requirements, plugin discovery/marketplace mapping, latest 10-event hook schema and trust state, source image fidelity metadata, UX-Review command wiring, generated callout ingestion, real extraction reports, PPT real export/imagegen/re-review wiring, DFix evidence, all-feature deep coverage, recursive JSON schema checks, Image Voxel relations, memory summary rebuilds, repeated blocker stops, official docs compatibility, hook strict subset status, Computer Use evidence mode support, codex-lb persistence truth, docs truthfulness, and remaining P0 gaps. A passing report has no remaining P0 gaps.

MAD-SKS readiness is intentionally high-friction: full-system authority requires explicit user authorization, scoped target roots, separate consent for system access, DB writes, package installation, service control, admin operations, network, Computer Use, destructive delete, and generated-asset edits. The SKS harness protected core remains immutable even under MAD-SKS.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate. When generated annotated images cannot be created or linked, release readiness may accept only `verified_partial/reference-only` closeout, requiring source screenshots plus hashes, docs evidence, source Image Voxel anchors, and Honest Mode evidence.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots and generated gpt-image-2 review images are local-only by default, and screenshot binaries are not automatically published into shared TriWiki.
