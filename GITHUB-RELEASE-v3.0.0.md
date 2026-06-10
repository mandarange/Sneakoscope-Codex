<!--
GitHub Release 작성 정보
- Tag: v3.0.0  (target: commit bddf32d)
- Title: SKS 3.0.0 — Parallel Runtime Stabilization
- 아래 본문을 그대로 복사해서 사용하세요. 이 파일 자체는 커밋하지 마세요.
-->

# SKS 3.0.0 — Parallel Runtime Stabilization 🍥

The whole live-swarm experience — what you actually **see** while 5, 20, or 100 workers run — was rebuilt and proven end-to-end with a real Zellij 0.44 session.

```sh
npm i -g sneakoscope@3.0.0
sks --mad
```

## ✨ Highlights

**Slot panes are finally alive.** The watch renderer used to freeze for entire missions: the telemetry snapshot cache never invalidated, so `--watch` loops re-rendered the first frame forever. Snapshot reads are now mtime-aware, multi-process flushes merge instead of clobbering each other's slots, and the on-disk `updated_at` stays authoritative for stale detection. Each worker pane now streams heartbeat, current file, tool events, and stdout tails every second.

**One SLOTS column, vertical stack.** Concurrent workers raced anchor creation and each opened its own right column with `--direction right`, fragmenting the screen into N side-by-side splits. Anchor + worker pane creation is now serialized per session, and workers join a native Zellij stacked-pane group (`new-pane --stacked`, zellij ≥ 0.43). Opt out with `SKS_ZELLIJ_WORKER_STACKED=0`.

**Zellij stays current like Codex does.** `sks --mad` / `sks naruto run` offer a `[Y/n]` upgrade to the latest stable Zellij (GitHub releases lookup, 6h on-disk cache), plus an explicit `sks zellij update [--yes]` subcommand. Skip with `--skip-zellij-update` or `SKS_SKIP_ZELLIJ_UPDATE=1`. Brew installs run through the mutation guard with a `zellij_install` scope contract.

## 🚀 New Features

- Live `compact-slots` renderer is the default worker pane UI (`full-debug` stayed blank until worker exit because workers run with `--json`; it remains available via `--zellij-full-debug`).
- Naruto finalizer policy wired into the run result: `naruto-finalizer.json` artifact plus a console blocker line when local-LLM output still needs the GPT final arbiter.
- Worker completion/failure messages flow through the agent message bus (`agent-messages.jsonl`) for operator-readable swarm history.
- Stacked-pane placement metadata (`worker_stacked_requested` / `worker_stacked_applied`) recorded in pane artifacts and launch ledgers.

## 🐛 Bug Fixes

- `focus-pane-id` returning non-zero for an already-focused pane silently degraded stacked placement to plain down-splits.
- Scheduler batch dispatch serialized two telemetry file writes per worker before launching the next one; telemetry appends now run concurrently across launches while preserving per-slot ordering.
- Naruto backpressure throttling (50% throttled / 25% saturated under host pressure) is reported in the run header instead of staying silent.
- GitHub release tags with a leading `v` failed version parsing in the zellij update check.
- Swarm summary under-reported renderer-backed worker panes as 0 in the default UI mode.

## ⚡ Release Engineering

- `npm publish` no longer re-runs the entire release DAG from zero on every version bump: gate cache keys hash the five version-surface files version-neutrally, so a pure `sks versioning bump` keeps ~280 behavior-gate caches warm while version-correctness gates (cache-disabled) still re-run. Restore old behavior with `SKS_RELEASE_CACHE_VERSION_SENSITIVE=1`.
- The published package is immune to stray TypeScript build artifacts: `files` now excludes `dist/**/*.d.ts`, `*.map`, and `*.tsbuildinfo` (4,683 → 829 packed files).

## 🗑️ Removed

- Dead swarm code: `naruto-work-stealing.ts` (never invoked; scheduler backfill already refills idle slots) and `zellij-right-column-layout-proof.ts` (no consumers).

## ✅ Verified

471 unit tests (0 regressions), 18 zellij/naruto/mad gate scripts, full 327-gate release DAG, and a live E2E: 3 concurrent workers through the production swarm path against real Zellij 0.44.3 — one shared anchor, `stacked=true` group, live renderers, zero blockers.

**Full Changelog**: https://github.com/mandarange/Sneakoscope-Codex/compare/v2.0.16...v3.0.0 · [CHANGELOG.md](https://github.com/mandarange/Sneakoscope-Codex/blob/main/CHANGELOG.md)
