# Sneakoscope Codex

Sneakoscope Codex (`sks`) is a Codex CLI/App harness for repeatable workflows. It adds terminal commands, Codex App `$` commands, tmux workspaces, Team/QA/Research routes, pipeline plans, Computer Use, imagegen UI/UX review, Goal, Context7, DB safety, TriWiki, design-system routing, skill dreaming, Honest Mode.

## Quick Start

Install globally, then run `sks` from either a project or any global shell location:

```sh
npm i -g sneakoscope
sks root
sks
```

`npm i -g sneakoscope` automatically refreshes the `sks` command shim, global Codex App `$` skills, and SKS bootstrap surface. When the install is run from a project, postinstall bootstraps that project. When it is run outside a repo/project marker, postinstall bootstraps the per-user global runtime root instead of writing `.sneakoscope` into a random current directory. `sks root` tells you which root SKS will use.

If you only want a one-shot run without keeping `sks` installed globally:

```sh
npx -y -p sneakoscope sks root
```

For a repo-local install:

```sh
npm i -D sneakoscope
npx sks setup --install-scope project
```

Check that the install is usable:

```sh
sks deps check
sks codex-app check
sks dollar-commands
sks selftest --mock
```

## What Sneakoscope Adds

`sks` adds a tmux Codex CLI runtime, Codex App `$` commands, Team/QA/PPT/Research/DB/GX/Wiki routes, OpenClaw skill generation, Context7-gated current docs, TriWiki context packs, DB safety, design SSOT policy, skill dreaming, release checks, and Honest Mode.

## 0.8.0 Massive Upgrade

Sneakoscope 0.8.0 introduces the RecallPulse planning spine: a report-only active-recall layer that records what the pipeline should remember before a stage proceeds. RecallPulse maps TriWiki into L1/L2/L3 cache behavior, writes durable status ledgers instead of relying on ephemeral hook text, suppresses duplicate reminder loops, and emits RouteProofCapsule plus EvidenceEnvelope artifacts for later gate comparison. These artifacts are evidence surfaces first; speed or accuracy gains remain benchmark-gated until scored evals prove them.

Inspect the new report-only artifacts with:

```sh
sks recallpulse run latest
sks recallpulse status latest --json
sks recallpulse eval latest --json
sks recallpulse governance latest --json
sks recallpulse checklist latest --json
sks recallpulse checklist latest --task T001 --apply --evidence src/core/recallpulse.mjs
```

Research scouts now use named persona-inspired cognitive lenses: Einstein Scout, Feynman Scout, Turing Scout, von Neumann Scout, and Skeptic Scout. They are not impersonations; each scout ledger row must carry `display_name`, `persona`, `persona_boundary`, `reasoning_effort=xhigh`, a literal `Eureka!` idea, falsifiers, cheap probes, and debate participation evidence.

For existing 0.7.x users, the visible change is new report-only evidence, not a route personality rewrite. Team still feels like Team, DFix stays ultralight, DB remains conservative, QA-LOOP still dogfoods, PPT stays information-first, imagegen still requires real raster evidence, and Honest Mode remains the final truth pass. The original strong reminder idea became neutral RecallPulse so user-facing prompts stay short, professional, and non-repetitive; hook messages can point at status, but `mission-status-ledger.json` is the durable source when app-visible text disappears. The planning source is `docs/RECALLPULSE_0_8_0_TASKS.md`, and implementation is designed to land in safe task-sized slices before any enforcement promotion.

## 0.9.0 Report-Only Decision Lattice

Sneakoscope 0.9.0 adds a report-only Decision Lattice planner that uses A* over proof-debt signals to explain which route or verification path the pipeline would prefer. It is an evidence and planning surface, not a runtime shortcut: SKS must not claim speedup, fast-lane accuracy, or reduced verification cost from the lattice until replay or scored eval evidence demonstrates those outcomes.

The lattice integrates with the existing proof-field and `sks pipeline plan` surfaces. Its reports are expected to show the explored frontier, the selected path, and rejected paths with their proof-debt reasons, so reviewers can audit why a route stayed on the full Team/Honest path or why a smaller verification plan was only proposed. Like RecallPulse, this is designed to land as report-only evidence first; route enforcement and performance claims remain gated by later validation.

Quick checks:

```bash
sks proof-field scan --json --intent "small CLI change"
sks pipeline plan latest --proof-field --json
```

## Requirements

