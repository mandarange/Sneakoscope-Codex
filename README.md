# Sneakoscope Codex

Fast legacy-free proof-first Codex trust layer with image-based Voxel TriWiki.

Sneakoscope Codex (`sks`) is a Codex CLI/App harness that makes repeatable Codex work auditable.

SKS does not try to clone every other harness. It focuses on one thing: making Codex work auditable, visual-evidence-bound, safety-gated, and reproducible through Completion Proof.

## LLM Init Prompt for Hermes / OpenClaw Agent Builders

```text
Set up this agent project with Sneakoscope Codex. Use [[mandarange/Sneakoscope-Codex](https://github.com/mandarange/Sneakoscope-Codex)] as the repo reference and [npm i -g sneakoscope] as the recommended global install command, then run the appropriate `sks` setup, doctor, Codex App, and proof checks for this repo. Keep generated SKS state out of source control unless documented, and record every version-facing change in CHANGELOG.md.
```

![Sneakoscope Codex Trust Layer](docs/assets/sneakoscope-architecture-pipeline.jpg)

## Current Release

SKS **2.0.19** is the Codex 0.138 deep-integration polish release: optional Desktop `/app` launch attempts, Desktop handoff confirmation lifecycle, parallel/cached plugin inventory, global image saved-path contracts, effort metadata auto-discovery, account usage auto-discovery, and hardened feature probes.

What changed:

- `sks doctor` now reports Codex 0.138 feature readiness, plugin JSON inventory, candidate-only remote MCP servers, unavailable app templates, and repairable plugin discovery cache state.
- QA-LOOP can write a Codex Desktop `/app` handoff artifact with `--app-handoff` or require it with `--app-handoff-required`; this never substitutes for Codex Chrome Extension web UI evidence.
- Zellij slot panes and the right-column anchor surface pending QA `/app` handoffs so desktop review is visible during long native-agent runs.
- Codex plugin detail JSON is normalized into `.sneakoscope/codex-plugin-inventory.json`, and plugin-provided remote MCP servers remain candidate-only until explicitly enabled under DB/Mad-DB safety policy.
- Imagegen and QA image flows write `image-artifact-path-contract.json` with exact saved file paths and follow-up edit hints.
- Effort routing now understands the fallback order `minimal < low < medium < high < xhigh`, records model capability, and escalates QA effort after repeated failures.
- Codex account token usage can be recorded from an app-server usage endpoint, and QA budget policy reduces remote concurrency near limits while preserving GPT final review.
- Naruto final pass status now depends on the parallel runtime proof, and Mad-DB post-tool lifecycle recording handles MCP `isError` failures.

Quick checks:

```bash
npm run typecheck
npm run build
npm run codex:0138-capability
npm run codex-sdk:version-compat
npm run codex-app:handoff
npm run codex-plugin:inventory
npm run qa-loop:app-handoff
npm run image:artifact-path-contract
npm run codex:effort-order
npm run codex:account-usage
npm run codex:0138-doctor
npm run doctor:codex-0138-fix
npm run codex-control:capability
npm run codex-control:structured-output
npm run codex-control:event-stream-ledger
npm run codex-control:thread-registry
npm run codex-control:empty-result-retry
npm run codex-control:stream-idle-watchdog
npm run ultra-router:auto-router
npm run codex-sdk:zellij-pane-binding
npm run codex-app:fast-ui-preservation
npm run provider:badge-context
npm run zellij:worker-pane-manager
npm run runtime:no-mjs-scripts
npm run runtime:ts-python-boundary
npm run codex-control:all-pipelines
```

Broader release checks still live behind `npm run release:check`. Detailed release history is in [CHANGELOG.md](CHANGELOG.md), and release readiness is tracked in [docs/release-readiness.md](docs/release-readiness.md).

## Parallelism, UX, And Integrations

- **Extreme parallel fan-out (`$Naruto` / native agents).** Each clone is a separate CLI worker that spends almost all of its wall-clock awaiting the Codex API, so live concurrency scales by **memory and the provider rate limit, not CPU cores** — a capable host can run up to 100 workers in parallel. The 429/rate-limit backoff is handled by the centralized responses retry policy. Tune it with `SKS_NARUTO_MAX_CONCURRENCY` (hard cap, 1–100), `SKS_NARUTO_GB_PER_WORKER` (memory budget per worker), and `SKS_NARUTO_MIN_CONCURRENCY` (low-free-memory floor).

  ```bash
  sks naruto run "refactor the data layer" --clones 100 --json
  SKS_NARUTO_MAX_CONCURRENCY=48 sks naruto run "sweep the test suite" --clones 48
  ```

- **Zellij scrollback and copy.** SKS launches Codex panes with `--no-alt-screen`, so the terminal keeps the conversation transcript in scrollback. Zellij `mouse_mode` is on by default so trackpad/wheel gestures scroll the conversation pane instead of recalling prompt history in the focused Codex input. Copy still uses `copy_command=pbcopy` and `copy_on_select=true`; hold Shift for terminal-native selection, or set `SKS_ZELLIJ_MOUSE_MODE=0` if you intentionally prefer native drag selection over hover-pane scrolling.

- **MAD / Naruto Zellij worker panes.** `sks --mad` and Naruto-style fan-out keep the main Zellij session lean at launch, then open named worker panes on demand as scheduler slots are reserved. Each worker pane is bound to a slot generation, writes `worker.stdout.log`, `worker.stderr.log`, `worker-heartbeat.jsonl`, `worker-result.json`, and `zellij-worker-pane.json`, then drains when the generation completes. Tune MAD fan-out with `--mad-agents`, `--mad-swarm-work-items`, and `--mad-swarm-backend`; use `--no-mad-swarm` only when you intentionally want the UI-only launch.

- **Image generation under codex-lb.** `gpt-image-2` routes through the same Codex `/responses` backend the load balancer already proxies, so `$imagegen` works when you are authenticated only through codex-lb (no direct `OPENAI_API_KEY`). The official Codex App `$imagegen` surface stays primary; the codex-lb/OpenAI API path is the fallback. Opt out with `SKS_IMAGEGEN_ALLOW_CODEX_LB_API_FALLBACK=0`.

- **xAI / Grok search.** Wire xAI Live Search into source intelligence as an MCP provider:

  ```bash
  sks xai check
  sks xai setup --scope project --command "npx" --arg "-y" --arg "<your-grok-search-mcp>"
  export XAI_API_KEY=xai-...
  sks xai docs
  ```

- **CLI-only SKS update notices.** Codex App hooks no longer stop normal work to ask for an SKS update. CLI launch surfaces such as `sks --mad` print a non-blocking latest-version notice, `sks update-check` / `sks update check` show the explicit status, and `sks doctor --fix` runs the guarded global SKS update path before repair.

## Retention And Cleanup

