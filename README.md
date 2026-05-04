# Sneakoscope Codex

![](https://github.com/mandarange/Sneakoscope-Codex/raw/dev/docs/assets/sneakoscope-codex-logo.png)

Sneakoscope Codex (`sks`, displayed as `ㅅㅋㅅ`) is a Codex CLI/App harness for repeatable agent workflows. It adds terminal commands, Codex App `$` prompt commands, warp-native CLI workspaces, Team/Goal/QA/Research routes, Context7 evidence checks, DB safety, TriWiki context tracking, Honest Mode, and release-readiness gates.

## Quick Start

Install globally, then run `sks` from either a project or any global shell location:

```sh
npm i -g sneakoscope
sks root
sks bootstrap
sks
```

`sks root` tells you whether SKS found a project root or is using the per-user global runtime root. Outside a repo/project marker, runtime commands such as `sks`, `sks deps check`, `sks pipeline status`, and `sks team ...` use that global root instead of writing `.sneakoscope` into the random current directory.

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

| Area | What it does |
| --- | --- |
| CLI runtime | `sks`, `sks warp`, and `sks --mad` write/open Warp Launch Configurations for Codex CLI. |
| Codex App commands | Installs generated skills so `$Team`, `$From-Chat-IMG`, `$DFix`, `$QA-LOOP`, `$Goal`, `$DB`, `$Wiki`, `$Help`, and related routes are visible in prompt workflows. |
| Team orchestration | Runs substantial work through ambiguity handling, scouts, TriWiki refresh, debate, runtime task graphs, worker inboxes, implementation, review, cleanup, reflection, and Honest Mode. |
| From-Chat-IMG | Turns chat screenshots plus original attachments into source-bound work orders, then requires scoped QA evidence before completion. |
| QA loop | Dogfoods UI/API behavior with safety gates, Codex Computer Use-only UI evidence, safe fixes, and rechecks. |
| Goal | Bridges SKS pipeline state to Codex native persisted `/goal` create, pause, resume, and clear workflows. |
| TriWiki voxels | Maintains `.sneakoscope/wiki/context-pack.json` as the context SSOT with coordinate anchors, voxel metadata, `attention.use_first`, and `attention.hydrate_first`. |
| Context7 | Requires current docs for external packages, APIs, MCPs, SDKs, and framework/runtime behavior when correctness depends on current guidance. |
| DB safety | Treats SQL, migrations, Supabase, RLS, and destructive operations as high risk. |
| Release hygiene | Checks versioning, changelog, package contents, tarball size, syntax, selftests, and dry-run publishing. |

## Requirements

- Node.js `>=20.11`
- npm
- Codex CLI for terminal workflows
- Codex App for app-facing workflows, with Codex Computer Use required for UI/browser evidence
- Warp for the CLI-first runtime
- Context7 MCP for current-docs-gated routes

Install Warp from [warp.dev/download](https://www.warp.dev/download). On macOS, Homebrew users can also install it with:

```sh
brew install --cask warp
```

`sks --mad` is stricter than the normal runtime path:

- Checks npm for a newer `sneakoscope` before launch and asks whether to update when the terminal can answer y/n.
- Installs the latest Codex CLI with `npm i -g @openai/codex@latest` when it is missing and you approve or pass `--yes`.
- Requires Warp to be installed before opening the Launch Configuration.
- Writes a named Warp Launch Configuration and opens it through `warp://launch/<name>.yaml`.

## Installation

### Global Install

Use this when you want `sks` available from any repo:

```sh
npm i -g sneakoscope
sks root
sks bootstrap
```

`sks` commands work even when no project root is present. Project-aware commands use the nearest `.sneakoscope`, `.dcodex`, or `.git` root; if none exists, SKS uses a per-user global runtime root. `sks bootstrap` still initializes the current project when you want project-local hooks, skills, and TriWiki state.

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
sks deps install warp
sks codex-app check
sks doctor --fix
sks fix-path
```

### Open Codex CLI With Warp

```sh
sks
sks warp check
sks warp status --once
```

`sks` writes a Warp Launch Configuration for Codex CLI and opens it through Warp's public URI scheme when running in an interactive terminal. `sks warp check` is diagnostic and prints readiness without starting a workspace.

### MAD Warp Launch

```sh
sks --mad
sks --mad --yes
```

This creates/uses the `sks-mad-high` Codex profile for a one-shot full-access, high-reasoning Warp launch with `approval_policy = "on-request"` and `approvals_reviewer = "auto_review"`. It is scoped to that explicit command and does not change normal SKS/DB safety defaults. Repeat launches overwrite the same named SKS MAD Launch Configuration.

MAD does not disable the pipeline contract: stages, executors, reviewers, and auto-review policy still must not invent unrequested fallback implementation code. If the requested path cannot be implemented, SKS should block with evidence rather than add substitute behavior.

Before launching, SKS checks whether a newer `sneakoscope` exists on npm. In an interactive terminal it prompts:

```text
SKS 0.x.y -> 0.x.z update before MAD launch? [Y/n]
```

Answer `y` to install `sneakoscope@latest`, then rerun `sks --mad`. Answer `n` to continue with the current version. Use `--yes` to approve missing dependency installs automatically.

### Team Missions

```sh
sks team "implement this feature" executor:3 reviewer:1
sks team watch latest
sks team lane latest --agent analysis_scout_1 --follow
sks team message latest --from analysis_scout_1 --to executor_1 --message "handoff note"
sks team cleanup-warp latest
sks team status latest
sks team dashboard latest
sks team log latest
```

Team mode prepares the mission, records live events, compiles runtime tasks and worker inboxes, writes schema-backed effort/work-order/dashboard artifacts, and opens a named Warp Team Launch Configuration with split live lanes when Warp is available. `sks team dashboard` renders the cockpit panes for mission overview, agent lanes, task DAG, QA/dogfood, artifacts/evidence, and performance.

The Warp Team launch is a live orchestration screen: the first pane follows `sks team watch <mission-id> --follow` as the mission overview, and neighboring split panes follow individual `sks team lane <mission-id> --agent <name> --follow` views. SKS gives lanes role-specific colors, labels, and terminal titles, so scouts, planning/debate voices, executors, reviewers, and safety lanes are visually distinct while the same evidence is mirrored into `team-transcript.jsonl`, `team-live.md`, and `team-dashboard.json`.

Agent sessions communicate through the bounded Team transcript. Use `sks team message <mission-id|latest> --from <agent> --to <agent|all> --message "..."` to add direct or broadcast messages; lane panes show messages addressed to that agent plus the fallback global tail.

When the Team route reaches `session_cleanup`, SKS marks the Warp launch record complete and asks `watch --follow` / `lane --follow` panes to show a cleanup summary and stop. You can also run `sks team cleanup-warp <mission-id|latest>` manually, or `sks team cleanup-warp latest --close` to remove the generated Launch Configuration. Warp's public URI/Launch Configuration surface does not expose a live pane-close API, so the panes remain user-controlled.

### QA, Goal, Research, DB, Wiki, GX

```sh
sks qa-loop prepare "http://localhost:3000"
sks qa-loop run latest --max-cycles 2
sks goal create "persist this migration workflow"
sks research prepare "evaluate this approach"
sks db scan --json
sks wiki refresh
sks wiki sweep latest --json
sks wiki validate .sneakoscope/wiki/context-pack.json
sks harness fixture --json
sks gx init homepage
sks gx render homepage --format html
sks validate-artifacts latest --json
sks perf run --json
sks perf workflow --json --intent "small CLI change" --changed src/cli/main.mjs,src/core/routes.mjs
sks proof-field scan --json --intent "small CLI change"
sks code-structure scan --json
```

## Codex App Usage

Sneakoscope has two surfaces:

- Terminal commands such as `sks deps check`, `sks team "task"`, and `sks --mad`
- Codex App prompt commands such as `$Team`, `$DFix`, `$QA-LOOP`, and `$Wiki`

After installing, run:

```sh
sks bootstrap
sks codex-app check
sks dollar-commands
```

Then open Codex App and use prompt commands directly in the chat. Examples:

```text
$Team implement the checkout fix and verify it
$DFix change this label and spacing only
$QA-LOOP dogfood localhost:3000 and fix safe issues
$Goal persist this migration workflow with native /goal continuation
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

Use `sks dollar-commands` to confirm that terminal discovery and Codex App prompt commands agree.

TriWiki is intentionally sparse: `sks wiki sweep` records demote, soft-forget, archive, delete, promote-to-skill, and promote-to-rule candidates instead of injecting every old claim into future prompts. `sks harness fixture` validates the broader Harness Growth Factory contract: deliberate forgetting fixtures, skill card metadata, experiment schema, tool-error taxonomy, permission profiles, MultiAgentV2 defaults, and Warp cockpit view coverage. `sks code-structure scan` flags handwritten files above 1000/2000/3000-line thresholds so new logic can be extracted before command files become harder to maintain.

## Prompt `$` Commands

Use these inside Codex App or another agent prompt. They are prompt commands, not terminal commands.

| Prompt | Use when |
| --- | --- |
| `$Team` | You want implementation, code changes, or substantial repo work. |
| `$From-Chat-IMG` | You have a chat screenshot plus original attachments and want each visible request mapped to work. |
| `$DFix` | You need a tiny design/content edit such as copy, label, color, spacing, or translation. |
| `$Answer` | You want an answer only and no implementation should start. |
| `$SKS` | You need setup, status, usage, or workflow help. |
| `$QA-LOOP` | You want UI/API dogfooding, safe fixes, and rechecks. |
| `$Goal` | You want Codex native persisted `/goal` continuation for a workflow. |
| `$Research` | You need frontier-style research with hypotheses and falsification. |
| `$AutoResearch` | You want iterative improve/test/keep-or-discard optimization. |
| `$DB` | You need database, Supabase, migration, SQL, or MCP safety checks. |
| `$MAD-SKS` | You explicitly authorize scoped Supabase MCP DB cleanup/write permissions for the active invocation only, while keeping catastrophic wipe safeguards. |
| `$GX` | You need deterministic visual context cartridges. |
| `$Wiki` | You want TriWiki refresh, pack, prune, validate, or maintenance. |
| `$Help` | You want installed command and workflow explanation. |

## Common Workflows

### First Install Checklist

```sh
npm i -g sneakoscope
sks bootstrap
sks deps check
sks codex-app check
sks dollar-commands
sks selftest --mock
```

### Start A CLI Workspace

```sh
sks warp check
sks
```

For the high-reasoning full-access profile:

```sh
sks --mad
```

### Use Codex App `$Team`

```text
$Team implement the requested change, update docs if needed, and verify with the relevant tests
```

Team mode records a mission under `.sneakoscope/missions/`, keeps a live transcript, uses TriWiki context, and finishes with evidence and Honest Mode.
Every new Team mission now also writes `work-order-ledger.json`, `effort-decision.json`, and `team-dashboard-state.json`. Run `sks validate-artifacts latest` to check the schema gates before treating mission artifacts as completion evidence.

### Dogfood A UI Or API

```sh
sks qa-loop prepare "http://localhost:3000"
sks qa-loop run latest --max-cycles 2
sks qa-loop status latest
```

Use `$QA-LOOP` in Codex App when UI-level E2E needs verification. UI verification must use Codex Computer Use evidence only; Chrome MCP, Browser Use, Playwright, Selenium, Puppeteer, and other browser automation do not satisfy UI-level E2E verification.

### Refresh Context Before Risky Work

```sh
sks wiki refresh
sks wiki validate .sneakoscope/wiki/context-pack.json
```

TriWiki is the long-running context source of truth. It keeps compact high-trust recall in `attention.use_first` and source-hydration targets in `attention.hydrate_first`.

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

If the global command is stale, reinstall globally from the repo or from npm.

### Warp is missing

```sh
sks deps install warp
sks warp check
```

Install Warp from [warp.dev/download](https://www.warp.dev/download) or run `brew install --cask warp` on macOS, then re-run `sks warp check`.

### Codex App tools are missing

```sh
sks codex-app check
codex mcp list
```

Codex App workflows need the app installed. QA and visual-evidence workflows require first-party Codex Computer Use; Browser Use may support non-UI browser context, but it is not valid UI/browser verification evidence.

### Setup is blocked by another harness

```sh
sks conflicts check
sks conflicts prompt
```

OMX/DCodex conflicts intentionally block setup/doctor until the user approves cleanup.

### The route is stuck or a final hook keeps reopening

```sh
sks pipeline status --json
sks team watch latest
sks team lane latest --agent parent_orchestrator --follow
sks wiki validate .sneakoscope/wiki/context-pack.json
```

Finalization requires real evidence, no unsupported critical claims, valid Team cleanup artifacts, reflection when required, and Honest Mode.

## Development And Release

Run local checks:

```sh
npm run repo-audit
npm run changelog:check
npm run packcheck
npm run selftest
npm run sizecheck
npm run release:check
```

Package pipeline UI/browser verification and visual inspection evidence must come from Codex Computer Use only. Do not use Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, or other browser automation as substitutes for that evidence.

Dry-run publish:

```sh
npm run publish:dry
```

`publish:dry` proves the local package is packable. It does not prove npm ownership, OTP, or registry publish permission.

## Documentation Style

This README follows a common open-source CLI shape:

- quick start first
- explicit install paths
- separate CLI and app/plugin usage
- command examples before internal architecture
- troubleshooting and release checks near the end

That shape mirrors how projects such as `rdme` and Vite separate quick start, setup/configuration, and CLI usage while keeping copy-ready commands visible.

## License

MIT