- Node.js `>=20.11`
- npm
- Codex CLI for terminal workflows
- Codex App for app-facing workflows, including Codex Computer Use and `$imagegen`/`gpt-image-2` evidence when required
- tmux for the CLI-first runtime
- Context7 MCP for current-docs-gated routes

Install tmux from [tmux.dev/download](https://www.tmux.dev/download). On macOS, Homebrew users can also install it with:

```sh
brew install tmux
```

The default `sks` runtime checks npm for newer `sneakoscope` and `@openai/codex` versions before opening tmux. `sks --mad` also checks dependencies, requires tmux 3.x, and prints only the session, gate, attach, and blocker details needed to act.

## Installation

### Global Install

Use this when you want `sks` available from any repo:

```sh
npm i -g sneakoscope
sks root
```

`sks` commands work even when no project root is present. Project-aware commands use the nearest `.sneakoscope`, `.dcodex`, or `.git` root; if none exists, SKS uses a per-user global runtime root. Global npm install/upgrade automatically bootstraps the current project when a project marker is present, otherwise it bootstraps the global runtime root. Run `sks bootstrap` manually only when you intentionally want to initialize or repair the current project after install.

Project setup writes shared `.gitignore` entries for generated SKS files: `.sneakoscope/`, `.codex/`, `.agents/`, and managed `AGENTS.md`. Setup, doctor repair, and npm postinstall refreshes also compare the previous SKS generated-file manifest with the current package templates and prune stale SKS-generated legacy skills or agent files while preserving user-owned custom skills. Use `sks setup --local-only` when you want those excludes kept only in `.git/info/exclude`.

During npm postinstall, SKS installs generated Codex App skills and tries `skills add MohtashamMurshid/getdesign` when the `skills` CLI is available. Design work still flows through one authority: `design.md`.

### One-Shot Install

Use this when you do not want to keep a global install:

```sh
npx -y -p sneakoscope sks bootstrap
```

`npx` fetches the package into npm's cache and runs the binary for that command. This is useful for first-time setup or CI-style verification.

### Project Install

Use this when a repo should pin Sneakoscope as a development dependency:

```sh
npm i -D sneakoscope
npx sks setup --install-scope project
```

Project installs are useful when a team wants a repeatable harness version checked through `package-lock.json`.

### Source Checkout

Use this when developing Sneakoscope itself:

```sh
git clone https://github.com/mandarange/Sneakoscope-Codex.git
cd Sneakoscope-Codex
npm install
npm install -g .
sks --version
```

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
sks deps check
sks deps install tmux
sks codex-app check
sks doctor --fix
sks fix-path
```

### Open Codex CLI With tmux

```sh
sks
sks tmux open
sks tmux check
sks tmux status --once
```

Bare `sks` creates or reuses the default named tmux session for Codex CLI and attaches to it in an interactive terminal. By default it launches Codex in Fast service tier with `--model gpt-5.5`, `-c service_tier="fast"`, and the selected `model_reasoning_effort` with a static SKS 3D ASCII intro inside tmux; the animated intro is reserved for non-tmux unauthenticated Codex launches and can be disabled with `SKS_TMUX_LOGO_ANIMATION=0`. SKS always forces the model to `gpt-5.5`; `SKS_CODEX_MODEL` and `SKS_CODEX_FAST_HIGH=0` cannot downgrade or remove that model pin. You can still set `SKS_CODEX_REASONING` to change reasoning effort. Use `sks tmux open` when you need explicit `--workspace` / `--session` flags, `sks tmux check` for readiness without launching, and `sks help` for CLI help. Use `--no-attach` or `SKS_TMUX_NO_AUTO_ATTACH=1` when you only want SKS to create/reuse the session and print the manual attach command.

Before opening tmux, SKS checks the installed Codex CLI against npm `@openai/codex@latest`. If a newer version exists, it asks `Y/n`; answering `y` updates automatically with `npm i -g @openai/codex@latest` and then opens tmux with the updated Codex CLI.

For [codex-lb](https://github.com/Soju06/codex-lb), start the server, create a dashboard API key, then run:

```sh
sks codex-lb setup --host https://your-codex-lb.example.com --api-key "sk-clb-..."
sks codex-lb health
sks codex-lb repair
sks
```

Bare `sks` can also prompt for codex-lb auth; SKS stores the base URL/key in `~/.codex/sks-codex-lb.env`, writes the upstream codex-lb Codex CLI / IDE Extension provider block into `~/.codex/config.toml` for Codex App routing, loads the provider env key for tmux launches, and syncs the macOS user launch environment so the Codex App can see `CODEX_LB_API_KEY` after restart. If the provider block disappears but the stored env file is still recoverable, bare `sks`, npm postinstall upgrades, `sks doctor --fix`, and `sks codex-lb repair` restore it with `env_key = "CODEX_LB_API_KEY"`, `supports_websockets = true`, and `requires_openai_auth = true` as documented by codex-lb. If an older SKS release left the codex-lb dashboard key only in the shared Codex `auth.json` login cache, SKS migrates that key back into `~/.codex/sks-codex-lb.env` when a codex-lb provider or env base URL is already recoverable. It does not rewrite the shared Codex `auth.json` login cache by default; set `SKS_CODEX_LB_SYNC_CODEX_LOGIN=1` only if you intentionally want the old API-key login-cache behavior. When codex-lb is active, SKS opens a fresh `sks-codex-lb-*` tmux session and sweeps older detached codex-lb sessions for the same repo before launch so stale Responses API chains are not reused. Configured launch paths, including non-interactive runs, verify that codex-lb can continue a Responses API chain with `previous_response_id`; if that check fails, SKS bypasses codex-lb for that launch with `model_provider="openai"` instead of letting the Codex session fail mid-work.

If codex-lb provider auth drifts after launch/reinstall, run `sks doctor --fix` or `sks codex-lb repair`; to replace it, run `sks codex-lb reconfigure --host <domain> --api-key <key>`.

### Switching back to ChatGPT OAuth (releasing codex-lb)

If you want to hand control back to your official ChatGPT account login after codex-lb has been reconciled, use `sks codex-lb release`:

```sh
sks codex-lb release
```

This restores `~/.codex/auth.chatgpt-backup.json` (written by the 0.9.3 auto-reconcile) to `~/.codex/auth.json` and unsets `model_provider = "codex-lb"` so Codex CLI/App falls back to ChatGPT OAuth. To re-engage codex-lb afterward, run `sks codex-lb repair`.

Flags:

- `--keep-provider` — restore `auth.json` only; leave `model_provider = "codex-lb"` selected (advanced use).
- `--delete-backup` — remove `~/.codex/auth.chatgpt-backup.json` after a successful restore. Default is to keep it so a subsequent re-reconcile still has a source backup.
- `--force` — restore even when the current `auth.json` does not look like the codex-lb apikey shape (e.g. if you hand-edited it after reconcile).
- `--json` — machine-readable output with `status` ∈ {`released`, `no_backup`, `already_chatgpt`, `auth_in_use`, `failed`} plus `auth_path`, `backup_path`, `provider_unselected`, `backup_removed`.

`sks codex-lb status` reports whether a ChatGPT OAuth backup is present and shows the `sks codex-lb release` hint when applicable. `sks doctor` surfaces the same hint.

If you only want to stop routing through codex-lb without touching `auth.json`, use the lighter `sks codex-lb unselect` instead:

```sh
sks codex-lb unselect
```

This flips `model_provider` away from `codex-lb` in the top-level Codex App config while leaving your `sks-codex-lb.env` and `auth.json` untouched, so you can re-engage codex-lb later with `sks codex-lb repair` without re-running setup.

### MAD tmux Launch

```sh
sks --mad
sks --mad --yes
```

This syncs existing codex-lb provider auth, creates/uses the `sks-mad-high` full-access profile, opens the MAD-SKS permission gate for that tmux run, and launches a single Codex CLI pane. The session recreates the named session so stale split-pane MAD sessions collapse back to one pane. Catastrophic database wipe/all-row/project-management safeguards remain active, and the pipeline contract still forbids unrequested fallback implementation code.

Before launching, SKS checks npm for a newer `sneakoscope`; answer `y` to update or `n` to continue. Use `--yes` to approve missing dependency installs automatically.

### Team Missions

```sh
sks team "implement this feature"
sks team "wide refactor" executor:5 reviewer:6
sks team watch latest
sks team lane latest --agent analysis_scout_1 --follow
sks team message latest --from analysis_scout_1 --to executor_1 --message "handoff note"
sks team cleanup-tmux latest
sks team status latest
sks team dashboard latest
sks team log latest
```

Team missions keep at least five QA/reviewer lanes active, record live events, compile runtime tasks and worker inboxes, write schema-backed effort/work-order/dashboard artifacts, and reconcile split live lanes in tmux when available. Use `sks team watch`, `sks team lane`, `sks team message`, and `sks team cleanup-tmux` to inspect or close the live view.

### QA, Computer Use, Goal, Research, DB, Wiki, GX

```sh
sks qa-loop prepare "http://localhost:3000"
sks qa-loop run latest --max-cycles 2
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
sks perf workflow --json --intent "small CLI change" --changed src/cli/main.mjs,src/core/routes.mjs
sks proof-field scan --json --intent "small CLI change"
sks skill-dream status
sks skill-dream run --json
sks code-structure scan --json
```

`sks research` prepares a named genius-lens scout council, requires every scout to run at `xhigh`, records one literal `Eureka!` idea per scout, runs an evidence-bound debate, and creates `research-source-skill.md` as a route-local source collection skill before synthesis. Research is not a code-change route: real runs may write only their own mission artifacts under `.sneakoscope/missions/<id>/`, and source/package/docs/config mutations block the run with `research-code-mutation-blocker.json`. The required Research persona lenses are Einstein Scout, Feynman Scout, Turing Scout, von Neumann Scout, and Skeptic Scout; they are cognitive roles, not impersonations, and `scout-ledger.json` must include `display_name`, `persona`, `persona_boundary`, `reasoning_effort`, falsifiers, cheap probes, and `challenge_or_response`. Normal Research is not a fixed three-cycle flow: it repeats source gathering, Eureka ideas, debate, falsification, and synthesis pressure until every scout records final agreement, or pauses at the explicit max-cycle safety cap with an unpassed gate. `debate-ledger.json` must include `consensus_iterations`, `unanimous_consensus`, and per-scout agreements; `research-gate.json` cannot pass until unanimous consensus is true for all scouts. Normal Research is intentionally allowed to take one or two hours when the problem needs it; `--mock` is only for selftests or dry harness checks, and a real run blocks with `research-blocker.json` instead of silently substituting mock output when the Codex execution path is unavailable. The source layer contract separates latest papers, official/government or leading-institution sources, standards/primary docs, current news such as BBC/CNN/GDELT-style sources, public discourse such as X/Reddit, developer/practitioner knowledge such as Stack Overflow/GitHub, traditional background sources, and counterevidence/fact-checking; `source-ledger.json` must record layer coverage, source quality, blockers, citations, and cross-layer triangulation. Context7 is optional for `$Research` and only becomes relevant when the research topic specifically depends on package, API, framework, or SDK documentation. Research runs require `research-report.md`, `research-paper.md`, `genius-opinion-summary.md`, `research-source-skill.md`, `source-ledger.json`, `scout-ledger.json`, `debate-ledger.json`, `novelty-ledger.json`, `falsification-ledger.json`, and `research-gate.json` so they stay source-backed, adversarially checked, falsifiable, paper-ready, and clear about every scout lens opinion. `research status` reports source entries, source-layer coverage, triangulation checks, counterevidence, xhigh scout count, Eureka moments, debate exchanges, consensus iterations, unanimous consensus, paper presence/sections, genius-opinion summary coverage, scout findings, and falsification cases alongside the gate.

`sks recallpulse` is the 0.8.0 report-only RecallPulse utility. It writes `recallpulse-decision.json`, `mission-status-ledger.json`, `route-proof-capsule.json`, `evidence-envelope.json`, `recallpulse-governance-report.json`, `recallpulse-task-goal-ledger.json`, and `recallpulse-eval-report.json` for the current mission. RecallPulse does not replace route gates, Honest Mode, DB safety, imagegen evidence, or TriWiki validation; it records cache hits, hydration needs, duplicate suppression, route-governance risks, and final-summary-ready durable status so later releases can promote only measured improvements. Checklist updates are sequential: every `Txxx` row is treated as a child `$Goal` checkpoint, and `sks recallpulse checklist ... --task T001 --apply` refuses out-of-order checks unless explicitly overridden.

`sks pipeline plan` shows the active route lane, kept/skipped stages, verification commands, and no-unrequested-fallback invariant. The 0.9.0 Decision Lattice augments this planning surface with report-only A*/proof-debt evidence: frontier paths considered, the selected path, and rejected paths with rejection reasons. `sks proof-field scan` remains the lightweight rubric for small changes; risky or broad signals return to the full Team/Honest path, and no speedup claim is valid without replay or eval evidence.

### Ambiguity Questions

Clarification asks only for ambiguity that changes execution; predictable defaults are inferred and sealed. `sks skill-dream` records cheap counters and periodically writes advisory skill reports. `$Goal` controls native `/goal` persistence without replacing the selected execution route. `$Computer-Use` / `$CU` is the fast Codex Computer Use lane for UI/browser/visual work.

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
sks codex-app remote-control --status
sks dollar-commands
```

For headless remotely controllable Codex App/server sessions on Codex CLI 0.130.0 or newer, run:

```sh
sks codex-app remote-control -- --help
```

`sks codex-app check` reports whether the installed Codex CLI is new enough, whether the required app flags are visible, whether Fast/speed-selector config is unlocked, whether Codex App Git Actions can use Commit, Push, Commit and Push, and PR flows, and whether installed OpenAI default plugins such as Browser, Chrome, Computer Use, Documents, Presentations, Spreadsheets, and LaTeX are enabled. When codex-lb is configured, SKS keeps it selected as the top-level Codex App provider while still preserving required app flags and plugin settings. Codex CLI 0.130.0+ app-server/remote-control threads can pick up config changes live; older CLI/TUI sessions should still be restarted after `.codex/config.toml` or MCP/plugin changes.

Image-review routes are intentionally strict. `$Image-UX-Review`, `$UX-Review`, `$Visual-Review`, and `$UI-UX-Review` require real Codex App `$imagegen`/`gpt-image-2` generated annotated review images before `image-ux-review-gate.json` can pass; disabled or missing `image_generation` remains a blocker that `sks codex-app check` and selftest cover.

Then open Codex App and use prompt commands directly in the chat. Examples:

```text
$Team implement the checkout fix and verify it
$DFix change this label and spacing only
$QA-LOOP dogfood localhost:3000 and fix safe issues
$PPT create an investor deck as HTML/PDF
$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues
$Goal persist this migration workflow with native /goal continuation
$Research investigate this mechanism with source-backed scout lenses
$Wiki refresh and validate the context pack
$DB inspect this migration for destructive risk
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

## OpenClaw Agent Usage

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
SKS_OPENCLAW=1 sks proof-field scan --intent "small CLI change" --changed src/cli/main.mjs
```

If OpenClaw runs in a sandbox, grant shell execution only for trusted workspaces. Database, migration, and destructive work still follows SKS safety routes.

## Prompt `$` Commands

Use these inside Codex App or another agent prompt. They are prompt commands, not terminal commands.

Common prompts: `$Team`, `$From-Chat-IMG`, `$DFix`, `$Answer`, `$SKS`, `$QA-LOOP`, `$PPT`, `$Computer-Use`/`$CU`, `$Goal`, `$Research`, `$AutoResearch`, `$DB`, `$MAD-SKS`, `$GX`, `$Wiki`, and `$Help`.

## Common Workflows

First install:

```sh
npm i -g sneakoscope
sks bootstrap
sks deps check
sks codex-app check
sks selftest --mock
```

Start a CLI workspace:

```sh
sks tmux check
sks
# or: sks --mad
```

Use Codex App routes with `$Team`, `$DFix`, `$QA-LOOP`, `$PPT`, `$Goal`, `$Wiki`, and `$DB`. Team missions write artifacts under `.sneakoscope/missions/`; validate them with `sks validate-artifacts latest`.

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
which sks
sks --version
node ./bin/sks.mjs --version
npm install -g .
```

If stale, reinstall globally from the repo or npm.

### tmux is missing

```sh
sks deps install tmux
sks tmux check
```

Install tmux from [tmux.dev/download](https://www.tmux.dev/download) or `brew install tmux` on macOS, then re-run the check.

### Codex App tools are missing

```sh
sks codex-app check
codex mcp list
```

Codex App workflows need the app installed. UI/browser evidence requires first-party Codex Computer Use, and generated raster/image-review evidence requires real `$imagegen`/`gpt-image-2` output. After setup/upgrade, start a fresh thread so Codex reloads plugin tools.

### Codex App commit/push is blocked

```sh
sks doctor --fix
sks codex-app check
```

`sks codex-app check` now prints `Git Actions`. It should be `ok` for Codex App Commit, Push, Commit and Push, and PR buttons to bypass SKS route gates. If it is blocked, repair config with `sks doctor --fix`; if the blocker mentions remote-control, update Codex CLI to `0.130.0` or newer and restart older app-server/TUI sessions.

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
npm run selftest
npm run sizecheck
npm run registry:check
npm run release:check
npm run publish:dry
```

`release:check` runs audit, changelog, syntax, selftest, size, and registry checks. `publish:dry` runs that same gate and then performs an npm dry-run publish against the public registry.

Version bumps are manual. Run `sks versioning bump` only when preparing release metadata; SKS will not create `.git/hooks/pre-commit` or auto-bump during ordinary commits.

## License

MIT