SKS keeps durable learning context separate from disposable route work files. Durable context includes `.sneakoscope/memory/**`, shared TriWiki records, `.sneakoscope/wiki/context-pack.json`, wrongness memory, image voxels, avoidance rules, route Completion Proof, trust reports, evidence indexes, reflections, and agent proof summaries. These files are treated as the long-term learning and audit chain.

Temporary route files are cleaned after a route is closed enough to preserve its proof chain and by `sks gc`: `.sneakoscope/tmp/*`, closed mission `team-inbox/`, `bus/`, `cycles/`, `arenas/`, agent lane/worktree scratch, mission `*.stdout.log` / `*.stderr.log`, and release-parallel raw logs after their inline summaries are written into the JSON/MD report. Post-route cleanup is bounded to the completed route so large mission stores do not stall normal commands; full old/excess mission sweeping remains an explicit `sks gc` operation. Active missions, blocked-route diagnostics, and terminal transcripts stay in place so live debugging and the current route are not disrupted. Old/excess missions that contain proof or learning artifacts are compacted rather than deleted wholesale.

```bash
sks gc --dry-run --json
sks gc --json
sks stats --json
npm run retention:cleanup-safety
```

The cleanup contract is policy-backed in `.sneakoscope/policy.json`, but the default posture is now immediate cleanup for short-lived temp files while preserving long-term SKS learning and proof artifacts.

## Documentation

- Completion Proof: [docs/completion-proof.md](docs/completion-proof.md)
- TypeScript architecture: [docs/typescript-architecture.md](docs/typescript-architecture.md)
- Trust Kernel: [docs/trust-kernel.md](docs/trust-kernel.md)
- TriWiki Wrongness Memory: [docs/triwiki-wrongness-memory.md](docs/triwiki-wrongness-memory.md)
- Git collaboration: [docs/git-collaboration.md](docs/git-collaboration.md)
- Git hygiene: [docs/git-hygiene.md](docs/git-hygiene.md)
- Shared TriWiki: [docs/shared-triwiki.md](docs/shared-triwiki.md)
- Shared Wrongness Memory: [docs/shared-wrongness-memory.md](docs/shared-wrongness-memory.md)
- Git policy: [docs/git-policy.md](docs/git-policy.md)
- Wrongness Learning Loop: [docs/wrongness-learning-loop.md](docs/wrongness-learning-loop.md)
- Package boundary: [docs/package-boundary.md](docs/package-boundary.md)
- Black-box package tests: [docs/black-box-package-tests.md](docs/black-box-package-tests.md)
- Codex CLI compatibility: [docs/codex-cli-compat.md](docs/codex-cli-compat.md)
- MAD-SKS rollback: [docs/mad-sks-rollback.md](docs/mad-sks-rollback.md)
- MAD-SKS: [docs/mad-sks.md](docs/mad-sks.md)
- Permission kernel: [docs/permission-kernel.md](docs/permission-kernel.md)
- Immutable harness guard: [docs/immutable-harness-guard.md](docs/immutable-harness-guard.md)
- Codex App: [docs/codex-app.md](docs/codex-app.md)
- Core dominance: [docs/core-dominance.md](docs/core-dominance.md)
- Performance budgets: [docs/performance-budgets.md](docs/performance-budgets.md)
- Native Agent Kernel: [docs/native-agent-kernel.md](docs/native-agent-kernel.md)
- Source Intelligence Layer: [docs/source-intelligence-layer.md](docs/source-intelligence-layer.md)
- X AI / Context7 / Codex Web policy: [docs/xai-context7-codex-web-policy.md](docs/xai-context7-codex-web-policy.md)
- Main no-Scout / worker Scout policy: [docs/main-no-scout-worker-scout-policy.md](docs/main-no-scout-worker-scout-policy.md)
- Agent terminal lanes: [docs/agent-terminal-lanes.md](docs/agent-terminal-lanes.md)
- Zellij migration: [docs/migration/tmux-to-zellij.md](docs/migration/tmux-to-zellij.md)
- Real Codex dynamic smoke: [docs/real-codex-dynamic-smoke.md](docs/real-codex-dynamic-smoke.md)
- Agent cleanup executor: [docs/agent-cleanup-executor.md](docs/agent-cleanup-executor.md)
- Intelligent work graph: [docs/intelligent-work-graph.md](docs/intelligent-work-graph.md)
- Fake vs real proof policy: [docs/fake-vs-real-proof-policy.md](docs/fake-vs-real-proof-policy.md)
- Runtime truth matrix: [docs/runtime-truth-matrix.md](docs/runtime-truth-matrix.md)
- ADHD orchestration gate: [docs/adhd-orchestrating-gate.md](docs/adhd-orchestrating-gate.md)
- Strategy-first parallel write: [docs/strategy-first-parallel-write.md](docs/strategy-first-parallel-write.md)
- Appshots pipeline: [docs/appshots-pipeline.md](docs/appshots-pipeline.md)
- Appshots thread attachments: [docs/appshots-thread-attachments.md](docs/appshots-thread-attachments.md)
- MCP readOnly scheduler: [docs/mcp-readonly-scheduler.md](docs/mcp-readonly-scheduler.md)
- Parallel write agents: [docs/parallel-write-agents.md](docs/parallel-write-agents.md)
- Agent patch queue: [docs/agent-patch-queue.md](docs/agent-patch-queue.md)
- Native CLI Session Swarm: [docs/native-cli-session-swarm.md](docs/native-cli-session-swarm.md)
- No-subagent scaling: [docs/no-subagent-scaling.md](docs/no-subagent-scaling.md)
- Fast mode default and `$Fast-On`/`$Fast-Off` toggles: [docs/fast-mode-default.md](docs/fast-mode-default.md)
- Migration 1.18.7 to 1.18.8: [docs/migration-1.18.7-to-1.18.8.md](docs/migration-1.18.7-to-1.18.8.md)
- Codex official Goal mode: [docs/codex-official-goal-mode.md](docs/codex-official-goal-mode.md)
- Release parallel full coverage: [docs/release-parallel-full-coverage.md](docs/release-parallel-full-coverage.md)
- Priority closure P0-P4: [docs/priority-closure-p0-p4.md](docs/priority-closure-p0-p4.md)
- Image Voxel TriWiki: [docs/image-voxel-ledger.md](docs/image-voxel-ledger.md)
- Image Wrongness: [docs/image-wrongness.md](docs/image-wrongness.md)
- Route finalization: [docs/route-finalization.md](docs/route-finalization.md)
- Feature fixtures: [docs/feature-fixtures.md](docs/feature-fixtures.md)
- Managed paths: [docs/managed-paths.md](docs/managed-paths.md)
- Rollback: [docs/rollback.md](docs/rollback.md)
- Known gaps: [docs/known-gaps.md](docs/known-gaps.md)
- Native agent engines: [docs/native-agent-engines.md](docs/native-agent-engines.md)
- Hermetic E2E: [docs/testing-hermetic-e2e.md](docs/testing-hermetic-e2e.md)
- Pipeline architecture: [docs/pipeline-architecture.md](docs/pipeline-architecture.md)
- Rust accelerator: [docs/rust-accelerator.md](docs/rust-accelerator.md)
- Codex App Hooks/PAT: [docs/hooks-pat.md](docs/hooks-pat.md)
- codex-lb: [docs/codex-lb.md](docs/codex-lb.md)

