# Release Readiness

SKS 1.10.0 writes the `sks.release-readiness.v1` final release seal against the Codex `rust-v0.132.0` compatibility matrix, OpenAI Image Generation `gpt-image-2` docs, OpenAI Structured Outputs docs, the UX-Review gpt-image-2 callout/fix/recheck loop, and the function-only SKS update check contract.

```bash
npm run codex:0.132-compat
npm run codex:output-schema-fixture
npm run image-fidelity:check
npm run ux-review:real-loop-fixture
npm run ux-review:no-text-fallback
npm run ux-review:image-voxel-relations
npm run memory-summary:rebuild-check
npm run loop-blocker:check
npm run official-docs:compat
npm run computer-use:live-evidence
npm run codex-lb:persistence-truth
npm run docs:truthfulness
npm run release:readiness
```

`release:readiness` writes:

- `.sneakoscope/reports/release-readiness-1.10.0.json`
- `.sneakoscope/reports/release-readiness-1.10.0.md`
- `.sneakoscope/reports/official-docs-compat-1.10.0.json`
- `.sneakoscope/reports/official-docs-compat-1.10.0.md`

The report covers version drift, Codex 0.132 structured resume output, source image fidelity metadata, UX-Review generated callout ingestion, text-only fallback blocking, Image Voxel relations, memory summary rebuilds, repeated blocker stops, official docs compatibility, hook strict subset status, Computer Use evidence mode support, codex-lb persistence truth, docs truthfulness, and remaining P0 gaps. A passing report has no remaining P0 gaps.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

UX-Review truthfulness is bounded the same way: a real verified UX claim requires a source screenshot, a generated gpt-image-2 annotated callout image, schema-bound issue extraction from generated image pixels, bounded safe fixes when requested, and recapture/re-review evidence for changed screens. Attached generated images start with `callout_extraction_status: pending`; mock fixtures remain `verified_partial`, and prose-only screenshot critique or generic fake callouts cannot pass the gate.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots and generated gpt-image-2 review images are local-only by default, and screenshot binaries are not automatically published into shared TriWiki.
