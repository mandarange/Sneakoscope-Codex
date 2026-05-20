# Release Readiness

SKS 1.0.7 adds `sks.release-readiness.v1` report artifacts for the final release seal.

```bash
npm run computer-use:live-evidence
npm run codex-lb:persistence-truth
npm run docs:truthfulness
npm run release:readiness
```

`release:readiness` writes:

- `.sneakoscope/reports/release-readiness-1.0.7.json`
- `.sneakoscope/reports/release-readiness-1.0.7.md`

The report covers hook strict subset status, Computer Use evidence mode support, codex-lb persistence truth, docs truthfulness, and remaining P0 gaps. A passing report has no remaining P0 gaps.

Computer Use truthfulness remains bounded: `probe_only` is a capability probe, `live_capture_success` is local-only captured evidence, and `live_capture_blocked` records Codex App, macOS permission, or official capture-surface blockers. SKS does not fabricate screenshots and does not claim universal Computer Use availability.

codex-lb truthfulness remains bounded: `durable_env_file`, `durable_keychain`, `durable_launchctl`, and `shell_profile` are durable setup modes, while `process_only_ephemeral` means the supplied key is only effective in the current process. Recovery command:

```bash
sks codex-lb setup --write-env-file --keychain --launchctl
```

Privacy statement: secrets are redacted, Computer Use screenshots are local-only by default, and screenshot binaries are not automatically published into shared TriWiki.
