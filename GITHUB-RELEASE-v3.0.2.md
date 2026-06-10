<!--
GitHub Release 작성 정보
- Tag: v3.0.2  (target: commit c487274 또는 main HEAD)
- Title: SKS 3.0.2 — Codex 0.139 Compatibility
- 아래 본문을 그대로 복사해서 사용하세요. 이 파일 자체는 커밋하지 마세요.
-->

# SKS 3.0.2 — Codex 0.139 Compatibility

Tracks Codex CLI [`rust-v0.139.0`](https://github.com/openai/codex/releases/tag/rust-v0.139.0). The supported baseline stays `rust-v0.136.0` — 0.139 features are detected and used opportunistically, never required.

```sh
npm i -g sneakoscope@3.0.2
```

## ✨ New Features

- **Codex 0.139 capability detection** (`codex:0139-capability` gate; `.sneakoscope/codex-0139-capability.json` root + mission artifacts written on `sks --mad` and `sks naruto run`):
  - standalone web search in code mode, including nested JS tool calls
  - preserved `oneOf`/`allOf` in tool/connector input schemas, shallower schema compaction
  - `codex doctor` editor/pager environment details
  - `codex plugin marketplace list --json` `source` field + cached remote catalog with background refresh
  - `-P` sandbox permissions profile alias
  - multi-agent v2 `interrupt_agent` rename
- Optional live probes via `SKS_CODEX_0139_PROBE=1` (marketplace JSON `source` shape, `-P` alias in `codex --help`); hermetic fixtures via `SKS_CODEX_0139_FAKE=1`.
- New doc: [docs/codex-0.139-compat.md](https://github.com/mandarange/Sneakoscope-Codex/blob/main/docs/codex-0.139-compat.md).

## 🐛 Bug Fixes

- Cockpit subagent-stage classification now accepts the Codex 0.139 multi-agent v2 `interrupt_agent` event name alongside the pre-0.139 `close_agent`, so lifecycle events keep mapping to `result` stages on newer CLIs.

## ✅ Verified

`codex:0139-capability` (including the negative case: 0.138 must not claim 0.139 features), 0.138 capability/probe gates, metadata, version-truth, docs-truthfulness, packlist, DAG runner/full-coverage, mutation-callsite-coverage, and changelog gates all pass; full release DAG green at publish.

**Full Changelog**: https://github.com/mandarange/Sneakoscope-Codex/compare/v3.0.0...v3.0.2 · [CHANGELOG.md](https://github.com/mandarange/Sneakoscope-Codex/blob/main/CHANGELOG.md)