## 60-second start

Recommended install: use the global npm package so `sks` and the Codex App `$` skills are refreshed together.

```sh
npm i -g sneakoscope
sks root
sks doctor
sks status
sks trust report latest
sks wrongness validate project --json
sks git doctor --json
sks codex compatibility --json
sks hooks warning-check --json
sks codex-app check
sks selftest --mock
sks rust smoke --json
```

## Three core promises

1. Completion Proof for every serious route
2. Image Voxel TriWiki anchors and relations for every visual route
3. Route contracts, evidence indexes, wrongness memory, trust reports, Codex App, codex-lb, hooks, Rust fallback parity, DB, route modularity, and generated fixtures verified by release gates

## Install

Recommended path:

```sh
npm i -g sneakoscope
sks root
sks doctor
```

The global npm install refreshes the `sks` command shim, generated Codex App `$` skills, and the SKS bootstrap surface together. If a project marker is present, postinstall bootstraps that project; otherwise SKS uses the per-user global runtime root. `sks root` shows the active root.

One-shot run without keeping a global install:

```sh
npx -y -p sneakoscope sks root
```

Project-pinned install:

```sh
npm i -D sneakoscope
npx sks setup --install-scope project
```

Source checkout for developing Sneakoscope itself:

```sh
git clone https://github.com/mandarange/Sneakoscope-Codex.git
cd Sneakoscope-Codex
npm install
npm install -g .
sks --version
```

Install health checks:

```sh
sks deps check
sks codex-app check
sks dollar-commands
sks commit --json
sks selftest --mock
```

## What Sneakoscope Adds

`sks` adds a Zellij-backed Codex CLI runtime, Codex App `$` commands, Team/QA/PPT/Research/DB/GX/Wiki routes, OpenClaw and Hermes skill generation, Context7-gated current docs, TriWiki context packs, DB safety, design SSOT policy, skill dreaming, release checks, and Honest Mode.

## Report-Only Planning Surfaces

Decision Lattice and RecallPulse remain report-only planning and evidence surfaces. They can explain route choices and proof-debt signals, but SKS does not claim speedup, fast-lane accuracy, or reduced verification cost from them until scored evals prove those outcomes.

Useful checks:

```bash
sks proof-field scan --json --intent "small CLI change"
sks pipeline plan latest --proof-field --json
```

## Requirements

- Node.js `>=20.11`
- npm
- Codex CLI for terminal workflows
- Codex App for app-facing workflows, including Codex Computer Use and `$imagegen`/`gpt-image-2` evidence when required
- Zellij for `sks --mad` and interactive lane UI
- Context7 MCP for current-docs-gated routes

