<div align="center">

# Sneakoscope Codex

**The proof-first swarm harness for Codex. Machine-verified completion, not vibes.**

[![npm version](https://img.shields.io/npm/v/sneakoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/sneakoscope)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=node.js&logoColor=white)](#requirements)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

![SKS live dashboard preview](docs/assets/sneakoscope-architecture-pipeline.jpg)

</div>

Sneakoscope Codex (`sks`) is a Codex CLI and Codex App harness for people who want parallel AI coding without losing proof. It gives Codex a simple front door, a dynamic worker swarm, a local dashboard, TriWiki project memory, and release gates that separate machine evidence from LLM opinion.

Current release: SKS **5.10.0**. New in this release: local-only dominance performance gates, lighter CLI cold starts and hooks, doctor/update fast paths, SSRF-safe Super-Search smoke, Naruto E2E tiers, retention performance smoke, and command/dollar performance scorecards. See [CHANGELOG.md](CHANGELOG.md).

## Install

```sh
npx sneakoscope install --yes
```

That one line installs/repairs the global package, runs `sks doctor --fix`, and leaves the Codex App surface ready. The plugin marketplace path is also prepared through `plugins/sks/.codex-plugin/plugin.json`.

For package-managed installs:

```sh
npm i -g sneakoscope
sks doctor --fix
```

## The Front Door

| Command | What it does |
| --- | --- |
| `$Plan "task"` | Planning only. Writes `.sneakoscope/plans/<slug>.md`; no code edits. |
| `$Work` | Executes the latest plan through evidence-gated SKS work. |
| `$Swarm "task"` | Runs the Naruto dynamic parallel swarm with machine verification. |
| `$Team "task"` | Deprecated v5 compatibility alias. New execution redirects to `$Naruto`; legacy Team observe/watch commands remain available for old missions. |
| `$MAD-SKS` / `sks mad-sks` | Single high-risk MAD route for scoped permission widening plus SQL-plane execution, including read-back proof and profile closure. |
| `$MAD-DB` / `sks mad-db` | Deprecated compatibility alias. Translates to `$MAD-SKS` sql-plane commands for one release. |
| `$Review` / `sks review --staged` | Reviews diffs with `evidence: machine` findings sorted above `evidence: llm`. |
| `sks ui` | Opens the local live dashboard at `http://127.0.0.1:4477`. |

## Why Not Just An LLM Reviewer?

| Question | Oracle-style LLM review | SKS gate/review |
| --- | --- | --- |
| Did tests/typecheck fail? | Another model may say so. | Machine check output is tagged `evidence: machine`. |
| Are findings ranked? | Usually one blended opinion. | Machine evidence sorts before LLM findings. |
| Can work stop? | The model decides. | Stop gates, Completion Proof, and Honest Mode decide. |
| Can I watch the swarm? | Usually no runtime UI. | Zellij panes plus `sks ui` SSE dashboard. |

## Dashboard

`sks ui` serves a dependency-free localhost dashboard with:

- mission, route, elapsed time, and gate badge
- live worker slot grid with role, backend/model badge, progress, and current task
- run/verify/queue/done/fail counters
- recent mission events
- current gate checklist

The dashboard binds to `127.0.0.1` only and exposes telemetry/gates/events, not config secrets.

## Demo

The reproducible VHS script lives at [docs/demo.tape](docs/demo.tape).

```sh
vhs docs/demo.tape
```

It shows the v5 flow: one-line install, `$Plan`, `$Work`/`$Swarm`, `sks review`, and `sks ui`.

## Proof Surfaces

- Dynamic swarm: `sks naruto run "task" --clones 14 --json`
- Review report: `.sneakoscope/reports/review-report.json`
- Harness benchmark: `.sneakoscope/reports/harness-benchmark.json`
- Project memory: `sks memory build`
- Codebase index/pack for LLM context: `sks wiki refresh --code`, `sks wiki validate --json` (code-pack freshness)
- Native capability repair: `sks doctor --fix` (imagegen/Computer Use/Browser Use), `.sneakoscope/reports/native-capability-readiness.json`
- Agent bridge for any agent system: `sks mcp-server`, `sks agent-bridge setup`, `SKS_AGENT_MODE=1` — see [docs/AGENT-BRIDGE.md](docs/AGENT-BRIDGE.md)
- Release gates: `node ./dist/scripts/release-gate-dag-runner.js --preset release --full`
- Release readiness notes: [docs/release-readiness.md](docs/release-readiness.md) and [CHANGELOG.md](CHANGELOG.md)
- Image generation review routes require Codex App `$imagegen`/`gpt-image-2` evidence with recorded output hashes; direct API fallback and mock fixtures do not satisfy full route gates.

## Requirements

- Node.js `>=20.11`
- Git for diff/review and release proof
- macOS optional: menu bar integration and `/usr/bin/open`
  - The menubar icon shows and hides itself automatically as the Codex desktop app launches/quits; set `quit_with_codex: true` in `~/.codex/sks-menubar/config.json` to have the menubar fully quit with Codex instead of just hiding (default `false`).
  - Native input dialogs (API keys, codex-lb setup) pass secrets to `sks` via `--api-key-stdin` instead of a visible Terminal window or process arguments.
  - The menubar dropdown's `View Last Log` item opens the most recent background action's log file, so you don't need to keep a Terminal window open to see command output.
  - `sks menubar status --json` reports a `codex_sync` object with `bundle_id`, `codex_running`, and `icon_visible_expected` to show Codex-lifecycle detection state.
- Zellij optional but recommended for terminal worker panes

## License

MIT
