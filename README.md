# Sneakoscope Codex

![](https://github.com/mandarange/Sneakoscope-Codex/raw/dev/docs/assets/sneakoscope-codex-logo.png)

Sneakoscope Codex (`sks`, displayed as `ㅅㅋㅅ`) is a Codex CLI/App harness for repeatable agent workflows. It adds terminal commands, Codex App `$` prompt commands, tmux-native CLI workspaces, Team/QA/Research routes, inspectable pipeline plans, a maximum-speed Computer Use lane, a fast Goal bridge for native `/goal` persistence, Context7 evidence checks, DB safety, TriWiki context tracking, design-system SSOT routing, lightweight skill dreaming, Honest Mode, and release-readiness gates.

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
| CLI runtime | `sks tmux open` and `sks --mad` explicitly launch Codex CLI with tmux; bare `sks` only prints help/readiness surfaces. |
| Codex App commands | Installs generated skills so `$Team`, `$From-Chat-IMG`, `$DFix`, `$QA-LOOP`, `$PPT`, `$Goal`, `$DB`, `$Wiki`, `$Help`, and related routes are visible in prompt workflows. |
| Pipeline plans | Writes `pipeline-plan.json` for stateful routes so the runtime lane, kept stages, skipped stages, verification commands, and no-unrequested-fallback invariant are visible with `sks pipeline plan`. |
| Team orchestration | Runs substantial work through score-based ambiguity handling, scouts, TriWiki refresh, debate, runtime task graphs, worker inboxes, implementation, review, cleanup, reflection, and Honest Mode; narrow work should use Proof Field evidence to skip unrelated pipeline work instead of expanding Team. |
| Skill dreaming | Records cheap generated-skill usage counters in JSON and only periodically scans `.agents/skills` for keep, merge, prune, and improvement candidates. Reports are recommendation-only and never delete skills automatically. |
| From-Chat-IMG | Turns chat screenshots plus original attachments into source-bound work orders, then requires scoped QA evidence before completion. |
| QA loop | Dogfoods UI/API behavior with safety gates, Codex Computer Use-only UI evidence, safe fixes, and rechecks. |
| PPT pipeline | Uses `$PPT` for simple, restrained, information-first HTML/PDF presentation artifacts, first asking delivery context, audience profile, STP strategy, decision context, and 3+ pain-point to solution/aha mappings before source research, design-system work, HTML/PDF export, and render QA. Independent strategy/render/file-write phases run in parallel where inputs allow and are recorded in `ppt-parallel-report.json`; editable source HTML is preserved under `source-html/`, PPT-only temporary build files are cleaned after completion, installed skills/MCPs outside the `$PPT` allowlist are ignored, generated image assets may use `$imagegen` only when sealed in the contract, and `ppt-style-tokens.json` records the design SSOT plus fused source inputs. |
| Computer Use fast lane | Uses `$Computer-Use` / `$CU` for UI/browser/visual work that needs maximum speed: skip Team debate and upfront TriWiki loops, use Codex Computer Use directly, then refresh/validate TriWiki and run Honest Mode at final closeout. |
| Goal | Provides a fast SKS bridge overlay for Codex native persisted `/goal` create, pause, resume, and clear controls; implementation continues through the selected SKS execution route. |
| TriWiki voxels | Maintains `.sneakoscope/wiki/context-pack.json` as the context SSOT with coordinate anchors, voxel metadata, `attention.use_first`, and `attention.hydrate_first`. |
| Context7 | Requires current docs for external packages, APIs, MCPs, SDKs, and framework/runtime behavior when correctness depends on current guidance. |
| Design SSOT | Treats `design.md` as the only design decision source of truth. `docs/Design-Sys-Prompt.md` is the builder prompt; getdesign.md, official getdesign docs, and curated DESIGN.md examples from `VoltAgent/awesome-design-md` are source inputs that must be fused into `design.md` or route-local style tokens instead of becoming parallel authorities. |
| DB safety | Treats SQL, migrations, Supabase, RLS, and destructive operations as high risk. |
| Release hygiene | Checks versioning, changelog, package contents, tarball size, syntax, selftests, and dry-run publishing. |

## Requirements

- Node.js `>=20.11`
- npm
- Codex CLI for terminal workflows
- Codex App for app-facing workflows, with Codex Computer Use required for UI/browser evidence
- tmux for the CLI-first runtime
- Context7 MCP for current-docs-gated routes

Install tmux from [tmux.dev/download](https://www.tmux.dev/download). On macOS, Homebrew users can also install it with:

```sh
brew install tmux
```

`sks --mad` is stricter than the normal runtime path:

- Checks npm for a newer `sneakoscope` before launch and asks whether to update when the terminal can answer y/n.
- Installs the latest Codex CLI with `npm i -g @openai/codex@latest` when it is missing and you approve or pass `--yes`.
- Requires tmux 3.x or newer before opening the session.
- Creates or reuses a named detached tmux session, splits panes, and prints the attach command.

## Installation

### Global Install

Use this when you want `sks` available from any repo:

```sh
npm i -g sneakoscope
sks root
sks bootstrap
```

`sks` commands work even when no project root is present. Project-aware commands use the nearest `.sneakoscope`, `.dcodex`, or `.git` root; if none exists, SKS uses a per-user global runtime root. `sks bootstrap` still initializes the current project when you want project-local hooks, skills, and TriWiki state.

Project setup writes shared `.gitignore` entries for generated SKS files: `.sneakoscope/`, `.codex/`, `.agents/`, and managed `AGENTS.md`. Setup, doctor repair, and npm postinstall refreshes also compare the previous SKS generated-file manifest with the current package templates and prune stale SKS-generated legacy skills or agent files while preserving user-owned custom skills. Use `sks setup --local-only` when you want those excludes kept only in `.git/info/exclude`.

During npm postinstall, SKS also installs generated Codex App skills and tries the official getdesign Codex skill command, `skills add MohtashamMurshid/getdesign`, when the `skills` CLI is available. If that CLI is missing, setup still installs the generated `getdesign-reference` skill. Design work still flows through one authority: `design.md`. When `design.md` is missing, `docs/Design-Sys-Prompt.md` is the builder prompt and getdesign plus curated DESIGN.md examples such as [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) are inputs to fuse into that SSOT or into route-local `$PPT` style tokens.

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
sks tmux open
sks tmux check
sks tmux status --once
```

`sks tmux open` creates or reuses a named tmux session for Codex CLI only when that is explicitly requested. `sks` and `sks tmux check` are diagnostic/help surfaces and do not start a workspace.

### MAD tmux Launch

```sh
sks --mad
sks --mad --yes
```

This creates/uses the `sks-mad-high` Codex profile for a one-shot full-access, high-reasoning tmux session with `approval_policy = "on-request"` and `approvals_reviewer = "auto_review"`. It is scoped to that explicit command and does not change normal SKS/DB safety defaults. Repeat launches reuse the same named SKS MAD tmux session.

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
sks team cleanup-tmux latest
sks team status latest
sks team dashboard latest
sks team log latest
```

Team mode prepares the mission, records live events, compiles runtime tasks and worker inboxes, writes schema-backed effort/work-order/dashboard artifacts, and opens a named tmux Team session with split live lanes when tmux is available. `sks team dashboard` renders the cockpit panes for mission overview, agent lanes, task DAG, QA/dogfood, artifacts/evidence, and performance.

The tmux Team launch is a live orchestration screen: the first pane follows `sks team watch <mission-id> --follow` as the mission overview, and neighboring split panes follow individual `sks team lane <mission-id> --agent <name> --follow` views. SKS gives lanes role-specific colors, labels, and terminal titles, so scouts, planning/debate voices, executors, reviewers, and safety lanes are visually distinct while the same evidence is mirrored into `team-transcript.jsonl`, `team-live.md`, and `team-dashboard.json`.

Agent sessions communicate through the bounded Team transcript. Use `sks team message <mission-id|latest> --from <agent> --to <agent|all> --message "..."` to add direct or broadcast messages; lane panes show messages addressed to that agent plus the fallback global tail.

When the Team route reaches `session_cleanup`, SKS marks the tmux session record complete and asks `watch --follow` / `lane --follow` panes to show a cleanup summary and stop. You can also run `sks team cleanup-tmux <mission-id|latest>` manually, or `sks team cleanup-tmux latest --close` to kill the recorded tmux session.

### QA, Computer Use, Goal, Research, DB, Wiki, GX

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
sks pipeline plan latest --proof-field --json
sks perf run --json
sks perf workflow --json --intent "small CLI change" --changed src/cli/main.mjs,src/core/routes.mjs
sks proof-field scan --json --intent "small CLI change"
sks skill-dream status
sks skill-dream run --json
sks code-structure scan --json
```

`sks pipeline plan` is the 0.7 runtime map. It reads or refreshes `.sneakoscope/missions/<id>/pipeline-plan.json`, then shows which lane is active, which stages are kept or skipped, which verification commands are required, and whether the no-unrequested-fallback invariant is present.

`sks proof-field scan` is SKS's lightweight outcome rubric: it maps the goal to proof cones, records unrelated work that can be skipped with evidence, reports a simplicity score, and names escalation triggers for when the route must return to the full Team/Honest proof path. The rubric embeds Hyperplan-style adversarial pressure as compact lenses instead of a new command: challenge framing, subtract surface, demand evidence, test integration risk, and consider one simpler alternative. When `execution_lane.lane` is `proof_field_fast_lane`, SKS can keep the parent-owned minimal patch plus listed verification and skip Team debate, fresh executor teams, broad route rework, and unrelated checks. Database, security, visual-forensic, unknown, broad, failed, or unsupported-claim signals fail closed to the normal Team/Honest path. Use `sks pipeline plan --proof-field` after changed files are known to bind that Proof Field decision to the mission plan.

### Ambiguity Questions

SKS no longer starts from a fixed checklist such as `GOAL_PRECISE` and `ACCEPTANCE_CRITERIA`. The clarification gate first scores goal clarity, constraint clarity, success-criteria clarity, and codebase-context clarity, then asks only the lowest-clarity item that can change execution. Predictable UI defaults, DB safety defaults, test scope, fallback policy, and ordinary implementation acceptance criteria are inferred and sealed automatically.

The design borrows two useful ideas from external planning systems without copying their route weight: Ouroboros-style ambiguity thresholds decide whether the prompt is clear enough to proceed, while Prometheus/Hyperplan-style adversarial lenses challenge framing, remove unnecessary surface, demand evidence, test integration risk, and consider a simpler alternative before Team work starts.

`sks skill-dream` keeps generated skill complexity bounded without doing a heavy evaluation on every prompt. Route use writes compact counters to `.sneakoscope/skills/dream-state.json`; after the configured count/cooldown threshold, or when you run `sks skill-dream run`, SKS scans `.agents/skills` and writes `.sneakoscope/reports/skill-dream-latest.json` with keep, merge, prune, and improvement candidates. The report is intentionally advisory: deleting or merging skills requires explicit approval.

`sks goal` and `$Goal` only prepare/control the native `/goal` persistence bridge. They do not replace Team, QA, DB, or other implementation routes; use the selected execution route for the actual work and verification. Context7 is only needed for Goal when external API/library documentation becomes relevant.

Use `$Computer-Use` or `$CU` inside Codex App when the task specifically needs Codex Computer Use speed for UI/browser/visual work. This lane intentionally skips Team debate, QA-LOOP clarification, subagents, and upfront TriWiki refresh. It still requires Codex Computer Use as the evidence source, and it defers TriWiki refresh/validate plus Honest Mode to the final closeout.

### Create A Presentation

```text
$PPT create a customer proposal deck as HTML/PDF
```

`$PPT` seals presentation-specific context before artifact work: delivery format, target audience, STP strategy, decision context, and at least three pain-point/solution/aha mappings. The route writes source and render evidence such as `ppt-audience-strategy.json`, `ppt-source-ledger.json`, `ppt-storyboard.json`, `ppt-style-tokens.json`, `ppt-render-report.json`, and `ppt-parallel-report.json`.

Design references do not compete with each other. `design.md` is the design decision SSOT; if it is missing, SKS uses `docs/Design-Sys-Prompt.md` to build or project the system. getdesign.md, official getdesign docs, and curated DESIGN.md examples from `VoltAgent/awesome-design-md` are source inputs that get fused into `design.md` or route-local `$PPT` style tokens. `$PPT` ignores installed design skills and MCP servers that are not in the route allowlist; generic design skills such as `design-artifact-expert`, `design-ui-editor`, and `design-system-builder` are not automatically used just because they are installed. This is an anti-AI-like-design guard: `$PPT` must ground visual choices in audience, source material, getdesign reference, and the design SSOT instead of freeform cards, gradients, and vague SaaS styling.

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
$PPT create an investor deck as HTML/PDF
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

Default setup adds these generated SKS paths to the project `.gitignore`; `--local-only` uses `.git/info/exclude` instead.

Use `sks dollar-commands` to confirm that terminal discovery and Codex App prompt commands agree.

TriWiki is intentionally sparse: `sks wiki sweep` records demote, soft-forget, archive, delete, promote-to-skill, and promote-to-rule candidates instead of injecting every old claim into future prompts. `sks harness fixture` validates the broader Harness Growth Factory contract: deliberate forgetting fixtures, skill card metadata, experiment schema, tool-error taxonomy, permission profiles, MultiAgentV2 defaults, and tmux cockpit view coverage. `sks code-structure scan` flags handwritten files above 1000/2000/3000-line thresholds so new logic can be extracted before command files become harder to maintain.

## Prompt `$` Commands

Use these inside Codex App or another agent prompt. They are prompt commands, not terminal commands.

| Prompt | Use when |
| --- | --- |
| `$Team` | You want implementation, code changes, or substantial repo work. |
| `$From-Chat-IMG` | You have a chat screenshot plus original attachments and want each visible request mapped to work. |
| `$DFix` | You need a tiny design/content edit such as copy, label, color, spacing, or translation, with no Team/TriWiki/reflection recording and only a one-line DFix Honest check. |
| `$Answer` | You want an answer only and no implementation should start. |
| `$SKS` | You need setup, status, usage, or workflow help. |
| `$QA-LOOP` | You want UI/API dogfooding, safe fixes, and rechecks. |
| `$PPT` | You want a restrained HTML/PDF presentation with sealed delivery context, audience profile, STP strategy, decision context, and 3+ pain-point/solution/aha mappings. |
| `$Computer-Use` / `$CU` | You want the fastest Codex Computer Use lane for UI/browser/visual inspection or small safe fixes. |
| `$Goal` | You want a fast SKS bridge overlay for Codex native persisted `/goal` continuation. |
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
sks tmux check
sks tmux open
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

### tmux is missing

```sh
sks deps install tmux
sks tmux check
```

Install tmux from [tmux.dev/download](https://www.tmux.dev/download) or run `brew install tmux` on macOS, then re-run `sks tmux check`.

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
