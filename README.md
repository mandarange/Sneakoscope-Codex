<div align="center">


<!-- BEGIN SKS SEARCH VISIBILITY MARKETING -->
## Search Visibility Positioning

sneakoscope is a proof-first Codex trust layer for bounded agent workflows, search visibility, and evidence-backed release gates.

- Source-ledger claims are kept in SKS marketing research and strategy artifacts.
- SEO/GEO mutation plans update only package metadata and this managed README block in this release.
- External visibility outcomes require separate measured evidence.
<!-- END SKS SEARCH VISIBILITY MARKETING -->

# Sneakoscope Codex

**The proof-first workflow harness for Codex. Machine-verified completion, not vibes.**

[![npm version](https://img.shields.io/npm/v/sneakoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/sneakoscope)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=node.js&logoColor=white)](#requirements)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

![SKS live dashboard preview](https://raw.githubusercontent.com/mandarange/Sneakoscope-Codex/main/docs/assets/sneakoscope-architecture-pipeline.jpg)

</div>

Sneakoscope Codex (`sks`) is a Codex CLI and Codex App harness for people who want parallel AI coding without losing proof. It gives Codex a simple front door, an official subagent workflow, a local dashboard, TriWiki project memory, and release gates that separate machine evidence from LLM opinion.

Current release: SKS **6.1.2**. `$Naruto` is the SKS alias for the Codex official subagent workflow. The parent runs on GPT-5.6 Sol Max, clear bounded subagents use GPT-5.6 Luna Max, and reasoning-sensitive work such as UI, review, debugging, planning, integration, security, database, and release judgment uses GPT-5.6 Sol Max. Official `SubagentStart`/`SubagentStop` events prove lifecycle only; successful completion additionally requires a structured parent summary with an explicit outcome for every thread. Preparation context alone is never completion proof. Normal non-Naruto Codex sessions continue to preserve explicit user model choices. See [CHANGELOG.md](CHANGELOG.md).

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

The SKS menu bar shows the installed Codex CLI version and latest known version. An `⬆` marker appears when an update is available; **Update Codex CLI Now** uses native `codex update` when the selected CLI advertises it, otherwise it verifies the installation provenance and invokes the matching official standalone-installer, npm-global, or Homebrew-cask update method. If the method cannot be verified, it fails closed instead of guessing. This is an explicit global tool mutation. **Run sks doctor --fix** performs the global-only menu repair flow without treating the user's home directory as a project.

## The Front Door

| Command | What it does |
| --- | --- |
| `$Plan "task"` | Planning only. Writes `.sneakoscope/plans/<slug>.md`; no code edits. |
| Explicit `$Work` | Executes the latest plan through evidence-gated SKS work. Ordinary prose containing “work” is not treated as this alias. |
| `$Swarm "task"` | Compatibility alias for the Naruto Codex official subagent workflow. |
| `$Team "task"` | Deprecated v5 compatibility alias. New execution redirects to `$Naruto`; legacy Team observe/watch commands remain available for old missions. |
| `$MAD-SKS` / `sks mad-sks` | Single high-risk MAD route for scoped permission widening plus SQL-plane execution, including read-back proof and profile closure. |
| `$MAD-DB` / `sks mad-db` | Deprecated compatibility alias. Translates to `$MAD-SKS` sql-plane commands for one release. |
| `$Review` / `sks review --staged` | Reviews diffs with `evidence: machine` findings sorted above `evidence: llm`. |
| `sks ui` | Opens the local live dashboard at `http://127.0.0.1:4477`. |

## Naruto In 6.1.2

`$Naruto` and `sks naruto run "task" --agents 8 --max-threads 12` use Codex official subagents. The parent is GPT-5.6 Sol Max; clear bounded `worker`/exploration slices use GPT-5.6 Luna Max; UI, testing, debugging, architecture, integration, security, database, research, release, and other judgment-sensitive work use narrow GPT-5.6 Sol Max custom specialists.

Fresh SKS-owned project config uses `max_threads = 12`, `max_depth = 1`, `job_max_runtime_seconds = 1200`, and `interrupt_message = true`. `max_depth = 1` means subagents cannot spawn nested subagents. Explicit user limits are preserved, and larger requests run in waves.

Gates are task-profile aware: greetings and answer-only turns create no mission gate; tiny work gets minimal verification; parallel work gets scoped ownership and verification; high-risk work keeps the full safety gates. `SubagentStart`/`SubagentStop` prove lifecycle only. Completion also requires `subagent-parent-summary.json` with one trustworthy structured outcome per thread, correlated with `subagent-events.jsonl` and `subagent-evidence.json`.

SKS installs sixteen narrow project custom agents and recommends only the roles relevant to the task. Automatic fan-out is one child by default, two for explicit parallel work or independent risk domains, and three only for critical multi-domain work; explicit `--agents N` is still supported. In CLI Zellij mode, the right side is a live observability surface rather than a static lane reservation: one monitor plus one viewport by default (maximum three) shows official thread role/model, redacted live phase/task/file updates from exact-agent Codex 0.144.1+ rollouts, `running`, `verifying`, and trustworthy parent-verdict completion/failure states. Rollout activity is display-only and never completion proof.

`--clones` and `workers` remain one-release spelling aliases for official subagent behavior. The historical Naruto process swarm and its environment opt-in are removed; legacy backend, scheduler, pool, and model flags fail closed.

## Why Not Just An LLM Reviewer?

| Question | Oracle-style LLM review | SKS gate/review |
| --- | --- | --- |
| Did tests/typecheck fail? | Another model may say so. | Machine check output is tagged `evidence: machine`. |
| Are findings ranked? | Usually one blended opinion. | Machine evidence sorts before LLM findings. |
| Can work stop? | The model decides. | Stop gates, Completion Proof, and Honest Mode decide. |
| Can I inspect agent-thread progress? | Usually no runtime UI. | `sks ui` plus the official Codex subagent/thread surfaces. |

## Dashboard

`sks ui` serves a dependency-free localhost dashboard with:

- mission, route, elapsed time, and gate badge
- live official subagent thread grid with role/model badge, progress, and current task
- run/verify/queue/done/fail counters
- recent mission events
- current gate checklist

The dashboard binds to `127.0.0.1` only and exposes telemetry/gates/events, not config secrets.

## Demo

The reproducible VHS script lives at [docs/demo.tape](docs/demo.tape).

```sh
vhs docs/demo.tape
```

It shows the current quickstart flow: one-line install, `$Plan`, `sks review`, `sks ui`, and an official `$Naruto` subagent run.

## Proof Surfaces

- Official subagents: `sks naruto run "task" --agents 14 --max-threads 12 --json`
- Review report: `.sneakoscope/reports/review-report.json`
- Harness benchmark: `.sneakoscope/reports/harness-benchmark.json`
- Project memory: `sks memory build`
- Codebase index/pack for LLM context: `sks wiki refresh --code`, `sks wiki validate --json` (code-pack freshness)
- Native capability repair: `sks doctor --fix` (imagegen/Computer Use/Browser Use), `.sneakoscope/reports/native-capability-readiness.json`
- codex-lb continuity: `sks codex-lb status --json` verifies the selected proxy's unauthenticated `/health` `X-App-Version`. Tool-heavy continuation requires codex-lb `1.21.0-beta.3` or later; older or unverified deployments block setup, doctor, and launch instead of silently falling back.
- Agent bridge for any agent system: `sks mcp-server`, `sks agent-bridge setup`, `SKS_AGENT_MODE=1` — see [docs/AGENT-BRIDGE.md](docs/AGENT-BRIDGE.md)
- Release gates: `npm run release:check:affected` for ordinary change-aware verification and `npm run release:check:confidence` for the final local confidence pass.
- Release preparation handoff: run `npm run typecheck --silent`, one `npm run build:clean --silent`, focused tests for the changed surfaces, `npm run release:check:affected`, `npm run release:check:confidence`, and finally `npm pack --dry-run --ignore-scripts --json`. Publish authorization and publication remain a distinct repository-maintainer workflow.
- Release readiness notes: [docs/release-readiness.md](docs/release-readiness.md) and [CHANGELOG.md](CHANGELOG.md)
- Image generation review routes require Codex App `$imagegen`/`gpt-image-2` evidence with recorded output hashes; direct API fallback and mock fixtures do not satisfy full route gates.

## Requirements

- Node.js `>=20.11`
- Git for diff/review and release proof
- macOS optional: menu bar integration and `/usr/bin/open`
  - The menubar icon shows and hides itself automatically as the Codex desktop app launches/quits; set `quit_with_codex: true` in `~/.codex/sks-menubar/config.json` to have the menubar fully quit with Codex instead of just hiding (default `false`).
  - Native input dialogs (API keys, codex-lb setup) pass secrets to `sks` via `--api-key-stdin` instead of a visible Terminal window or process arguments.
  - Auth/provider changes wait for the ChatGPT/Codex app to exit and reopen by bundle id; a failed restart is reported as a failed menu action.
  - Update installs always rebuild the companion with the newly installed SKS package, preventing a previous-version updater from restoring a stale menu binary.
  - The menubar dropdown's `View Last Log` item opens the most recent background action's log file, so you don't need to keep a Terminal window open to see command output.
  - `sks menubar status --json` reports a `codex_sync` object with `bundle_id`, `codex_running`, and `icon_visible_expected` to show Codex-lifecycle detection state.
  - The menu displays the installed Codex CLI version, adds an `⬆` status icon when `sks codex update-status` sees a newer release, runs the official self-updater through `Update Codex CLI Now`, and exposes `Run sks doctor --fix` as a background repair action.
- If Codex shows `[No tool output found for custom tool call ...]`, SKS blocks reuse of that structurally ambiguous thread. Upgrade codex-lb (or explicitly run `sks codex-lb use-oauth`), inspect possible side effects, then continue the persisted mission in a fresh Codex task. SKS never rewrites session JSONL or fabricates a successful tool output.
- Zellij optional but recommended for terminal worker panes

## License

MIT
