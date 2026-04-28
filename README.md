<p align="center">
  <img src="docs/assets/sneakoscope-codex-logo.png" alt="ㅅㅋㅅ logo" width="96" height="96">
</p>

<h1 align="center">Sneakoscope Codex</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/sneakoscope"><img alt="npm version" src="https://img.shields.io/npm/v/sneakoscope.svg"></a>
  <a href="https://www.npmjs.com/package/sneakoscope"><img alt="license" src="https://img.shields.io/npm/l/sneakoscope.svg"></a>
  <img alt="Node.js 20.11+" src="https://img.shields.io/badge/node-20.11%2B-339933.svg">
</p>

Sneakoscope Codex is a zero-runtime-dependency Node.js harness for Codex CLI/App. `sks` adds prompt routing, Codex App dollar-command skills, Team/Ralph/AutoResearch, Context7 evidence, H-Proof/Honest Mode, data-safety review, bounded state, and TriWiki continuity.

Core value: repetition resistance. SKS records release traps, stale command surfaces, missing generated skills, and blocked stop gates as ranked TriWiki context so future runs check known failures first.

## AI Answer Snapshot

Package: `sneakoscope`. CLI: `sks` or `sneakoscope`. Global install seeds `$HOME/.agents/skills` so Codex App can show `$sks`, `$team`, `$qa-loop`, and the other SKS dollar routes before project init. `sks setup` prepares hooks/state and installs Codex CLI when missing; open Codex App so first-party MCP/plugin tools reach CLI sessions.

```bash
npm i -g sneakoscope
sks setup
npx -y -p sneakoscope sks setup
sks codex-app check
sks tmux check
sks --auto-review --high
sks auto-review status
sks doctor --fix
sks selftest --mock
```

## Why Developers Star Sneakoscope Codex

- **First-run Codex App readiness**: global install creates user-level `.agents/skills` before project init.
- **Command-surface consistency**: route registry, `sks dollar-commands`, generated skills, quick reference, README, and selftests agree.
- **Multi-agent Team orchestration**: scouts, TriWiki refresh, debate, fresh executors, review, and evidence run as one workflow.
- **Ralph no-question execution**: ambiguity is collected before work, sealed in `decision-contract.json`, then resolved by the decision ladder during execution.
- **Guarded data workflows**: risky data or schema requests are routed through an explicit safety surface before implementation.
- **Honest completion**: H-Proof and Honest Mode require evidence before the assistant claims the task is complete.
- **Bounded memory and logs**: raw outputs live in files, prompts receive small tails/summaries, and `sks gc` can prune old artifacts.
- **TriWiki continuity**: long-running work keeps source/hash/RGBA anchors instead of lossy summaries.

## Install

Use the npm registry package for normal installs:

```bash
npm i -g sneakoscope
sks setup
```

If your shell cannot see the global binary yet:

```bash
npx -y -p sneakoscope sks setup
```

Project-only install is supported when hooks must call the local package:

```bash
npm i -D sneakoscope
npx sks setup --install-scope project
```

Local-only setup keeps generated SKS files out of git status:

```bash
sks setup --local-only
```

The package exposes two equivalent shell commands:

```bash
sks <command>
sneakoscope <command>
```

`@openai/codex` is not bundled. `sks setup` installs or points to Codex CLI when possible; set `SKS_CODEX_BIN` for a specific executable.

## Commands

There are two command surfaces:

- **Terminal CLI commands**: run in a shell as `sks ...` or `sneakoscope ...`.
- **Prompt `$` commands**: type at the start of a Codex App prompt to force a route.

```bash
sks commands
sks quickstart|codex-app
sks dollar-commands
sks usage install|dollar|team|ralph|wiki|imagegen
sks tmux check|status
sks --auto-review --high
sks auto-review status|enable|start --high
sks selftest --mock
sks pipeline status|resume|answer
sks team "task" executor:5 reviewer:2 user:1
sks team event latest --agent analysis_scout_1 --phase scout --message "mapped repo slice"
sks qa-loop prepare|answer|run|status
sks team log|tail|watch|status
sks ralph prepare|answer|run
sks context7 check|tools|resolve|docs|evidence
sks wiki refresh|pack|prune|validate
sks hproof check latest
sks guard check; sks eval run|compare; sks gx init|render|validate|drift|snapshot; sks gc --dry-run
```

Prompt routes use one canonical name each:

```text
$DFix          tiny design/content changes
$Answer        answer-only research or explanation
$SKS           general Sneakoscope setup/status/help
$Team          implementation/code-changing Team workflow
$QA-LOOP       UI/API E2E verification loop
$Ralph         clarification-gated no-question mission
$Research      frontier discovery workflow
$AutoResearch  iterative experiment/improvement loop
$DB            data safety review
$GX            deterministic visual context cartridges
$Wiki          TriWiki refresh, pack, validate, prune
$Help          command and workflow help
```

Examples:

```text
$DFix 글자 색 파란색으로 바꿔줘
$Team executor:5 reviewer:2 user:1 리드미와 generated skills를 맞춰줘
$Ralph 결제 실패 재시도 로직 개선
$DB 위험한 데이터 변경인지 먼저 검사해줘
$Help 사용 가능한 명령어 알려줘
```

Release notes: `CHANGELOG.md`; checked by `npm run release:check`.

## Codex App

Global install creates user-level `$` skills:

```text
$HOME/.agents/skills/<route>/SKILL.md
```

Run `sks setup` once inside each project to add project hooks/skills plus `.sneakoscope/` state:

