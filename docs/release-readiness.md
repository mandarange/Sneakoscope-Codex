# Release Readiness

SKS 1.14.0 writes the `sks.release-readiness.v1` final release seal against the Codex `rust-v0.133.0` runtime compatibility matrix plus the OpenAI Codex `latest` 10-event hook schema snapshot, OpenAI Image Generation `gpt-image-2` docs, OpenAI Structured Outputs docs, the UX-Review gpt-image-2 callout/fix/recheck loop, PPT imagegen review, DFix Extreme Speed Kernel evidence loops, the all-feature completion matrix, recursive JSON schema validation, hook trust warning-zero, and the function-only SKS update check contract.

```bash
npm run codex:0.133-compat
npm run codex:output-schema-fixture
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
npm run evidence:flagship-coverage
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

- `.sneakoscope/reports/release-readiness-1.14.0.json`
- `.sneakoscope/reports/release-readiness-1.14.0.md`
- `.sneakoscope/reports/all-feature-completion-1.14.0.json`
- `.sneakoscope/reports/all-feature-completion-1.14.0.md`
- `.sneakoscope/reports/official-docs-compat-1.14.0.json`
- `.sneakoscope/reports/official-docs-compat-1.14.0.md`

The report covers version drift, Codex 0.133 structured resume output, goal defaults, remote-control foreground app-server behavior, permission profiles/requirements, plugin discovery/marketplace mapping, latest 10-event hook schema and trust state, source image fidelity metadata, UX-Review command wiring, generated callout ingestion, real extraction reports, text-only fallback blocking, PPT real export/imagegen/re-review wiring, DFix error signatures/path decisions/cache/patch runner/verification selector/performance artifacts, all-feature deep coverage, recursive JSON schema recursion checks, Image Voxel relations, memory summary rebuilds, repeated blocker stops, official docs compatibility, hook strict subset status, Computer Use evidence mode support, codex-lb persistence truth, docs truthfulness, and remaining P0 gaps. A passing report has no remaining P0 gaps.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots and generated gpt-image-2 review images are local-only by default, and screenshot binaries are not automatically published into shared TriWiki.