Install Zellij from [zellij.dev](https://zellij.dev/documentation/installation.html). On macOS, Homebrew users can also install it with:

```sh
brew install zellij
```

The default `sks` runtime checks npm for newer `sneakoscope` and `@openai/codex` versions before opening the interactive runtime. `npm i -g sneakoscope` runs a safe bootstrap/readiness pass; use `sks bootstrap --yes`, `sks deps check --yes`, or `sks --mad --yes` to install or repair Codex CLI/Zellij when Homebrew is available. `sks --mad` requires Zellij for interactive MAD/lane UI and prints the session, gate, attach command, blockers, and labeled Zellij stderr/stdout details needed to act.

Project setup writes shared `.gitignore` entries for generated SKS files: `.sneakoscope/`, `.codex/`, `.agents/`, and managed `AGENTS.md`. Setup, doctor repair, and npm postinstall refreshes also compare the previous SKS generated-file manifest with the current package templates and prune stale SKS-generated legacy skills or agent files while preserving user-owned custom skills. Use `sks setup --local-only` when you want those excludes kept only in `.git/info/exclude`.

During npm postinstall, SKS installs generated Codex App skills and tries `skills add MohtashamMurshid/getdesign` when the `skills` CLI is available. Design work still flows through one authority: `design.md`.

## Terminal CLI Usage

Use terminal commands when you want to inspect, set up, verify, or start a CLI-first workspace.

### Discovery

```sh
sks commands
sks usage install
sks usage team
sks usage codex-app
sks dollar-commands
sks --version
```

### Setup And Repair

```sh
sks bootstrap
sks deps check --yes
sks codex-app check
sks doctor --fix
sks fix-path
sks update now
```

### Open Codex CLI With Zellij

```sh
sks
sks --mad
sks team open-zellij latest
sks team attach-zellij latest
```

Interactive SKS sessions use Zellij layouts. By default SKS launches Codex in Fast service tier with `--model gpt-5.5`, `-c service_tier="fast"`, the selected `model_reasoning_effort`, and `--no-alt-screen` for Zellij-backed interactive panes so terminal scrollback captures the conversation transcript. SKS always forces the model to `gpt-5.5`; `SKS_CODEX_MODEL` and `SKS_CODEX_FAST_HIGH=0` cannot downgrade or remove that model pin. You can still set `SKS_CODEX_REASONING` to change reasoning effort, and `SKS_ZELLIJ_CODEX_ALT_SCREEN=1` restores Codex's alternate-screen UI for the next launch. Use `sks --mad --workspace <name>` for an explicit MAD session and `sks help` for CLI help.

Before opening the interactive runtime, SKS checks the installed Codex CLI against npm `@openai/codex@latest`. If a newer version exists, it asks `Y/n`; answering `y` updates automatically with `npm i -g @openai/codex@latest` and then opens the runtime with the updated Codex CLI.

For [codex-lb](https://github.com/Soju06/codex-lb), start the server, create a dashboard API key, then run:

```sh
sks codex-lb setup --host https://your-codex-lb.example.com --api-key "sk-clb-..."
sks codex-lb health
sks codex-lb repair
sks
```

Bare `sks` can also prompt for codex-lb auth; SKS stores the base URL/key in `~/.codex/sks-codex-lb.env`, writes the codex-lb Codex CLI / IDE Extension provider block into `~/.codex/config.toml` for Codex App routing, loads the provider env key for interactive launches, and syncs the macOS user launch environment so the Codex App can see `CODEX_LB_API_KEY` after restart. If the provider block disappears but the stored env file is still recoverable, bare `sks`, npm postinstall upgrades, `sks doctor --fix`, and `sks codex-lb repair` restore it with `env_key = "CODEX_LB_API_KEY"`, `supports_websockets = true`, and `requires_openai_auth = false`; imagegen checks may record this provider as configured codex-lb routing, but it is not accepted as official Codex App `$imagegen` evidence. If an older SKS release left the codex-lb dashboard key only in the shared Codex `auth.json` login cache, SKS migrates that key back into `~/.codex/sks-codex-lb.env` when a codex-lb provider or env base URL is already recoverable. It does not rewrite the shared Codex `auth.json` login cache by default; set `SKS_CODEX_LB_SYNC_CODEX_LOGIN=1` only if you intentionally want the old API-key login-cache behavior. When codex-lb is active, SKS opens a fresh `sks-codex-lb-*` Zellij session and sweeps older detached codex-lb sessions for the same repo before launch so stale Responses API chains are not reused. Configured launch paths run a response-chain health check. `previous_response_not_found` is treated as a stateless-LB warning and keeps codex-lb active. Hard failures are surfaced to the user; SKS only bypasses codex-lb when the user chooses OAuth fallback or `SKS_CODEX_LB_AUTOBYPASS=1` is set.

If codex-lb provider auth drifts after launch/reinstall, run `sks doctor --fix` or `sks codex-lb repair`. To **swap only the API key** at any time (without re-typing the host — it reuses the stored base URL), run:

```sh
sks codex-lb set-key --api-key-stdin   # or: sks codex-lb set-key --api-key "sk-clb-..."
```

(To also change the host, use `sks codex-lb reconfigure --host <domain> --api-key <key>`.)

### Switching auth mode: codex-lb ↔ ChatGPT OAuth

Switch between the codex-lb API key and your ChatGPT OAuth login at any time with intent-named commands:

```sh
sks codex-lb use-oauth      # hand control back to ChatGPT OAuth
sks codex-lb use-codex-lb   # switch back to the codex-lb API key
```

`use-oauth` restores `~/.codex/auth.chatgpt-backup.json` (written by auto-reconcile) to `~/.codex/auth.json` and unsets `model_provider = "codex-lb"` so Codex CLI/App falls back to ChatGPT OAuth; if no saved OAuth login exists it points you to `codex login`. `use-codex-lb` re-selects and re-syncs codex-lb. (The older verbs `sks codex-lb release` / `repair` remain as aliases.)

Flags:

- `--keep-provider` — restore `auth.json` only; leave `model_provider = "codex-lb"` selected (advanced use).
- `--delete-backup` — remove `~/.codex/auth.chatgpt-backup.json` after a successful restore. Default is to keep it so a subsequent re-reconcile still has a source backup.
- `--force` — restore even when the current `auth.json` does not look like the codex-lb apikey shape (e.g. if you hand-edited it after reconcile).
- `--json` — machine-readable output with `status` ∈ {`released`, `no_backup`, `already_chatgpt`, `auth_in_use`, `failed`} plus `auth_path`, `backup_path`, `provider_unselected`, `backup_removed`.

`sks codex-lb status` reports whether a ChatGPT OAuth backup is present and shows the `sks codex-lb release` hint when applicable. `sks doctor` surfaces the same hint.

If Codex App shows `access token could not be refreshed` after codex-lb setup or status checks, recover the ChatGPT OAuth side without discarding codex-lb: run `sks codex-lb status`, then `sks codex-lb repair`. Repair restores a ChatGPT OAuth backup when one exists while keeping `model_provider = "codex-lb"` selected and the codex-lb key in `CODEX_LB_API_KEY`. If no OAuth backup exists, sign in again in Codex App/CLI, then rerun `sks codex-lb repair`. Use `sks codex-lb release` only when you want to switch fully away from codex-lb.

If you only want to stop routing through codex-lb without touching `auth.json`, use the lighter `sks codex-lb unselect` instead:

```sh
sks codex-lb unselect
```

This flips `model_provider` away from `codex-lb` in the top-level Codex App config while leaving your `sks-codex-lb.env` and `auth.json` untouched, so you can re-engage codex-lb later with `sks codex-lb repair` without re-running setup.

### MAD Zellij Launch

```sh
sks --mad
sks --mad --allow-package-install --allow-service-control --allow-network --yes
```

This syncs existing codex-lb provider auth, creates/uses the `sks-mad-high` xhigh maintenance profile, opens the MAD-SKS permission gate for that Zellij run, starts a same-mission read-only native agent swarm, and launches a Codex CLI layout whose right-side lanes read that MAD ledger. Bare `sks --mad` grants target-project file and shell scope only; add explicit `--allow-*` flags for packages, services, network, Computer Use, browser use, generated assets, file permissions, DB writes, or other high-risk scopes. MAD-SKS is not a DB-only unlock: it is explicit user authorization to widen approved target-project scopes. Catastrophic database wipe/all-row/project-management safeguards remain active, and the pipeline contract still forbids unrequested fallback implementation code.

Before launching, SKS checks npm for a newer `sneakoscope` and prints a non-blocking update notice when one is available; use `sks update now` or `sks doctor --fix` when you want SKS to update itself. Use `--yes` to approve missing dependency installs automatically. Tune MAD swarm startup with `--mad-agents <n>`, `--mad-swarm-work-items <n>`, and `--mad-swarm-backend <backend>`; `--no-mad-swarm` keeps only the cockpit UI if you need a temporary fallback.

### Team Missions

```sh
sks team "implement this feature"
sks team "wide refactor" executor:5 reviewer:6
sks team "max native fan-out" --agents 12
sks team watch latest
sks team lane latest --agent native_agent_1 --follow
sks team message latest --from native_agent_1 --to executor_1 --message "handoff note"
sks team cleanup-zellij latest
sks team status latest
sks team dashboard latest
sks team log latest
```

Team missions keep at least five QA/reviewer lanes active, record live events, compile runtime tasks and worker inboxes, write schema-backed effort/work-order/dashboard artifacts, and reconcile split live lanes in Zellij when available. Native analysis lanes use the agent kernel exclusively. Use `sks team watch`, `sks team lane`, `sks team message`, and `sks team cleanup-zellij` to inspect or close the live view.

### Native Multi-Session Agents

```sh
sks agent run "map the risky files" --mock --json
sks agent run "wide release audit" --route '$Release-Review' --agents 10 --concurrency 5 --mock --json
sks agent run "real one-agent smoke" --backend codex-sdk --real --agents 1 --concurrency 1 --json
```

Defaults are intentionally bounded but not subagent-limited: 5 agents by default, maximum 20 native CLI worker sessions, and a separate `--concurrency` cap. When enough work exists, `--agents 10 --concurrency 10` and `--agents 20 --concurrency 20` must create 10 or 20 independent child processes using `node dist/bin/sks.js --agent worker --intake <worker-intake.json> --json`. The parent orchestrator writes `agents/agent-roster.json`, `agents/agent-effort-policy.json`, `agents/agent-task-board.json`, `agents/agent-leases.json`, `agents/agent-no-overlap-proof.json`, `agents/agent-native-cli-session-swarm.json`, `agents/native-cli-session-proof.json`, `agents/no-subagent-scaling-policy.json`, `agents/fast-mode-propagation-proof.json`, `agents/agent-cleanup.json`, and `agents/agent-proof-evidence.json` under the mission.

Native worker sessions write independent artifact directories under `agents/sessions/<slot>/gen-<n>/worker/`, including heartbeat, process report, close report, patch envelope or no-patch reason, recursion guard, and Fast mode proof. Codex internal subagent/scout events may be cockpit evidence, but they are never counted as SKS worker sessions.

Manual fan-out syntax:

- Direct agent route: `sks agent run "<task>" --agents 8 --concurrency 4 --mock --json`
- Team prompt role counts: `$Team <task> executor:8 reviewer:5`
- Team CLI flag: `sks team "<task>" --agents 8`

Effort is assigned per agent. Simple read-only/docs slices can run low, ordinary tooling and lease mapping use medium, safety/DB/schema/release lanes use high, and frontier/forensic research can escalate to xhigh. If a lease conflict, schema failure, proof blocker, DB risk, or release risk appears, the parent can escalate that lane while keeping unrelated lanes cheaper and faster.

### Naruto Massive Parallel Work Swarm (`$Naruto`)

`$Naruto` (影分身 / Kage Bunshin no Jutsu) is the hardware-safe massive parallel work mode of the native agent kernel. It is not limited to validation. A Naruto run builds a mixed work graph, keeps a safe active worker pool full, and assigns clones to implementation, modification, test generation, verification, research, documentation, conflict resolution, rollback planning, integration support, and GPT final review input work. It lifts the standard 20-agent ceiling to **up to 100 total clone generations** for this route while keeping active workers under the live hardware, lease, memory, terminal UI, file descriptor, local LLM, and remote API caps.

```sh
sks naruto run "sweep the codebase for TODO comments and summarize"
sks naruto run "draft a unit test for every module" --clones 100
sks naruto run "demo" --clones 24 --backend fake --json   # fast, no Codex calls
sks naruto status
```

Aliases: `$ShadowClone`, `$Kagebunshin`, and the CLI flag `sks --naruto`.

- **Hardware-safe governor:** `--clones N` is the total work fan-out, but `$Naruto` never spawns the whole count at once. Live concurrency is throttled by current load, memory, file descriptors, Zellij pane budget, local LLM request budget, remote API budget, disk pressure, pending queue, and active lease conflicts.
- **Dynamic active pool:** completed workers are drained and replaced while runnable work remains, so the active pool does not sit empty between generations.
- **Dynamic per-clone effort (like Team):** truly simple / no-tool work runs at `low`, any tool use lifts a clone to `medium` (never high/xhigh), and every clone runs in fast service tier.
- **Safe parallel writes:** write-capable clones produce patch envelopes for leased files. Non-overlapping envelopes can apply in parallel; overlapping envelopes serialize or route to conflict resolution. Local worker output remains a draft until the GPT final arbiter approves or modifies it.
- **Massive UI without pane overload:** Zellij shows visible active worker panes up to the UI cap and tracks the remaining active headless workers in the Naruto dashboard.

See [docs/naruto.md](docs/naruto.md) for the full reference.

### QA, Computer Use, Goal, Research, DB, Wiki, GX

```sh
sks qa-loop prepare "http://localhost:3000"
sks qa-loop run latest --max-cycles 2
sks codex-app chrome-extension --json
sks goal create "persist this migration workflow"
sks research prepare "evaluate this approach"
sks research run latest --max-cycles 12 --cycle-timeout-minutes 120
sks research status latest
sks recallpulse run latest
sks recallpulse status latest --json
sks recallpulse governance latest --json
sks recallpulse checklist latest --json
sks db scan --json
sks wiki refresh
sks wiki sweep latest --json
sks wiki validate .sneakoscope/wiki/context-pack.json
sks harness fixture --json
sks gx init homepage
sks gx render homepage --format html
sks validate-artifacts latest --json
sks pipeline plan latest --proof-field --json
sks perf run --json
sks perf workflow --json --intent "small CLI change" --changed src/cli/main.ts,src/core/routes.ts
sks proof-field scan --json --intent "small CLI change"
sks skill-dream status
sks skill-dream run --json
sks code-structure scan --json
```

`sks research` prepares a named genius-lens agent council, requires every agent to run at `xhigh`, records one literal `Eureka!` idea per agent, runs an evidence-bound debate, and creates `research-source-skill.md` as a route-local source collection skill before synthesis. Research is not a code-change route: real runs may write only their own mission artifacts under `.sneakoscope/missions/<id>/`, and source/package/docs/config mutations block the run with `research-code-mutation-blocker.json`. The required Research persona lenses are Einstein Agent, Feynman Agent, Turing Agent, von Neumann Agent, and Skeptic Agent; they are cognitive roles, not impersonations, and `agent-ledger.json` must include `display_name`, `persona`, `persona_boundary`, `reasoning_effort`, falsifiers, cheap probes, and `challenge_or_response`. Normal Research is not a fixed three-cycle flow: it repeats source gathering, Eureka ideas, debate, falsification, and synthesis pressure until every agent records final agreement, or pauses at the explicit max-cycle safety cap with an unpassed gate. `debate-ledger.json` must include `consensus_iterations`, `unanimous_consensus`, and per-agent agreements; `research-gate.json` cannot pass until unanimous consensus is true for all agents. Normal Research is intentionally allowed to take one or two hours when the problem needs it; `--mock` is only for selftests or dry harness checks, and a real run blocks with `research-blocker.json` instead of silently substituting mock output when the Codex execution path is unavailable. The source layer contract separates latest papers, official/government or leading-institution sources, standards/primary docs, current news such as BBC/CNN/GDELT-style sources, public discourse such as X/Reddit, developer/practitioner knowledge such as Stack Overflow/GitHub, traditional background sources, and counterevidence/fact-checking; `source-ledger.json` must record layer coverage, source quality, blockers, citations, and cross-layer triangulation. Context7 is optional for `$Research` and only becomes relevant when the research topic specifically depends on package, API, framework, or SDK documentation. Research runs require `research-report.md`, `research-paper.md`, `genius-opinion-summary.md`, `research-source-skill.md`, `source-ledger.json`, `agent-ledger.json`, `debate-ledger.json`, `novelty-ledger.json`, `falsification-ledger.json`, and `research-gate.json` so they stay source-backed, adversarially checked, falsifiable, paper-ready, and clear about every agent lens opinion. `research status` reports source entries, source-layer coverage, triangulation checks, counterevidence, xhigh agent count, Eureka moments, debate exchanges, consensus iterations, unanimous consensus, paper presence/sections, genius-opinion summary coverage, agent findings, and falsification cases alongside the gate.

In 2.0.15, Research also writes a quality contract and handoff package: `research-quality-contract.json`, parallel `research/cycle-N/source-shards/*.json`, `source-ledger.json`, `claim-evidence-matrix.json`, `source-quality-report.json`, `research-synthesis-output.json`, `implementation-blueprint.json`/`.md`, `team-handoff-goal.md`, `experiment-plan.json`/`.md`, `replication-pack.json`, `research-work-graph.json`, `research-final-review.static.json`, `research-final-review.codex.json`, and `research-final-review.json`. The default gate requires 12 total sources, 5 source layers, 2 counterevidence sources, 8 key claims, 6 triangulated claims, 8 blueprint sections, 4 falsification cases, 5 experiment steps, a 2200-word report, approved static plus Codex/GPT final review, and anti-template/source-density report quality before `research-gate.json` can pass. See `docs/research-pipeline.md`, `docs/research-artifacts.md`, and `docs/research-implementation-handoff.md`.

`sks recallpulse` is the 0.8.0 report-only RecallPulse utility. It writes `recallpulse-decision.json`, `mission-status-ledger.json`, `route-proof-capsule.json`, `evidence-envelope.json`, `recallpulse-governance-report.json`, `recallpulse-task-goal-ledger.json`, and `recallpulse-eval-report.json` for the current mission. RecallPulse does not replace route gates, Honest Mode, DB safety, imagegen evidence, or TriWiki validation; it records cache hits, hydration needs, duplicate suppression, route-governance risks, and final-summary-ready durable status so later releases can promote only measured improvements. Checklist updates are sequential: every `Txxx` row is treated as a child `$Goal` checkpoint, and `sks recallpulse checklist ... --task T001 --apply` refuses out-of-order checks unless explicitly overridden.

`sks pipeline plan` shows the active route lane, kept/skipped stages, verification commands, and no-unrequested-fallback invariant. The 0.9.0 Decision Lattice augments this planning surface with report-only A*/proof-debt evidence: frontier paths considered, the selected path, and rejected paths with rejection reasons. `sks proof-field scan` remains the lightweight rubric for small changes; risky or broad signals return to the full Team/Honest path, and no speedup claim is valid without replay or eval evidence.

### Ambiguity Questions

Clarification asks only for ambiguity that changes execution; predictable defaults are inferred and sealed. `sks skill-dream` records cheap counters and periodically writes advisory skill reports. `$Goal` controls native `/goal` persistence without replacing the selected execution route. Web, browser, localhost, website, webapp, and web-based app verification use the official Codex Chrome Extension path first; if it is not installed/enabled, SKS stops and asks the user to set it up before resuming. `$Computer-Use` / `$CU` is now reserved for native macOS, desktop-app, OS-settings, and non-web visual work.

### Create A Presentation

```text
$PPT create a customer proposal deck as HTML/PDF
```

`$PPT` seals presentation context before artifact work and grounds design in `design.md`, getdesign inputs, and source material. The route loads `imagegen`; when the sealed deck needs generated raster assets or generated slide visual critique, use Codex App `$imagegen`/`gpt-image-2` and record the real output path in the PPT image/review ledgers.

## Codex App Usage

Sneakoscope has two surfaces:

- Terminal commands such as `sks deps check`, `sks team "task"`, and `sks --mad`
- Codex App prompt commands such as `$Team`, `$DFix`, `$QA-LOOP`, and `$Wiki`

After installing, run:

```sh
sks bootstrap
sks codex-app check
sks codex-app chrome-extension --json
sks codex-app remote-control --status
sks dollar-commands
```

For headless remotely controllable Codex App/server sessions on Codex CLI 0.130.0 or newer, run:

```sh
sks codex-app remote-control -- --help
```

`sks codex-app check` reports whether the installed Codex CLI is new enough, whether the required app flags are visible, whether Fast/speed-selector config is unlocked, whether Codex App Git Actions can use Commit, Push, Commit and Push, and PR flows, whether the Codex Chrome Extension path is ready for web/browser/webapp verification, and whether installed OpenAI default plugins such as Browser, Chrome, Computer Use, Documents, Presentations, Spreadsheets, and LaTeX are enabled. `sks-fast-high` intentionally does not pin `sandbox_mode`, so the Codex App/IDE permissions selector owns Full Access vs workspace-write while SKS supplies the model, Fast service tier, approval, and reasoning defaults. `sks codex-app chrome-extension --json` is the rapid preflight for web QA/UX/browser routes. When codex-lb is configured, SKS keeps it selected as the top-level Codex App provider while still preserving required app flags and plugin settings. Codex CLI 0.130.0+ app-server/remote-control threads can pick up config changes live; older CLI/TUI sessions should still be restarted after `.codex/config.toml` or MCP/plugin changes.

For web-related verification, SKS follows the official Codex Chrome Extension setup path first: https://developers.openai.com/codex/app/chrome-extension. `$QA-LOOP`, `$UX-Review`, `$Image-UX-Review`, browser smoke, authenticated web checks, localhost checks, and web visual review must halt quickly if that extension is missing or disabled. Only after the user says the extension setup is complete should the pipeline resume. Codex Computer Use is for native Mac/non-web targets only; it must not be used as browser/web-app verification evidence.

Imagegen is a core SKS capability, not a decorative add-on. `$Image-UX-Review`, `$UX-Review`, `$Visual-Review`, `$UI-UX-Review`, and PPT generated-review paths require real Codex App `$imagegen`/`gpt-image-2` output before full visual verification can pass. For newest-model image requests, prompts should say "Use ChatGPT Images 2.0 / GPT Image 2.0 with gpt-image-2" while still invoking Codex App `$imagegen` when live generation is needed. Use `imagegen-source-scout` when current official docs plus X/social prompt-workflow signals are needed; social sources are prompt heuristics only, not capability or evidence specs. `npm run imagegen:capability` checks that the official Codex App imagegen surface is visible and records that capability detection is not output proof; OpenAI API, Responses image-generation, codex-lb, or `CODEX_LB_API_KEY` fallbacks are non-Codex paths and do not satisfy Codex App generated-image evidence unless a separate API fallback task is explicitly requested. The README architecture asset uses the same rule: run `npm run imagegen:readme-architecture:prompt` to print/write the official prompt, generate the image in Codex App `$imagegen`, then rerun `npm run imagegen:readme-architecture -- --output <path>` after Codex App creates a real gpt-image-2 output. When exactly one current generated_images candidate exists after the prompt, `npm run imagegen:readme-architecture -- --auto-pick-latest` can select it automatically. To let the verifier wait while Codex App writes the file, use `npm run imagegen:readme-architecture -- --wait-ms <milliseconds>`; it still accepts only one current candidate under `$CODEX_HOME/generated_images`. Env forms such as `SKS_CODEX_APP_IMAGEGEN_OUTPUT=<path>` remain supported for automation. Use the selected file directly under `$CODEX_HOME/generated_images`; moved or copied files are not accepted as provenance evidence. Disabled or missing `image_generation` remains a blocker that `sks codex-app check`, `npm run imagegen:capability`, and selftest cover.

Then open Codex App and use prompt commands directly in the chat. Examples:

```text
$Team implement the checkout fix and verify it
$with-local-llm-on
$with-local-llm-off
$DFix change this label and spacing only
$QA-LOOP dogfood localhost:3000 and fix safe issues
$PPT create an investor deck as HTML/PDF
$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues
$Goal persist this migration workflow with native /goal continuation
$Research investigate this mechanism with source-backed agent lenses
$Wiki refresh and validate the context pack
$DB inspect this migration for destructive risk
```

### Optional Local LLM Workers

Local model workers are off by default, so SKS stays GPT-only unless you explicitly enable them. Use the Codex App prompt commands:

![SKS Local LLM mode workflow](docs/sks-local-llm-mode/assets/sks-local-llm-flow.png)

```text
$with-local-llm-on
$with-local-llm-off
```

When enabled, SKS auto-detects an installed local model from a running MLX LM server, OpenAI-compatible local server, or Ollama. If no local model is available, activation stays blocked and reports that no local model was found. The local model can only help with policy-eligible simple code patch-envelope work or read-only collection. GPT/Codex still owns strategy, planning, design, review, verification, safety, and integration. Check or tune the machine-local setting from the terminal:

```sh
sks with-local-llm status --json
sks with-local-llm on
sks with-local-llm on --provider mlx-lm --model mlx-community/Qwen3.6-35B-A3B-4bit --base-url http://127.0.0.1:8080
sks with-local-llm on --provider ollama --model rafw007/qwen36-a3b-claude-coder:q4_K_M
sks with-local-llm off
```

Generated app files include:

| Path | Purpose |
| --- | --- |
| `.codex/SNEAKOSCOPE.md` | Codex App quick reference and route guidance. |
| `.agents/skills/` | Generated skill instructions for `$` commands. |
| `.codex/hooks.json` | Stop/finalization hooks for Honest Mode and completion summaries. |
| `.codex/config.toml` | Codex profiles, agents, and MCP configuration. |
| `.sneakoscope/` | Runtime state, missions, wiki packs, policies, and artifacts. |

Default setup adds these generated SKS paths to the project `.gitignore`; `--local-only` uses `.git/info/exclude` instead.

Use `sks dollar-commands` to confirm that terminal discovery and Codex App prompt commands agree.

SKS does not install Git pre-commit hooks. Release metadata is changed only by explicit commands such as `sks versioning bump`, and `sks versioning hook` is intentionally blocked so Codex App commit/push flows stay unobstructed.

TriWiki is intentionally sparse: `sks wiki sweep` records demote, soft-forget, archive, delete, promote-to-skill, and promote-to-rule candidates instead of injecting every old claim into future prompts. `sks harness fixture` validates the broader Harness Growth Factory contract: deliberate forgetting fixtures, skill card metadata, experiment schema, tool-error taxonomy, permission profiles, MultiAgentV2 defaults, and tmux cockpit view coverage. `sks code-structure scan` flags handwritten files above 1000/2000/3000-line thresholds so new logic can be extracted before command files become harder to maintain.

## OpenClaw And Hermes Agent Usage

Sneakoscope can generate an OpenClaw skill package for agents that need to operate SKS-enabled repositories.

```sh
sks openclaw install
sks openclaw path
```

By default this writes `~/.openclaw/skills/sneakoscope-codex/` with `manifest.yaml`, `SKILL.md`, a README, and `openclaw-agent-config.example.yaml`. Set `OPENCLAW_HOME` or pass `--dir` for a custom location. Attach the skill with the built-in `shell` tool enabled and set `SKS_OPENCLAW=1` so SKS can auto-approve update/install prompts that would otherwise wait for `Y/n`.

```sh
SKS_OPENCLAW=1 sks root
SKS_OPENCLAW=1 sks commands
SKS_OPENCLAW=1 sks dollar-commands
SKS_OPENCLAW=1 sks deps check
SKS_OPENCLAW=1 sks proof-field scan --intent "small CLI change" --changed src/cli/main.ts
```

If OpenClaw runs in a sandbox, grant shell execution only for trusted workspaces. Database, migration, and destructive work still follows SKS safety routes.

Sneakoscope can also generate a Hermes Agent skill package for the Hermes `/skills` surface.

```sh
sks hermes install
sks hermes status --json
sks hermes path
```

By default this writes `~/.hermes/skills/sneakoscope-codex/` with `SKILL.md`, a README, `hermes-config.example.yaml`, and `skill-bundle.example.yaml`. Set `HERMES_HOME` or pass `--dir` for a custom location. Hermes agents should invoke `/sneakoscope-codex` with the terminal toolset enabled and run shell commands with `SKS_HERMES=1`; this enables non-interactive dependency/update prompts while leaving SKS DB, migration, and destructive-operation safety routes intact. If you use Hermes `skills.external_dirs`, remember writable external directories can be updated by Hermes, so protect shared skill folders with filesystem permissions when needed.

```sh
SKS_HERMES=1 sks root --json
SKS_HERMES=1 sks commands --json
SKS_HERMES=1 sks dollar-commands --json
SKS_HERMES=1 sks status --json
```

## Prompt `$` Commands

Use these inside Codex App or another agent prompt. They are prompt commands, not terminal commands.

Common prompts: `$Team`, `$From-Chat-IMG`, `$with-local-llm-on`, `$with-local-llm-off`, `$DFix`, `$Answer`, `$SKS`, `$QA-LOOP`, `$PPT`, `$Computer-Use`/`$CU`, `$Goal`, `$Research`, `$AutoResearch`, `$DB`, `$MAD-SKS`, `$MAD-DB`, `$GX`, `$Wiki`, and `$Help`.

`$MAD-DB` is the prompt-visible Mad-DB alias for one-cycle DB break-glass work. It maps to the same guarded MAD-SKS permission route, while the terminal lifecycle remains `sks mad-db status|enable|revoke`; it is not a permanent DB unlock and catastrophic DB safeguards remain active.

## Common Workflows

First install:

```sh
npm i -g sneakoscope
sks bootstrap
sks deps check --yes
sks codex-app check
sks selftest --mock
```

Start a CLI workspace:

```sh
sks --mad
sks
# or: sks --mad
```

Use Codex App routes with `$Team`, `$with-local-llm-on`/`$with-local-llm-off`, `$DFix`, `$QA-LOOP`, `$PPT`, `$Goal`, `$Wiki`, and `$DB`. Team missions write artifacts under `.sneakoscope/missions/`; validate them with `sks validate-artifacts latest`.

Refresh context before risky work:

```sh
sks wiki refresh
sks wiki validate .sneakoscope/wiki/context-pack.json
```

## Safety Model

Sneakoscope intentionally treats these as high-risk:

- SQL and migrations
- Supabase MCP and RLS changes
- destructive filesystem operations
- user-global harness config
- published package/release state

By default, SKS favors inspection, local files, branch-safe changes, explicit confirmation for destructive DB operations, and completion claims backed by tests or artifacts.

## Troubleshooting

### `sks` points to an old version

```sh
which -a sks
sks --version
node ./dist/bin/sks.js --version
npm ls -g sneakoscope --depth=0
npm install -g .
sks doctor --fix
```

If PATH or npm has duplicate global installs, `sks doctor --fix` keeps one global npm install and removes duplicate global `sneakoscope` installs. The Sneakoscope source checkout is exempt so local development files are not removed.

### SKS keeps asking to update after a global update

```sh
sks update-check --json
sks update now
npm ls -g sneakoscope --depth=0
sks doctor --fix
```

CLI update checks compare npm latest against the effective installed version from source metadata, PATH `sks --version`, and global npm package metadata. Codex App hooks do not force update choices during ordinary work. `sks update now` installs through npm global mode instead of mutating the current project's dependencies, and `sks doctor --fix` runs that guarded global update path before setup/config repair. If a global update succeeded but an old shim remains earlier on PATH, `sks doctor --fix` can remove duplicate global installs and refresh the managed setup.

### Zellij is missing

```sh
brew install zellij
npm run zellij:capability
```

Install Zellij from [zellij.dev](https://zellij.dev/documentation/installation.html), then run `npm run zellij:capability` or `sks doctor --json`. Without Zellij, non-interactive checks can continue, but `sks --mad` and interactive lane UI report `mad_ready: false`.

### Zellij copy or right lanes feel wrong

```sh
sks team open-zellij latest
sks zellij status
```

Conversation scrollback is preserved by Codex `--no-alt-screen`, and SKS launches Zellij with `mouse_mode=true` by default so trackpad/wheel gestures route to pane scrollback instead of the focused prompt input history. Copy still uses Zellij clipboard integration (`copy_command=pbcopy`, `copy_on_select=true`); hold Shift for terminal-native selection, or launch with `SKS_ZELLIJ_MOUSE_MODE=0` if native drag selection matters more than hover-pane scrolling. Right lanes are renderer panes that follow SKS worker artifacts, so live native-agent output is shown from per-slot `worker.stdout.log`, `worker.stderr.log`, and `worker-heartbeat.jsonl`.

### Codex App tools are missing

```sh
sks codex-app check
codex mcp list
```

Codex App workflows need the app installed. Web/browser evidence requires the Codex Chrome Extension path, native Mac/non-web visual evidence requires first-party Codex Computer Use, and generated raster/image-review evidence requires real `$imagegen`/`gpt-image-2` output. After setup/upgrade, start a fresh thread so Codex reloads plugin tools.

### Codex App commit/push is blocked

```sh
sks doctor --fix
sks codex-app check
```

`sks codex-app check` now prints `Git Actions`. It should be `ok` for Codex App Commit, Push, Commit and Push, and PR buttons to bypass SKS route gates. Recent Codex builds expose remote control through the `codex remote-control` command rather than a `remote_control` feature flag, so SKS checks the command/version capability directly. If it is blocked, repair config with `sks doctor --fix`; if the blocker mentions remote-control, update Codex CLI to `0.130.0` or newer and restart older app-server/TUI sessions.

### Codex App UI looks stale after codex-lb changes

If Codex App UI panels or auth-dependent controls still look wrong after codex-lb setup, repair, or upgrade, restart the app first. If the UI still does not recover, sign out of Codex App, sign back in, then run `sks codex-app check` or `sks codex-lb repair` as needed.

### Setup is blocked by another harness

```sh
sks conflicts check
sks conflicts prompt
```

OMX/DCodex conflicts block setup/doctor until the user approves cleanup.

### The route is stuck or a final hook keeps reopening

```sh
sks pipeline status --json
sks team watch latest
sks team lane latest --agent parent_orchestrator --follow
sks wiki validate .sneakoscope/wiki/context-pack.json
```

Finalization requires evidence, valid Team cleanup artifacts, reflection when required, and Honest Mode.

## Development And Release

Run local checks:

```sh
npm run repo-audit
npm run changelog:check
npm run packcheck
npm run feature:check
npm run all-features:selftest
npm run selftest
npm run sizecheck
npm run registry:check
npm run release:check
npm run publish:dry
```

`release:check` runs the change-aware affected release gate for ordinary local checks. Publish readiness uses `release:check:full`, which runs the full release DAG and writes a source digest stamp under `.sneakoscope/reports/` so publish commands can verify the same source/dist state. The DAG preserves the 1.18 baseline gates and adds Codex 0.136 compatibility, inherited Codex 0.135/0.134 runner truth, patch swarm runtime truth, transaction journaling, serial conflict rebase, strict strategy-to-patch proof, rollback command proof, Native CLI Session Swarm 5/10/20-process proof, Real Worker Backend Router proof, Codex child overlap proof, model-authored patch-envelope separation, Zellij layout/pane/screen/socket-dir proof, no-subagent-scaling proof, Fast mode default/worker/Codex/MAD propagation proof, Appshots attachment provenance, MCP runtime overlap evidence, task graph expansion, schema-bound follow-up work, actual Agent/Team/Research/QA route blackboxes, scheduler proof hardening, Source Intelligence propagation, Goal mode propagation checks, slot telemetry, update notice, MAD-DB, and Naruto SSOT gates. Broader live gates remain explicit scripts such as `release:real-check`; real Codex patch smoke, real Codex parallel worker proof, and real Zellij proof are optional unless their `SKS_REQUIRE_REAL_*` or `SKS_REQUIRE_ZELLIJ=1` environment variables are set. Generate the human-readable registry with `sks features inventory --write-docs`. Plain `npm publish` uses the `latest` dist-tag. `npm run publish:dry` runs `release:check:full`, verifies the fresh stamp, and then performs provenance/registry and npm dry-run checks. npm's `prepublishOnly` uses `prepublish-release-check-or-fast` to accept that current stamp before the real publish; if the stamp is missing or stale, it runs `release:check:full` once before continuing.

Version bumps are manual. Run `sks versioning bump` only when preparing release metadata; SKS will not create `.git/hooks/pre-commit` or auto-bump during ordinary commits.

## License

MIT