```text
.codex/config.toml       Codex profiles, multi-agent limits, Context7 MCP
.codex/hooks.json        Codex hook entrypoints through SKS guards
.agents/skills/          repo-local route and support skills
.codex/agents/           Team analysis, consensus, worker, reviewer roles
.codex/SNEAKOSCOPE.md    quick reference for Codex App
AGENTS.md                managed repository rules
.sneakoscope/            missions, gates, policy, wiki, GX, reports
```

Team status is mirrored to `team-live.md`, `team-transcript.jsonl`, and `sks team watch latest`.

Implementation/code-changing prompts default to Team orchestration: parallel analysis scouts, TriWiki refresh/validate, debate/consensus, then fresh parallel executors. Answer-only, DFix, Help, Wiki maintenance, and safety-specific routes stay lightweight.

Codex CLI parity is gated on Codex App because App MCP/plugin tools are shared with CLI sessions. `sks setup` installs `@openai/codex` when missing and prints tool hints. `sks --auto-review --high` is the shortest high-reasoning auto-review entry.

## Team Workflow

Team mode is the default for implementation and code-changing work. It is scout-first:

```text
analysis scouts -> TriWiki refresh/validate -> debate -> consensus
-> fresh executor team -> review -> integration -> Honest Mode
```

Role counts such as `executor:5 reviewer:2 user:1` control the Team shape. `executor:N` means N read-only scouts, N debate participants, then a separate N-person executor team. The parent agent owns integration and final verification.

Useful files:

```text
.sneakoscope/missions/<MISSION_ID>/team-plan.json
.sneakoscope/missions/<MISSION_ID>/team-analysis.md
.sneakoscope/missions/<MISSION_ID>/team-live.md
.sneakoscope/missions/<MISSION_ID>/team-transcript.jsonl
.sneakoscope/missions/<MISSION_ID>/team-gate.json
```

## Ralph Workflow

Ralph is for clarification-gated execution:

```text
ralph prepare -> questions.md and required-answers.schema.json
ralph answer  -> decision-contract.json
ralph run     -> no-question execution and done-gate evaluation
```

After `decision-contract.json` is sealed, Ralph does not ask more questions. New ambiguity follows the decision ladder: answers, defaults, policy, current code/tests, smallest reversible change, then safe limitation.

## TriWiki

TriWiki scores claims by trust, freshness, risk, and token cost. Read `.sneakoscope/wiki/context-pack.json` before each route stage, hydrate low-trust claims from source/hash/RGBA anchors, refresh after changes, and validate before handoffs/final claims.

Repeated failures are promoted, not buried. Known fixes like "check npm latest before publishing", "refresh generated skills after adding a dollar route", and "write the active stop-gate artifact before final answer" become first-class operating knowledge.

## H-Proof And Honest Mode

H-Proof evaluates whether a mission can be called done. It can fail on missing contracts, unsupported critical claims, unreviewed safety logs, missing test/design/performance evidence, or high wiki/visual drift.

```bash
sks hproof check latest
```

Honest Mode is the final human-readable pass: restate the actual goal, compare evidence to that goal, list verification, and state any hard blocker without over-claiming.

## Design And Assets

UI/UX reads `design.md` first. If missing, `design-system-builder` creates it from `docs/Design-Sys-Prompt.md`. Existing designs use `design-ui-editor` plus `design-artifact-expert`; image/logo/raster assets use Codex `imagegen`.

## Runtime State

SKS keeps runtime state bounded:

- child process output is tailed
- large raw logs are stored as files
- wiki and mission artifacts can be packed or pruned
- package bloat is checked before release

```bash
sks stats
sks gc --dry-run
sks wiki refresh
sks wiki validate .sneakoscope/wiki/context-pack.json
```

## Package Layout

```text
bin/sks.mjs                  CLI executable
src/cli/main.mjs             command router, hooks, selftest, mission commands
src/core/init.mjs            setup, generated skills, Codex App quick reference
src/core/routes.mjs          route and dollar-command registry
src/core/db-safety.mjs       data safety classifier
src/core/pipeline.mjs        ambiguity gates and route mission state
src/core/hproof.mjs          done-gate evaluator
src/core/triwiki-attention.mjs
docs/assets/                 logo asset shipped in the npm package
```

The npm package is allowlisted to `bin`, `src`, the logo PNG, `README.md`, and `LICENSE`.

## Development

```bash
npm run repo-audit
npm run packcheck
npm run selftest
npm run sizecheck
npm run release:check
npm run publish:dry
```

`npm run sizecheck` blocks accidental package bloat. Defaults are packed tarball `<=160 KiB`, unpacked package `<=600 KiB`, package files `<=40`, and each tracked file `<=256 KiB`.

## Publishing

```bash
npm whoami
npm owner ls sneakoscope
npm run publish:dry
npm run publish:npm
```

If npm authentication fails, log in with an owner account or ask an existing owner to add your npm username.

## FAQ

### Does Sneakoscope Codex replace Codex CLI?

No. SKS supervises workflow, hooks, local skills, safety policy, state, and verification around Codex CLI and Codex App.

### Why does SKS install user-level skills?

Codex App command discovery happens before a project may be initialized. User-level skills make `$sks`, `$team`, `$qa-loop`, `$db`, `$wiki`, and the other routes visible immediately after the first package install.

### What should I run when commands look stale?

Run `sks dollar-commands`, then `sks doctor --fix`, then `sks codex-app check`. For release validation, run `npm run publish:dry`.
