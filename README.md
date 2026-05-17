# Sneakoscope Codex

Fast proof-first Codex trust layer with image-based Voxel TriWiki.

Sneakoscope Codex (`sks`) is a Codex CLI/App harness that makes repeatable Codex work auditable. `0.9.13` connects serious-route completion, visual/UI evidence, Codex App hooks, codex-lb launch health, fixture evidence, and Rust accelerator parity into release-gated trust surfaces.

## 0.9.13 Current Release

`0.9.13` turns SKS into a proof-first trust layer for Codex work:

- Serious routes write and validate Completion Proof before completion is claimed.
- Visual/UI routes require Image Voxel TriWiki anchors, with before/after relations for visual fix claims.
- Hook replay uses shared runtime policy fixtures, with PAT/access-token evidence redacted.
- codex-lb launch failures feed circuit health; stateless `previous_response_not_found` stays a warning.
- Rust `image-hash` and `voxel-validate` commands match JS fallback behavior. Rust source is included in the npm package; until prebuilt binaries ship, SKS uses JS fallbacks unless `SKS_RS_BIN` or a source-checkout `sks-rs` binary is available.

Learn more:
- Completion Proof: [docs/completion-proof.md](docs/completion-proof.md)
- Image Voxel TriWiki: [docs/image-voxel-ledger.md](docs/image-voxel-ledger.md)
- Codex App Hooks/PAT: [docs/hooks-pat.md](docs/hooks-pat.md)
- codex-lb: [docs/codex-lb.md](docs/codex-lb.md)

## 60-second start

```sh
npm i -g sneakoscope
sks root
sks doctor
sks codex-app check
sks selftest --mock
```

## Three core promises

1. Image-based Voxel TriWiki memory
2. Codex App / codex-lb operational readiness
3. Completion proof for every serious route

## Install Options

Install globally, then run `sks` from either a project or any global shell location:

```sh
npm i -g sneakoscope
sks root
sks doctor
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

Bare `sks` can also prompt for codex-lb auth; SKS stores the base URL/key in `~/.codex/sks-codex-lb.env`, writes the upstream codex-lb Codex CLI / IDE Extension provider block into `~/.codex/config.toml` for Codex App routing, loads the provider env key for tmux launches, and syncs the macOS user launch environment so the Codex App can see `CODEX_LB_API_KEY` after restart. If the provider block disappears but the stored env file is still recoverable, bare `sks`, npm postinstall upgrades, `sks doctor --fix`, and `sks codex-lb repair` restore it with `env_key = "CODEX_LB_API_KEY"`, `supports_websockets = true`, and `requires_openai_auth = true` as documented by codex-lb. If an older SKS release left the codex-lb dashboard key only in the shared Codex `auth.json` login cache, SKS migrates that key back into `~/.codex/sks-codex-lb.env` when a codex-lb provider or env base URL is already recoverable. It does not rewrite the shared Codex `auth.json` login cache by default; set `SKS_CODEX_LB_SYNC_CODEX_LOGIN=1` only if you intentionally want the old API-key login-cache behavior. When codex-lb is active, SKS opens a fresh `sks-codex-lb-*` tmux session and sweeps older detached codex-lb sessions for the same repo before launch so stale Responses API chains are not reused. Configured launch paths run a response-chain health check. `previous_response_not_found` is treated as a stateless-LB warning and keeps codex-lb active. Hard failures are surfaced to the user; SKS only bypasses codex-lb when the user chooses OAuth fallback or `SKS_CODEX_LB_AUTOBYPASS=1` is set.

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

If Codex App shows `access token could not be refreshed` after codex-lb setup or status checks, recover the ChatGPT OAuth side without discarding codex-lb: run `sks codex-lb status`, then `sks codex-lb repair`. Repair restores a ChatGPT OAuth backup when one exists while keeping `model_provider = "codex-lb"` selected and the codex-lb key in `CODEX_LB_API_KEY`. If no OAuth backup exists, sign in again in Codex App/CLI, then rerun `sks codex-lb repair`. Use `sks codex-lb release` only when you want to switch fully away from codex-lb.

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
npm run feature:check
npm run all-features:selftest
npm run selftest
npm run sizecheck
npm run registry:check
npm run release:check
npm run publish:dry
```

`release:check` runs audit, changelog, syntax, feature-registry coverage, all-features contract selftest, selftest, size, and registry checks. Generate the human-readable registry with `sks features inventory --write-docs`. `publish:dry` runs that same gate and then performs an npm dry-run publish against the public registry.

Version bumps are manual. Run `sks versioning bump` only when preparing release metadata; SKS will not create `.git/hooks/pre-commit` or auto-bump during ordinary commits.

## License

MIT
