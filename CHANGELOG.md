# Changelog

All user-facing Sneakoscope Codex changes are tracked here. Copy the relevant version section into the matching GitHub Release notes when tagging or publishing.

## [Unreleased]

- Keep upcoming changes here until they are assigned to a package version.

## [0.6.41] - 2026-04-28

### Fixed

- Preserve custom Codex App skills during `sks doctor --fix` repair instead of clearing the whole `.agents/skills` tree.

## [0.6.40] - 2026-04-28

### Fixed

- Preserve user-owned non-generated Codex App skill aliases during upgrade/repair while still removing obsolete SKS-generated aliases.
- Add selftest coverage for custom skill preservation during generated alias cleanup.

## [0.6.39] - 2026-04-28

### Fixed

- Restore the README from the overly short quick-summary form into a fuller install, command, Codex App, Team, Ralph, TriWiki, H-Proof, development, and publishing guide while keeping the new logo and first-install dollar-command guidance.
- Compress generated skill template text so the expanded README still passes the npm package size gate.

## [0.6.38] - 2026-04-28

### Fixed

- Seed SKS Codex App dollar-command skills into `$HOME/.agents/skills` during package install so first-time global users can invoke `$sks`, `$team`, `$qa-loop`, and the rest of the SKS routes before a project is initialized.
- Strengthen `sks codex-app check` and `sks doctor` to report both project-local and global dollar-command skill readiness.
- Replace the README text mark with a modern minimal `ㅅㅋㅅ` logo asset.

## [0.6.37] - 2026-04-28

### Added

- Added the Korean `ㅅㅋㅅ` brand surface across the README, package metadata, and CLI headings.
- Added terminal-first setup guidance for `sks --auto-review --high`, `npx -y -p sneakoscope sks setup`, and Team live event logging.
- Added install-time Codex CLI readiness handling so `sks setup` can install `@openai/codex` when the `codex` command is missing.
- Added design-system, UI-editor, and imagegen skills for `design.md`-first UI/UX work and Codex imagegen assets.
- Added Team-default routing for implementation/code-changing prompts so SKS normally enters parallel scout/debate/executor orchestration.

### Fixed

- Fixed Korean implementation prompts such as `알려줘야지` and `해줘야지` being misrouted to the answer-only path instead of the execution pipeline.
- Fixed Team route continuation after the ambiguity gate so `pipeline answer` materializes Team plan/live/gate artifacts and advances to parallel analysis scouting.
- Fixed Context7 readiness reporting so a broken global Codex config no longer passes solely because config text exists.

### Internal

- Added changelog/release-note policy checks so publish readiness fails when the current package version is missing from `CHANGELOG.md`.
- Added Honest Mode loop-back behavior so unresolved gaps discovered at final review return the active route to the post-ambiguity execution phase.
- Fixed Honest Mode no-gap lines such as `남은 gap: 없음` so release-file mentions do not create a false loop-back.
