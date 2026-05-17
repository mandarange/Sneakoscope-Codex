# Changelog

## [Unreleased]

## [0.9.15] - 2026-05-18

### Fixed
- Fix `sks postinstall` auto-bootstrap by passing the callable bootstrap command instead of a boolean flag, preventing `TypeError: bootstrap is not a function` during `npm i -g sneakoscope@latest`.
- Add a focused postinstall regression test that forces auto-bootstrap in a temporary HOME/global root.

## [0.9.14] - 2026-05-17

### Added
- Add a legacy-free command architecture with no command registry fallback to `legacy-main.mjs`.
- Add automatic route completion proof writers for every serious route finalization path.
- Add automatic image voxel anchor/relation generation for all visual and Computer Use routes.
- Add full executable feature fixtures with expected artifact existence and schema validation.
- Add semantic Rust voxel validation parity with the JavaScript image voxel validator.
- Add strict hook replay matching for decision, reason, gate, and issue expectations.
- Add active project-root codex-lb circuit recording and proof evidence integration.
- Add `$Commit` and `$Commit-And-Push` simple git routes for commit-only and commit-then-push workflows without the full SKS pipeline.

### Fixed
- Remove indirect maintenance/legacy imports from split commands.
- Remove reliance on manual `sks proof repair latest` for normal route completion.
- Block visual completion when anchors or before/after relations are missing.
- Ensure codex-lb launch health reports are written to the active project root.
- Ensure fixture pass status means executed or schema-validated evidence, not registry-only metadata.

### Changed
- Treat Completion Proof and Image Voxel TriWiki as mandatory completion contracts, not optional reports.
- Promote executable fixtures and route proof adapters to the central release gate.
- Make the legacy-free command graph the only supported 0.9.14 command path.




## [0.9.13] - 2026-05-17

### Added
- Add route-bound Completion Proof adapters for all serious SKS routes.
- Add image voxel anchor automation for Computer Use, Image UX Review, PPT, GX, and From-Chat-IMG routes.
- Add executable feature fixtures for core route families and reduce `not_required` fixture coverage.
- Add real hook runtime replay fixtures and expected-decision validation.
- Add codex-lb circuit integration with launch health failures and recovery state.
- Add Rust `image-hash` and `voxel-validate` accelerator commands with JS fallback parity tests.

### Fixed
- Connect serious route gates to completion-proof presence and validation.
- Connect visual/UI route gates to image voxel anchors and before/after evidence where required.
- Fix Rust wrapper/binary command mismatch.
- Correct codex-lb README behavior around stateless `previous_response_not_found` and hard failure fallback.
- Reduce legacy CLI fallback for high-value commands.

### Changed
- Promote executable feature fixtures from registry metadata into release-gated mock validation.
- Treat image voxel anchors and completion proof as first-class serious-route completion requirements.





## [0.9.12] - 2026-05-17

### Added

- Add lazy command architecture foundations for lighter SKS startup, including a slim CLI entrypoint, command registry, and lazy legacy fallback.
- Add a unified Completion Proof Engine surface with latest proof JSON/Markdown, command/file ledgers, validation, and secret redaction.
- Add image-first Voxel TriWiki ledger foundations with SHA-256 image ingest, dimension capture, bbox/anchor validation, and proof summaries.
- Add route fixture coverage contracts for core SKS feature families through the feature registry and all-features selftest.
- Add cold-start performance measurement and release-gated CLI entrypoint checks.
- Add prompt-language response guidance so Korean requests produce Korean progress/final/Honest Mode text and English requests produce English text while preserving code and commands.

### Fixed

- Reduce heavy top-level CLI imports for lightweight commands such as `sks --version`, `sks help`, `sks root --json`, and `sks commands --json`.
- Strengthen Codex App / codex-lb / hook evidence handling with hook trust reports, replay fixture support, circuit metrics, and unified `[redacted]` secret policy.
- Make feature-registry checks distinguish coverage from executable/static fixture contracts.
- Stabilize the release cold-start performance gate by measuring 20 samples by default and retrying budget-only misses once before failing publish.

### Changed

- Promote proof and Voxel TriWiki evidence to first-class release-gated contracts.
- Package the Rust accelerator source in the npm package while keeping JS fallback behavior when no compiled `sks-rs` binary is available.



## [0.9.11] - 2026-05-17

### Fixed

- Repair stale `sks`/`sneakoscope` PATH shims during `npm i -g sneakoscope@latest` when another npm prefix still shadows the newly installed package, so `sks --version` reflects the upgraded release without manual PATH cleanup.
- Raise the npm unpacked-size budget to 1871 KiB for the upgrade-time shim repair code while preserving packed-size, file-count, tracked-file, and forbidden-file guards.

## [0.9.10] - 2026-05-17

### Fixed

- Repair stale Codex App desktop app-server processes during npm upgrades so reconnect loops recover without manual cleanup.

## [0.9.9] - 2026-05-17

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Preserve or restore ChatGPT OAuth in `~/.codex/auth.json` for Codex App when codex-lb uses `requires_openai_auth = true`; the codex-lb proxy key now stays in `CODEX_LB_API_KEY`/`env_key` by default instead of clobbering App auth.
- `sks codex-lb status` now reports the local Codex App auth shape and gives the right recovery path for the App refresh-token error: `sks codex-lb repair` keeps codex-lb selected, while `release` is reserved for switching fully away from codex-lb.
- Cache the codex-lb response-chain health probe briefly so repeated bare `sks` launches do not keep paying the same preflight/network cost.
- Raise the npm unpacked-size budget to 1864 KiB for the feature registry and codex-lb auth recovery code while keeping tracked-file, packed-size, file-count, and forbidden-file guards enforced.

## [0.9.8] - 2026-05-17

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.9.7] - 2026-05-17

### Fixed

- **codex 0.130.0 auth compatibility**: codex CLI changed `auth.json` apikey field from `"key"` to `"OPENAI_API_KEY"`. The `reconcileCodexLbAuthConflict` writer now produces the new format. Reading still supports both old and new formats for backward compat.
- **`[exited]` on launch**: the tmux codex session exited immediately because codex 0.130.0 couldn't find the API key in the old auth.json format. Fixed by the auth format migration above.

### Improved

- `sks codex-lb setup` now supports interactive prompts when `--host`/`--api-key` are omitted: asks for domain and API key step by step, making first-time setup easier.
- On `npm i -g sneakoscope` upgrade, if codex-lb is already configured, prompts "codex-lb key changed? [y/N]" so users can update their key without needing to remember the setup command. Default is N (no change). Skip with `SKS_SKIP_CODEX_LB_KEY_PROMPT=1`.
- Auto-migrates legacy `auth.json` from old `"key"` field to new `"OPENAI_API_KEY"` format during postinstall and doctor --fix. Never wipes user keys or settings.

## [0.9.6] - 2026-05-17

### Fixed

- Selftest hermeticity: `npm publish` -> `prepublishOnly` -> `release:check` -> `selftest` was leaking the codex-lb provider-restore prompt and the new chain-failure prompt to the publisher's interactive terminal. The selftest now forces `process.env.CI = 'true'` at entry so every in-process `canAskYesNo()` falls through to the non-interactive default. Subprocess invocations already pass `--json`; their behavior is unchanged.
- Raise npm packed-tarball size budget from 456 KiB to 460 KiB to accommodate the new chain-failure prompt branches and selftest coverage.
- Republishes the 0.9.5 codex-lb launch-flow fix (which never reached npm because the publish failed at sizecheck): `previous_response_not_found` no longer silently bypasses codex-lb, hard chain failures prompt instead of swap silently, `SKS_CODEX_LB_AUTOBYPASS=1` opts back into silent bypass for automation.

## [0.9.5] - 2026-05-17

### Fixed

- `sks` (bare launch) no longer silently demotes a fully configured codex-lb to ChatGPT OAuth when `checkCodexLbResponseChain` reports `previous_response_not_found`. That failure mode is normal for stateless LB deployments that don't persist Responses across requests, so codex-lb stays active and the launch only logs a warning.
- For hard chain failures (auth rejected, timeout, 5xx, missing base URL), the launch now asks before bypassing: `Use codex-lb anyway, or fall back to ChatGPT OAuth? [LB/oauth]`. Default keeps codex-lb. In non-interactive contexts (CI, pipes, no TTY) the default is also "keep codex-lb" — set `SKS_CODEX_LB_AUTOBYPASS=1` to restore the previous silent-bypass behavior.
- Selftest: replace the assertion that codified the old "always bypass on `previous_response_not_found`" behavior with one that verifies codex-lb stays active. Added coverage for hard 5xx chain failures (default keep) and `SKS_CODEX_LB_AUTOBYPASS=1` (silent bypass restored).
- Note: 0.9.5 was not published to npm — sizecheck tripped at 456.1 KiB. See 0.9.6 for the actual ship of these changes plus the selftest hermeticity fix.

## [0.9.4] - 2026-05-17

### Added

- `sks codex-lb release` — reverses the 0.9.3 auto-reconcile: restores `~/.codex/auth.chatgpt-backup.json` back to `~/.codex/auth.json` and, by default, removes `model_provider = "codex-lb"` from the top-level Codex App config so the app falls back to ChatGPT OAuth. Re-engage codex-lb later with `sks codex-lb repair`.
  - `--keep-provider` — restore `auth.json` only; leave `model_provider = "codex-lb"` selected.
  - `--delete-backup` — remove `~/.codex/auth.chatgpt-backup.json` after a successful restore (default: keep it so a subsequent re-reconcile still has a source backup).
  - `--force` — restore even when the current `auth.json` does not look like the codex-lb apikey shape (e.g. user hand-edited it after reconcile).
  - `--json` — machine-readable result with `status` ∈ {`released`, `no_backup`, `already_chatgpt`, `auth_in_use`, `failed`} plus `auth_path`, `backup_path`, `provider_unselected`, `backup_removed`.
- `sks codex-lb unselect` — flips `model_provider` away from `codex-lb` in the top-level Codex App config without touching `auth.json` or the stored env file. Useful when switching to a different provider temporarily while keeping codex-lb config and `sks-codex-lb.env` intact for later.
- `sks codex-lb status` now reports whether `~/.codex/auth.chatgpt-backup.json` is present and surfaces a "Run `sks codex-lb release`" hint when applicable. The JSON variant adds `chatgpt_backup_present` and `chatgpt_backup_path`.
- Raise npm packed-tarball size budget from 452 KiB to 456 KiB to accommodate the new release/unselect surface plus selftest coverage.

## [0.9.3] - 2026-05-17

### Fixed

- Auto-reconcile codex-lb authentication during `npm i -g sneakoscope@latest`: when both a codex-lb provider with `env_key` auth and a ChatGPT OAuth token blob live in `~/.codex/auth.json`, the OAuth blob is backed up to `~/.codex/auth.chatgpt-backup.json` and `auth.json` is rewritten to apikey mode using the stored `CODEX_LB_API_KEY` so Codex CLI/App stops sending the OAuth bearer to the load balancer. Opt out with `SKS_CODEX_LB_NO_AUTH_RECONCILE=1` (the backup is still produced so nothing is lost).
- Broaden the postinstall codex-lb config/auth snapshot so the snapshot is taken whenever any codex-lb signal (`sks-codex-lb.env`, `[model_providers.codex-lb]` block, or pre-existing `auth.json`) is present, and restore a pre-existing `auth.json` if a bootstrap step emptied or removed it during the upgrade.
- Surface auto-reconciliation, backup-only, and reconciliation failures in postinstall log lines and in the `sks auth repair` / `sks codex-lb repair` JSON output via a new `auth_reconcile` field, so upgrades self-heal the most common codex-lb auth regressions without requiring a manual `sks codex-lb setup` rerun.
- Make the fake-codex login helper used by `sks selftest --mock` portable across `bash` and `dash` so the codex-lb selftest writes valid JSON regardless of the host shell's `printf` escape handling.
- Raise the npm unpacked size budget to 1856 KiB to accommodate the codex-lb auth auto-reconciliation logic and its self-test, while keeping packed size, file count, forbidden-file, and tracked-file guards enforced.

## [0.9.2] - 2026-05-16

### Fixed

- Treat Codex App Git Actions metadata for Commit, Push, Commit and Push, and PR flows as lightweight app git actions so SKS route/finalization hooks no longer block the built-in app commit/push UI.
- Report Codex App git action readiness in `sks codex-app check`, including `codex_git_commit`, hooks, `remote_control`, and Codex CLI remote-control support, so `sks doctor --fix` and upgrade checks surface the exact blocker.
- Keep `$Image-UX-Review` and `$UX-Review` tied to real Codex App `$imagegen`/`gpt-image-2` evidence, and add regression coverage that disabled `image_generation` blocks imagegen-dependent pipelines instead of passing silently.
- Raise the npm release size budget to 452 KiB packed and 1792 KiB unpacked for the Codex App git-action and imagegen readiness checks while keeping file count, forbidden-file, and tracked-file guards enforced.
- Keep release metadata aligned after the explicit SKS version bump to `0.9.2`.

## [0.9.1] - 2026-05-16

### Fixed

- Align codex-lb setup/repair with the upstream `Soju06/codex-lb` provider shape, including the OpenAI-authenticated provider block and websocket/base-url metadata.
- Restore missing Codex App `model_provider = "codex-lb"` settings from stored codex-lb environment during bare `sks` launches and project init/config merging.
- Tighten Codex App plugin readiness checks so missing default plugin sources and generated reserved-name skill shadows are reported with actionable guidance.
- Keep release metadata aligned after the explicit SKS version bump to `0.9.1`.

## [0.9.0] - 2026-05-15

### Added

- Document the report-only Decision Lattice planner for 0.9.0, using A* over proof-debt signals to explain route and verification path selection without claiming speedups before replay or scored eval evidence exists.
- Describe the Decision Lattice integration with proof-field and `sks pipeline plan` surfaces, including frontier, selected path, and rejected path evidence for reviewer audit.
- Raise the unpacked package size gate to 1776 KiB for the new Decision Lattice planner module while keeping packed size and file-count budgets unchanged.
- Strengthen the release registry gate so `--require-unpublished` checks the exact package version, not only whether the candidate is newer than the latest dist-tag.


## [0.8.6] - 2026-05-15

### Fixed

- Automatically restore existing codex-lb API-key auth during npm postinstall upgrades that reach the repair phase and during `sks doctor --fix`, including legacy installs where the key only remains in Codex `auth.json` and a codex-lb provider or env base URL is already recoverable.
- Keep the release size gate publishable after the codex-lb auth restore path by deduplicating its selftest setup and raising the unpacked-size budget to 1744 KiB.
- Restore `model_provider = "codex-lb"` as the top-level Codex App provider during codex-lb setup, repair, postinstall upgrade repair, and project config merging so upgraded apps actually route through codex-lb.
- Make `$PPT` load the `imagegen` skill as part of its required route allowlist and stamp required PPT image assets/review ledgers with Codex App `$imagegen`/`gpt-image-2` invocation instructions.


## [0.8.5] - 2026-05-15

### Fixed

- Keep codex-lb provider authentication from clobbering the shared Codex login cache, while syncing the stored `CODEX_LB_API_KEY` into the user launch environment for Codex App visibility.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.8.4] - 2026-05-15

### Fixed

- Surface Research scout agent names as explicit `agent_name` fields such as `Einstein Scout`, `Feynman Scout`, `Turing Scout`, `von Neumann Scout`, and `Skeptic Scout` throughout the plan, prompt, scout ledger, debate ledger, and selftest.
- Write Research paper manuscripts to a dated, topic-specific filename recorded in the plan, while keeping legacy `research-paper.md` compatibility for older missions.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [0.8.3] - 2026-05-15

### Fixed

- Preserve codex-lb as an explicit CLI launch provider without selecting it as the top-level Codex App provider, keeping native Codex App model, speed, and built-in feature UI visible.
- Keep release metadata aligned after the explicit SKS version bump to `0.8.3`.

## [0.8.2] - 2026-05-15

### Fixed

- Restore the `remote_control` Codex App feature flag during SKS setup/doctor repair and require it in `sks codex-app check`, so Codex mobile/remote-control UI entrypoints are not hidden while SKS still reports readiness.
- Keep installed OpenAI default plugins enabled during SKS setup/doctor repair, including Browser, Chrome, Computer Use, Documents, Presentations, Spreadsheets, and LaTeX, and fail `sks codex-app check` when an installed default plugin can be hidden from the composer/tool UI.
- Remove top-level `model_reasoning_effort` locks from Codex config during setup/doctor/codex-lb repair and report Fast UI config locks in `sks codex-app check`, so the Codex App model selector speed control remains visible.
- Raise the npm unpacked-size release budget to 1720 KiB for the Codex App readiness checks while keeping packed size, file count, forbidden-file, and tracked-file guards enforced.
- Keep release metadata aligned after the explicit SKS version bump to `0.8.2`.


## [0.8.1] - 2026-05-15

### Fixed

- Repair Codex App readiness and global repair so `sks doctor --fix` / reinstall restore official app feature flags for Computer Use, image generation, in-app browser, git commit/push, and Research xhigh profiles.
- Stop SKS route gates from blocking Codex App git commit/push and settings/profile UI events.
- Force `$Research` real runs through `gpt-5.5` Fast `xhigh` execution and report/repair missing Research profiles instead of silently running lower-effort paths.
- Change `$Research` from a fixed short loop into a no-code-mutation, evidence-layered genius-scout council that repeats until unanimous scout consensus or an explicit safety cap pauses the run.
- Gate Research completion on `consensus_iterations`, `unanimous_consensus`, and per-scout final agreements before the paper/report can pass.

## [0.8.0] - 2026-05-15

### Added

- Add the 0.8.0 Massive Upgrade report-only RecallPulse spine with TriWiki L1/L2/L3 cache decisions, neutral positive recall wording, durable `mission-status-ledger.json` status projection, duplicate suppression keys, `route-proof-capsule.json`, and `evidence-envelope.json`.
- Add `sks recallpulse run|status|eval|governance|checklist` so missions can write and inspect RecallPulse decisions without changing route behavior, including sequential child `$Goal` task checkpoints for `RECALLPULSE_0_8_0_TASKS.md`.
- Strengthen `$Research` scout personas with named Einstein Scout, Feynman Scout, Turing Scout, von Neumann Scout, and Skeptic Scout ledger fields while keeping them persona-inspired lenses, not impersonations.
- Gate Research scout ledgers on display names, persona boundaries, `reasoning_effort=xhigh`, `Eureka!` ideas, falsifiers, cheap probes, and debate participation evidence.
- Document the 0.8.0 Massive Upgrade while keeping performance claims benchmark-gated until scored RecallPulse evals prove them.
- Raise the npm package file-count release guard for the new RecallPulse core and CLI modules while keeping forbidden generated/runtime files excluded.



## [0.7.78] - 2026-05-14

### Fixed

- Stabilize the Team chat lane selftest used by `npm publish` by checking lane output semantically and including the rendered lane snapshot when the assertion fails.
- Raise the release size budgets to 448 KiB packed, 1700 KiB unpacked, and 384 KiB per tracked file so the current CLI entrypoint can pass publish checks while the larger split-review refactor remains explicit future work.
- Remove SKS support for installing `.git/hooks/pre-commit`; `sks versioning hook` is blocked, setup/doctor remove managed SKS version hooks, and release metadata stays explicit through `sks versioning bump`.

## [0.7.77] - 2026-05-14

### Fixed

- Recognize Codex App `Git Actions Commit` and `Commit and Push` hook payloads as app git actions, so SKS route gates do not block the built-in commit and commit-push flow.
- Keep ordinary user prompts that mention committing or pushing on the normal SKS route instead of treating them as app git actions.

## [0.7.76] - 2026-05-14

### Fixed

- Improve Team tmux live panes with Codex-style per-agent chat framing, lane identity, and color metadata.
- Close stale Team/codex-lb tmux panes before opening new managed views so old sessions do not linger.
- Detect codex-lb `previous_response_not_found` launch failures and bypass codex-lb for that launch instead of blocking SKS.

## [0.7.75] - 2026-05-14

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.74] - 2026-05-14

### Fixed

- Prevent copied Team `Live Chat` status logs from contaminating route classification with stale DB/security keywords.
- Make Team tmux lane panes self-close after follow loops end and fall back to recorded pane ids during cleanup.
- Render per-agent Team lanes as compact Codex-style chat blocks.

## [0.7.73] - 2026-05-14

### Fixed

- Suppress Codex under-development feature warnings whenever SKS enables `codex_git_commit`, including npm postinstall/global repair, project setup, `sks doctor --fix`, and codex-lb config repair paths.

## [0.7.72] - 2026-05-14

### Fixed

- Prepare the real Research run contract for npm release after the `0.7.71` validation pass.

## [0.7.71] - 2026-05-14

### Fixed

- Make normal `$Research` runs require the real Codex execution path instead of silently falling back to mock output; missing Codex now writes `research-blocker.json` and exits blocked.
- Give Research runs a two-hour default per-cycle timeout via `--cycle-timeout-minutes`, while keeping `--mock` explicitly limited to selftests and dry harness checks.
- Update generated Research skill guidance, route context, and README docs so Research is framed as long-running real source gathering, not a short summary loop.

## [0.7.70] - 2026-05-14

### Fixed

- Strengthen `$Research` with a route-local `research-source-skill.md`, layered source retrieval across scholarly, official, news, public-discourse, developer, and counterevidence sources, source-layer coverage and triangulation gate metrics, and optional Context7 only for package/API/framework documentation topics.
- Keep explicit `$Research` prompts on the Research route even when the command appears mid-sentence or as a markdown link, preventing stale Team missions from hijacking research-only work.
- Keep Research mission state marked `implementation_allowed=false`; the route may write research artifacts, but product/code implementation stays out of scope.
- Require `$Research` to finish with `genius-opinion-summary.md`, summarizing each genius-lens scout's final opinion, evidence, disagreement, changed mind, and council consensus.
- Raise the npm unpacked-size release budget to 1.6 MiB for the expanded Research route artifact contract while keeping packed size, file count, and tracked-file limits enforced.

## [0.7.69] - 2026-05-14

### Fixed

- Ship the `$Research` paper-manuscript gate so research runs require `research-paper.md` with paper-style sections before passing.

## [0.7.68] - 2026-05-13

### Fixed

- Route `$Research` through a source-backed xhigh genius scout council contract, requiring one literal `Eureka!` idea per scout, `debate-ledger.json`, `source-ledger.json`, `scout-ledger.json`, `falsification-ledger.json`, citation coverage, counterevidence, and stricter research gate metrics before a run can pass.
- Require `$Research` runs to turn the final result into `research-paper.md` with paper-style sections and references before the research gate can pass.
- Install accepted SKS updates with the exact registry-confirmed version instead of `sneakoscope@latest`, avoiding stale npm cache or propagation windows after a fresh publish.
- Make `sks doctor --fix` repair stored codex-lb config/auth drift, and store the codex-lb base URL beside the API key so future updates can restore provider routing.
- Raise the packed npm tarball budget to 400 KiB while keeping single-file, unpacked-size, and file-count release gates in place.
- Keep the 0.7.67 Codex App commit-message hook bypass, codex-lb postinstall preservation, Team tmux cleanup, and registry safety fixes available under a fresh patch version.

## [0.7.67] - 2026-05-13

### Fixed

- Add a release registry gate so npm version bumps fail before publish when registry config, lockfile registry sources, packed metadata, or npm dist-tag state is unsafe.
- Preserve codex-lb provider routing config through postinstall bootstrap/repair so stored API-key auth is not left without `model_provider = "codex-lb"`.
- Keep Team tmux Scout panes on the right side, close managed panes after work, and render per-Scout live chat transcripts instead of a shared log tail.
- Let Codex App commit message generation bypass SKS route finalization hooks while keeping ordinary user bug-fix prompts on the normal Team route.

## [0.7.66] - 2026-05-13

### Fixed

- Preserve global codex-lb provider and MCP server settings when SKS bootstraps project `.codex/config.toml`, so reinstall/setup does not hide stored auth or existing MCP connections.

## [0.7.65] - 2026-05-13

### Fixed

- Restore clarification and ambiguity gates as hard pauses, so SKS waits for explicit user answers instead of advancing to implementation or later pipeline stages.
- Block non-answer tools and permission requests while a clarification gate is waiting, allowing only `sks pipeline answer` or answers-file sealing commands through.
- Render Team tmux panes from lane-specific agent events instead of duplicating the global transcript tail.
- Close SKS-managed Team tmux panes when session cleanup is recorded, including from stored pane metadata outside the active tmux client.
- Clean up legacy Team tmux sessions and unrecorded Team lane panes by mission/session naming when older pane metadata is absent.
- Allow read-only live SQL inspection through DB safety without MAD-SKS while blocking writes and destructive SQL.

## [0.7.64] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

### Fixed

- Reconcile Team tmux lanes inside the current SKS-owned tmux session when available, while preserving the named `sks-team-*` view as a fallback and closing only SKS-managed agent panes during lifecycle cleanup.
- Clarify that Codex App readiness uses Codex-provided feature/MCP/status surfaces, while Codex Computer Use remains required for actual target UI/browser evidence.

## [0.7.63] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Migrate generated Codex configs and npm postinstall repair from deprecated `[features].codex_hooks = true` to `[features].hooks = true`.
- Preserve and re-enable required Codex App feature flags, including `codex_git_commit`, during config normalization and selftest.
- Add `sks team open-tmux` / `attach-tmux` so hook-created Team missions can reopen the split-pane tmux Scout view after mission creation.



## [0.7.62] - 2026-05-12

### Fixed

- Accept terminal sizes larger than the normalized tmux minimum in the dynamic resize selftest.
- Let Codex App Git Actions proceed with normal commit/push permission requests during no-question routes while still denying force-push style requests in that mode.
- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.61] - 2026-05-12

### Fixed

- Render the terminal SKS logo through `figlet` with plain ASCII output and show the active package version in CLI/tmux banners.
- Add the `solution-scout` pipeline hook/skill so problem-solving prompts search for similar fixes before local implementation decisions.
- Refit Team tmux split panes on attach and terminal resize with `window-size latest`, resize hooks, and tiled-layout recalculation for Warp-style resizing.
- Strengthen the Computer Use-only policy to forbid installing or using Playwright packages as UI/browser verification substitutes.
- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.60] - 2026-05-12

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.59] - 2026-05-12

- Align generated Codex config with current OpenAI Codex docs by emitting `[features].codex_hooks = true` and treating the older `hooks = true` key as legacy.
- Tune skill dreaming to the requested 10-route-event threshold while keeping the cooldown and recommendation-only safety model.

### Fixed

- Keep `sks --mad` as a single Codex tmux pane by default, leaving split panes for active Team scout/worker lanes.
- Make accepted SKS update prompts run only `npm i -g sneakoscope@latest`, without chaining setup, doctor, project install, or pipeline work.
- Remove stale generated `computer-use`, `browser-use`, and `browser` skill shadows during `sks doctor --fix` global repair and npm postinstall global skill setup.
- Raise the tracked-file release budget for the expanded install/doctor selftest coverage while keeping `src/cli/main.mjs` flagged for future extraction.

## [0.7.58] - 2026-05-12

### Fixed

- Remove visible prequestion sheets from SKS execution routes by auto-sealing contracts from prompt, TriWiki/current-code defaults, and conservative policy.
- Keep QA-LOOP UI verification restricted to official Codex Computer Use evidence and block browser automation substitutes.
- Require Codex App `$imagegen`/`gpt-image-2` evidence for required PPT and UI/UX generated-image gates instead of direct API fallback or fabricated assets.
- Show Team scout activity in tmux split panes by seeding scout assignment events and pane-open lane events for each visible agent.

## [0.7.57] - 2026-05-12

### Fixed

- Keep `npm publish` release checks passing after the MAD tmux launch changes by moving the MAD command path out of the oversized CLI entrypoint without increasing package file count.

## [0.7.56] - 2026-05-11

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.55] - 2026-05-11

### Fixed

- Force all Codex launch, exec, remote-control, and hook-observed client model paths back to `gpt-5.5`, stripping `gpt-5.4` request overrides before they can reach the client runtime.

## [0.7.54] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Allow active `$MAD-SKS` and top-level `sks --mad` permission gates to run required Supabase migration application, including Supabase MCP `apply_migration`, `supabase migration up`, and `supabase db push`, while keeping default/non-MAD DB push and catastrophic reset/wipe safeguards blocked.


## [0.7.53] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Force generated and repaired Codex config plus SKS tmux launches to use `gpt-5.5`, preventing `gpt-5.4-mini` or other model defaults from slipping in through missing top-level model pins or `SKS_CODEX_MODEL` overrides.

## [0.7.52] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Treat Codex App Markdown-linked `$research`, `$QA-LOOP`, and related picker skills as explicit SKS routes so Computer Use wording cannot hijack QA/research prompts into the fast lane.
- Clarify `sks codex-app check` Computer Use readiness by distinguishing installed plugin files from live `@Computer` tool exposure in the current Codex App thread.
- Extend the Computer Use-only policy text to require `@Computer` or `@AppName` in a fresh Codex App thread when live UI/browser evidence is needed.
- Require real Codex App `$imagegen`/`gpt-image-2` output for generated raster assets and generated image-review evidence, blocking placeholders, prose-only critique, and fabricated image files from satisfying route gates.
- Report Codex image-generation feature readiness in `sks codex-app check` so missing `$imagegen` exposure is visible before SKS visual/image pipelines run.

## [0.7.51] - 2026-05-10

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.
- Add the `$Image-UX-Review` / `$UX-Review` route so UI/UX audits require a source screenshot -> `$imagegen`/`gpt-image-2` generated annotated review image -> issue ledger evidence chain instead of passing from text-only critique.
- Add Image UX Review route artifacts, generated skills, CLI status inspection, README guidance, and selftest coverage for missing generated-review-image blockers.
- Raise the release size/file-count guard for the new Image UX Review route module and expanded CLI selftests.

## [0.7.50] - 2026-05-09

### Fixed

- Fix Team review orchestration so default and lower explicit reviewer counts materialize at least five reviewer/QA validation lanes.
- Keep Team tmux review visibility without hiding the scout, executor, and planning representative lanes.
- Resolve `latest` mission selection from mission metadata timestamps instead of lexicographic ids, so same-second duplicate missions do not hide the actually active Goal/Team completion state.

### Changed

- Centralize the Team review-lane policy in a reusable gate module used by runtime plans and selftests.
- Update generated harness text, Team selftests, release size gates, and user-facing examples for the default minimum of five QA/reviewer lanes.

## [0.7.49] - 2026-05-09

### Fixed

- Add `sks codex-lb repair` and `sks auth repair` so stored codex-lb API-key auth can be re-synced without re-entering the key.
- Make `sks --mad` sync codex-lb/Codex CLI auth before launch and open a fresh session when the repaired key must be loaded immediately.
- Stop DB safety pre-tool checks from treating ordinary file-edit patch text such as `Update File` as SQL `UPDATE` operations.

## [0.7.48] - 2026-05-09

### Added

- Centralize the MAD-SKS live full-access permission profile in a reusable gate module so hooks, skills, and MCP-style safety checks share one decision function.
- Make `sks --mad` create an active MAD-SKS tmux permission mission so DB hooks inside the launched workspace allow live server work, Supabase MCP DB writes, direct SQL, targeted DML, and needed migrations while keeping catastrophic wipe safeguards.
- Expose Team tmux sessions as a single-window split-pane live UI with overview and color-coded lane metadata.

### Fixed

- Keep npm install/upgrade repair aligned with the new MAD-SKS and Team tmux behavior so generated setup policy and skill text no longer preserve stale safe-default wording.
- Reduce tmux/Team terminal noise by replacing large lane banners and verbose create output with mission, lane, status, watch, and artifact pointers only.
- Update the package file-count release budget for the new permission gate module.

## [0.7.47] - 2026-05-09

### Fixed

- Remove the generic ambiguity-question gate from normal execution routes so `$Team`, SKS workflow, research, DB, GX, and other direct work no longer stop on prewritten intent/risk questionnaires.
- Keep only explicit checklist routes such as `$QA-LOOP`, `$PPT`, and `$MAD-SKS` on the clarification path, while ordinary Team work now materializes Team artifacts immediately.
- Stop stale non-checklist clarification missions from hijacking later prompts or blocking tool calls, preventing repeated question sheets from recursively reappearing.

## [0.7.46] - 2026-05-09

### Fixed

- Preserve Codex Fast mode defaults during npm install/upgrade repair and `sks codex-lb setup` by keeping `service_tier = "fast"` plus the `sks-fast-high` profile instead of stripping the service tier while rewriting Codex config.
- Keep repeated ambiguity-gate retries compact so pending `INTENT_TARGET` questions no longer reprint the full visible-response contract and plan-tool instructions on every hook resume.
- Let `sks pipeline answer` seal contracts directly from `--stdin` or `--text` so users no longer need to deal with an `answers.json` step for ordinary clarification replies.
- Activate `$MAD-SKS` scoped DB permissions during auto-sealed standalone and modifier routes so ordinary DDL/DML is allowed while catastrophic wipe safeguards stay active.


## [0.7.45] - 2026-05-09

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

### Added

- Add `sks codex-app remote-control` as a version-gated wrapper for Codex CLI 0.130.0's headless remote-control entrypoint, with status/JSON/dry-run modes and no fallback to older app-server internals.
- Add the `$PPT` image asset ledger pipeline so required presentation image resources are planned, generated through real `gpt-image-2` Image API calls when `OPENAI_API_KEY` is available, embedded in source HTML, and blocked instead of faked when credentials or generation output are missing.

### Changed

- Keep Codex App Fast mode selection visible during npm postinstall/setup/codex-lb configuration by enabling Fast UI keys and removing legacy SKS top-level `model`, `model_reasoning_effort`, and `service_tier` locks from Codex config.
- Report Codex remote-control readiness in `sks codex-app check`, and update Codex App guidance for Codex CLI 0.130.0 live app-server config refresh behavior.
- Raise the package file-count gate to 56 so the extracted Codex App command module stays release-checkable without adding more logic to the oversized CLI entry file.
- Make `$PPT` build/status output and selftest cover fact, image asset, review, bounded iteration, cleanup, and parallel build artifacts.


## [0.7.44] - 2026-05-08

### Fixed

- Stop clear auth-worded CLI rendering tasks from asking generic `RISK_AND_BOUNDARY` questions when conservative safety defaults can be inferred.
- Materialize Team runtime artifacts immediately after an auto-sealed ambiguity gate so Team missions can proceed to scouting instead of sitting at a sealed contract.
- Make the tmux/Codex intro stable: animate only for non-tmux unauthenticated launches, redraw frames in place, and show static 3D ASCII inside tmux.

## [0.7.43] - 2026-05-08

### Fixed

- Clarify that the default SKS Team pipeline authorizes route-owned worker/reviewer subagents without a separate user request.
- Make `sks --mad` launch Codex in explicit full-access mode with `danger-full-access` sandboxing and `approval_policy=never`.
- Make the tmux launch intro use a detailed rotating 3D-style SKS ASCII animation with more frame steps.
- Ship the install `.gitignore`, Fast mode, and PPT design-reference pipeline fixes under a fresh npm patch version.


## [0.7.42] - 2026-05-08

### Fixed

- Add a polished animated ASCII SKS intro for tmux launches, with a static fallback through `SKS_TMUX_LOGO_ANIMATION=0`.
- Keep release metadata aligned after the explicit SKS version bump.

## [0.7.41] - 2026-05-08

### Fixed

- Ship the codex-lb pre-launch auth flow in English, collecting host domain and API key before Codex opens.
- Load the codex-lb API key from the SKS-managed env file, sync Codex CLI API-key login for the interactive TUI, and use a fresh tmux session after first-time setup so the key is applied immediately.
- Keep release metadata aligned after the explicit SKS version bump.

## [0.7.40] - 2026-05-08

### Fixed

- Preserve user-owned Codex config such as Fast mode UI settings when SKS setup or global postinstall refreshes `.codex/config.toml`.
- Launch the default SKS tmux Codex CLI workspace in fast-high mode while allowing environment overrides.
- Add a pre-launch SKS codex-lb y/n auth prompt plus `sks codex-lb setup --host <domain> --api-key <key>` so hosted domain and key values are applied directly before Codex CLI opens.
- Repair tmux dependency handling so Homebrew-managed tmux uses Homebrew, npm-managed tmux uses npm, and unknown tmux paths are reported as conflicts.
- Make source-repo version drift checks use the local `bin/sks.mjs` runtime instead of stale global `sks`.
- Stop the pre-commit version guard from automatically bumping package and changelog versions on every commit; explicit `sks versioning bump` remains the release bump path.

## [0.7.38] - 2026-05-08

### Fixed

- Keep release metadata aligned after the automatic SKS version guard advances the package version.

## [0.7.37] - 2026-05-08

### Fixed

- Publish the hook update-check selftest fix under the version actually produced by the automatic SKS version guard.
- Make automatic SKS version bumps create and stage the matching changelog section so publish cannot silently advance beyond the verified changelog entry.

## [0.7.36] - 2026-05-08

### Fixed

- Keep hook update-check selftest verification stable when the on-disk SKS runtime version advances before the child hook process records update state.

## [0.7.35] - 2026-05-08

### Fixed

- Make TriWiki repeat-mistake prevention enforceable by preserving high-priority tail memory claims, binding relevant mistake recall into decision contracts, promoting voxel priority/conflict signals into source hydration, and gating completion on consumed recall evidence.
- Warn during `sks versioning status` when the source package version is newer than the bare global `sks` runtime.

## [0.7.34] - 2026-05-08

### Fixed

- Make `sks --mad` and explicit tmux launches attach automatically in interactive terminals after creating or reusing the session, while preserving print-only behavior for `--json`, `--quiet`, `--status-only`, `--no-attach`, and `SKS_TMUX_NO_AUTO_ATTACH=1`.

## [0.7.33] - 2026-05-08

### Fixed

- Add the release changelog section matching the current package version after the versioning hook advanced the package to `0.7.33`.

## [0.7.32] - 2026-05-08

### Fixed

- Keep the release gate aligned after the version guard advanced the package during install/bootstrap pipeline repair, and make the hook update-check selftest failure report the recorded state for diagnosis.

## [0.7.31] - 2026-05-08

### Fixed

- Make `npm i -g sneakoscope` automatically bootstrap the global SKS runtime root when install/upgrade runs outside a project, so Codex App `$` skills and pipeline fallback behavior are refreshed without requiring a separate `sks bootstrap`.

## [0.7.30] - 2026-05-08

### Fixed

- Add a Codex App pipeline-activation fallback to generated stateful SKS skills so `$Team`, `$SKS`, and related routes run `sks hook user-prompt-submit` and materialize mission/pipeline artifacts even when project hooks are not visibly injecting context.

## [0.7.29] - 2026-05-08

### Fixed

- Keep the Codex CLI update preflight release-ready after the version hook advanced the package again, including OpenClaw auto-approve coverage and the extracted install helper path.

## [0.7.28] - 2026-05-08

### Changed

- Check npm `@openai/codex@latest` before tmux launches, prompt `Y/n` when the installed Codex CLI is missing or outdated, and continue the same launch with the updated binary after approval.
- Treat `SKS_OPENCLAW=1` OpenClaw runs as auto-approved for SKS update/install prompts, and include that environment flag in generated OpenClaw guidance.
- Document the Codex CLI update preflight in the README default tmux runtime flow.

## [0.7.27] - 2026-05-08

### Changed

- Make bare `sks` open or reuse the default tmux Codex CLI workspace, keeping `sks tmux open` as the explicit launch form for session/workspace flags.
- Update CLI help, generated quick reference wording, and README runtime guidance so the default tmux launch surface is discoverable.

## [0.7.26] - 2026-05-08

### Added

- Add `sks openclaw install|path|print` to generate an OpenClaw skill package that lets OpenClaw agents attach `sneakoscope-codex`, enable the shell tool, and discover/use SKS workflows from a target repo root.
- Document OpenClaw agent setup, config YAML, sandbox note, and useful SKS commands in the README.
- Raise the package file-count budget to 54 for the new OpenClaw generator and CLI handler modules while keeping packed and unpacked byte budgets unchanged.

## [0.7.25] - 2026-05-08

### Fixed

- Prune stale SKS-generated skills and generated app/agent files during setup, doctor repair, and postinstall refresh by comparing the previous generated manifest with the current generated surface.
- Preserve user-owned custom skills while removing prior-version SKS generated legacy files, and report the cleanup in doctor JSON output.

## [0.7.24] - 2026-05-08

### Changed

- Bump the deployment package version after the score-based ambiguity-question rebuild so the next publish can ship a fresh patch release.

## [0.7.23] - 2026-05-08

### Changed

- Replace fixed ambiguity-question templates with a weighted clarity gate that scores goal, constraints, success criteria, and codebase context before asking only the lowest-clarity execution-changing questions.
- Add Ouroboros-style ambiguity threshold metadata and Prometheus/Hyperplan-style planning lenses to the generated question schema and visible `questions.md` output.
- Update Team and prompt-pipeline skill guidance plus README documentation so user-facing surfaces describe score-based minimal clarification instead of static `GOAL_PRECISE` / `ACCEPTANCE_CRITERIA` prompts.

## [0.7.21] - 2026-05-08

### Fixed

- Make update-check selftest cases explicitly enable the mocked update check so inherited `SKS_DISABLE_UPDATE_CHECK=1` environments cannot skip the effective installed-version assertion.

## [0.7.20] - 2026-05-08

### Fixed

- Add the release changelog section matching the current package version so `npm run release:check` passes after the patch bump.

## [0.7.19] - 2026-05-08

### Fixed

- Infer conservative payment retry and auth session-expiry defaults during SKS ambiguity gating, so predictable `$Team` payment/auth fixes auto-seal instead of repeatedly asking for obvious policy slots.
- Restrict `$PPT` design/render execution to its route allowlist, ignoring installed out-of-pipeline design skills and MCPs unless a conditional PPT contract explicitly enables them.
- State the root `$PPT` design-policy goal as preventing AI-like generic presentation styling by grounding visuals in audience, sources, getdesign reference, and the design SSOT.

## [0.7.18] - 2026-05-08

### Changed

- Make `design.md` the explicit design decision SSOT while treating getdesign and `VoltAgent/awesome-design-md` as source inputs that must be fused into that SSOT or route-local `$PPT` style tokens.
- Add regression coverage for the fused design SSOT policy in generated `$PPT`, `getdesign-reference`, `design-system-builder`, prompt-pipeline, install manifest, and `$PPT` style-token artifacts.
- Update the README release surface for `$PPT`, design SSOT routing, getdesign, and `awesome-design-md` source-input behavior so npm/GitHub documentation matches the new feature set.

## [0.7.16] - 2026-05-08

### Changed

- Bump the deployment package version after the clarification-gate hard-pause fix so the next npm publish ships a fresh patch version.

## [0.7.15] - 2026-05-08

### Fixed

- Keep mandatory ambiguity-removal questions hard-paused until explicit user answers are sealed with `answers.json` and `sks pipeline answer`, instead of allowing repeated Stop hook blocks to fall through into the next pipeline phase.
- Add regression coverage proving clarification gates do not write compliance hard-blockers while waiting for answers, and that `pipeline status` projects `clarification-gate` blockers before the contract is sealed.

## [0.7.14] - 2026-05-08

### Added

- Add report-only route economy probes to Proof Field and workflow perf: contract clarity scoring, workflow complexity scoring, Team trigger matrices, and fail-closed verification stage cache keys.
- Add gate projection to `sks pipeline status` so active route gates, subagent evidence, Context7 evidence, and reflection freshness can be inspected as a single report-only blocker projection.

## [0.7.13] - 2026-05-08

### Changed

- Make `$PPT` artifact generation parallel-friendly by running independent strategy, render, and file-write groups with `Promise.all`.
- Add `ppt-parallel-report.json` plus gate/selftest coverage so `$PPT` records which presentation build phases ran as parallel groups.

## [0.7.12] - 2026-05-08

### Changed

- Replace the CLI runtime with direct tmux 3.x sessions and split panes across `sks tmux open`, `sks --mad`, dependency checks, doctor/bootstrap readiness, Team live lanes, cleanup, generated quick references, and README setup.
- Remove the remaining current-source tmux predecessor traces from command discovery, dependency repair, package keywords, Team skill wording, and runtime documentation.

## [0.7.11] - 2026-05-08

### Fixed

- Preserve `$PPT` editable source HTML under `source-html/artifact.html` while keeping the exported PDF as the user-facing artifact.
- Add `$PPT` cleanup reporting and gate/selftest coverage so PPT-only temporary build files are removed after completion and stale root `artifact.html` output does not remain.

## [0.7.10] - 2026-05-08

### Fixed

- Close the `$PPT` artifact loopback by adding `sks ppt build|status`, deterministic HTML/PDF artifact generation, storyboard/source/style/render-report files, and a passing `ppt-gate.json` only after the sealed contract has 3+ pain-point/solution/aha mappings.
- Make `$PPT` presentation design explicitly simple, restrained, and information-first, with design detail carried by hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents instead of decorative overdesign.
- Make the generated `imagegen` skill prefer official Codex App built-in image generation via `$imagegen` / `gpt-image-2`, with API generation reserved for approved larger batches using `OPENAI_API_KEY`.
- Split postinstall and Context7 CLI helpers out of `src/cli/main.mjs` so the main CLI entrypoint stays below the 3000-line split-review gate.

## [0.7.9] - 2026-05-08

### Fixed

- Complete the `$PPT` presentation pipeline surface by generating the `ppt` Codex App skill, materializing `ppt-audience-strategy.json` / `ppt-gate.json` after sealed answers, and adding selftest coverage that `$PPT` ambiguity removal asks for delivery context, audience profile, STP strategy, decision context, and pain-point to solution mapping before artifact creation.
- Raise the package file-count budget to 50 for the new generated `$PPT` skill while keeping packed and unpacked byte budgets unchanged.

## [0.7.8] - 2026-05-08

### Fixed

- Stop treating every MCP tool name as a database tool, so Codex Computer Use MCP calls such as opening Microsoft Edge by bundle id are not blocked by the SKS DB safety gate during no-question runs.
- Add selftest coverage proving Computer Use MCP payloads pass the DB safety hook while Supabase execute_sql remains guarded.

## [0.7.7] - 2026-05-08

### Changed

- Infer predictable UI/UX ambiguity slots such as state behavior and visual-regression preference so SKS no longer asks users for defaults like "judge for yourself" or `yes_if_available`.
- Add getdesign.md as the generated design-reference policy for design.md, UI/UX systems, and presentation-like HTML/PDF artifacts, with npm postinstall opportunistically wiring the official Codex skill when the `skills` CLI is available.

## [0.7.6] - 2026-05-07

### Fixed

- Keep ambiguity-gated routes hard-paused after visible questions are shown: pre-tool and permission hooks now block implementation, tests, route materialization, and unrelated tools until explicit user answers are converted to `answers.json` and `sks pipeline answer` seals the contract.
- Add selftest coverage proving pending Team clarification blocks normal tool execution while still allowing the `pipeline answer` command that resumes the route.

## [0.7.5] - 2026-05-07

### Changed

- Embed Hyperplan-style adversarial planning lenses into the existing Proof Field and Team debate rubric, so SKS challenges framing, subtracts unnecessary surface, demands evidence, tests integration risk, and considers a simpler alternative without adding a new route or heavier pipeline stage.
- Add selftest coverage that Proof Field reports and scorecards carry the adversarial lenses, and document the lightweight Hyperplan adaptation in the README.

## [0.7.4] - 2026-05-07

### Changed

- Raise the package size gates to 384 KiB packed and 1536 KiB unpacked so release preparation has practical headroom instead of failing on tiny harness growth.

## [0.7.3] - 2026-05-07

### Fixed

- Infer conservative DB safety defaults for predictable ambiguity-gate prompts so SKS no longer asks users to fill static database policy slots when the safe answer is already clear.
- Add selftest coverage proving a DB safety question-block prompt auto-seals with zero visible slots.
- Raise the package size gates to 269 KiB packed and 1037 KiB unpacked for the DB clarification inference coverage while keeping the package at 49 files.

## [0.7.2] - 2026-05-07

### Fixed

- Auto-run global forced SKS bootstrap from npm postinstall when the install cwd looks like a project, so first installs and upgrades refresh project hooks, skills, and readiness without requiring `sks setup --bootstrap --install-scope global --force`.
- Keep postinstall bootstrap targeted at `INIT_CWD` and add an explicit `SKS_POSTINSTALL_NO_BOOTSTRAP=1` opt-out for users who need package install without project mutation.
- Raise the unpacked package size gate by 1 KiB for the automatic postinstall bootstrap selftest coverage while keeping the package at 49 files.

## [0.7.1] - 2026-05-07

### Fixed

- Fix `sks doctor --fix --json` so the DB safety scan is wired into the CLI instead of crashing before the readiness report.
- Preserve the existing project/global install scope during `doctor --fix` unless the user explicitly passes a new scope, so project installs keep project hook commands.
- Add CLI-level `doctor --fix` selftest coverage for managed file repair across skills, hooks, quick reference, policy, AGENTS managed block, legacy skill mirrors, and user-owned custom skills.

## [0.7.0] - 2026-05-07

### Added

- Add `pipeline-plan.json` as the stateful route execution map. It records runtime lane, kept/skipped stages, required verification, Proof Field binding, and the no-unrequested-fallback invariant for each mission.
- Add `sks pipeline plan [mission-id|latest] [--proof-field] [--json]` and include plan summaries in `sks pipeline status`, Team CLI mission creation, generated skills, README, workflow perf metrics, and selftests.
- Raise package size budgets to 268 KiB packed and 1032 KiB unpacked for the 0.7 pipeline-plan runtime surface while keeping the package at 49 files.

### Changed

- Bind Proof Field speed decisions into the mission plan so fast-lane work skips only explicit stages, while broad/security/database work fails closed to the full Team/Honest path.

## [0.6.100] - 2026-05-07

### Added

- Add lightweight skill dreaming with `.sneakoscope/skills/dream-state.json`, `sks skill-dream status|run|record`, and recommendation-only keep/merge/prune/improve reports so generated skills can be simplified after count/cooldown thresholds without evaluating every conversation or deleting skills automatically.
- Raise the packed package budget from 256 KiB to 264 KiB for the skill-dream runtime surface while keeping the package at 49 files and below the 1 MiB unpacked gate.

## [0.6.99] - 2026-05-07

### Changed

- Add a Proof Field execution lane so small, low-risk, clearly verifiable work can use `proof_field_fast_lane` and skip Team debate, fresh executor teams, broad route rework, and unrelated checks while keeping listed verification, TriWiki validation, and Honest Mode.
- Surface the speed-lane policy in route context, generated Team/prompt/pipeline skills, workflow perf metrics, README, and selftest coverage so risky work still fails closed to the normal Team/Honest path.

## [0.6.98] - 2026-05-06

### Changed

- Adapt Managed Agents-style outcomes/dreaming ideas into the existing lightweight Proof Field path: proof reports now include an outcome rubric, simplicity scorecard, and explicit escalation triggers instead of adding a new background pipeline.
- Shorten the Research plan shape around frame, hypothesize, falsify, and apply phases so research outputs favor the smallest useful mechanism or probe over broad process expansion.

### Fixed

- Suppress negative-priming wording in TriWiki compact recall by rewriting selected anti-goal guardrails into positive target behavior while keeping the original claim hydratable by source/hash.
- Add a selftest proving a selected negated recall claim no longer pastes the negated target into compact `claims` text and is instead routed through `attention.hydrate_first`.
- Accept Context7 MCP underscore tool names such as `resolve_library_id` and `query_docs` as completion evidence, preventing routes from staying blocked after the docs call actually ran.

## [0.6.97] - 2026-05-06

### Fixed

- Pin selected TriWiki claims into the coordinate anchor set so `attention.use_first` keeps cache-hit anchors for the claims the capsule actually chose, even when high-priority distractors compete for a small anchor budget.
- Add a selftest fixture that verifies selected cache-hit claims remain present in `claims`, `wiki.a`, and `attention.use_first` under distractor pressure.

## [0.6.96] - 2026-05-06

### Fixed

- Simplify `$DFix` finalization so it no longer creates a persistent light-route state record; DFix now uses an explicit completion marker plus a one-line DFix-specific Honest Mode check while remaining free of TriWiki/TriFix/reflection recording.
- Stop bare `sks` and default `sks team` creation from opening tmux automatically; tmux launch now requires an explicit `sks tmux open`, `sks --mad`, auto-review start, or `sks team --open-tmux`.
- Reuse the current tmux terminal for explicit single-session launches when SKS is already running inside tmux, preventing nested tmux windows.

## [0.6.93] - 2026-05-05

### Changed

- Bump the deployment package version after the Computer Use fast-lane routing update so the next npm publish ships a fresh patch version.

## [0.6.92] - 2026-05-05

### Added

- Add `$Computer-Use` / `$CU` as a maximum-speed Codex Computer Use lane for UI/browser/visual tasks, deferring TriWiki refresh/validate and Honest Mode to final closeout while preserving the Computer Use-only evidence policy.

### Fixed

- Prevent Computer Use pipeline-tuning requests that mention TriWiki or Honest Mode from being misrouted into `$Wiki`.

## [0.6.91] - 2026-05-05

### Changed

- Clarify `$Goal`/`sks goal` as a fast SKS bridge overlay for Codex native `/goal` persistence, with implementation continuing through the selected SKS execution route and Context7 only required when external docs are involved.

## [0.6.90] - 2026-05-05

### Fixed

- Prevent `$DFix` turns from being pulled into repeated full-route Honest Mode stop-hook loopbacks; DFix uses one-shot ultralight finalization context and keeps only cheap verification for micro-edits.

## [0.6.89] - 2026-05-04

### Changed

- Bump the release version for the SKS generated-file ignore update so the next npm publish can ship a new package version.

## [0.6.88] - 2026-05-04

### Changed

- Make default SKS project setup write shared `.gitignore` entries for generated Sneakoscope files so `.sneakoscope/`, `.codex/`, `.agents/`, and managed `AGENTS.md` do not appear as project changes.
- Keep `--local-only` installs on `.git/info/exclude` while adding selftest coverage for both shared and local-only ignore modes.

## [0.6.87] - 2026-05-04

### Added

- Add `sks proof-field scan` as the first Potential Proof Field implementation slice, reporting invariant ledgers, proof cones, negative-work cache entries, fast-lane eligibility, and fail-closed escalation triggers for the current change set.
- Add `sks perf workflow` to measure Proof Field build time, fast-lane eligibility, selected proof cones, verification count, and cached negative work for a concrete change intent.
- Raise the package file-count budget to 49 for the new proof-field module while keeping packed and unpacked byte budgets unchanged.

## [0.6.86] - 2026-05-03

### Changed

- Change `$MAD-SKS` from a table-removal confirmation flow into a scoped Supabase MCP DB cleanup/write override: column and schema cleanup are allowed during the active invocation, while catastrophic wipe operations remain blocked.

## [0.6.85] - 2026-05-02

### Changed

- Bump the deployment package version after the tmux Team cleanup, message, and color-lane UX work so the next npm release has a fresh patch version.

## [0.6.84] - 2026-05-02

### Changed

- Improve tmux Team sessions with cleanup-aware `watch`/`lane` follow loops, bounded `sks team message` inter-agent communication, terminal titles, and stronger color-coded lane banners.

## [0.6.83] - 2026-05-02

### Changed

- Replace the SKS CLI runtime with terminal multiplexer sessions, including `sks`, `sks tmux`, `sks --mad`, dependency checks, doctor/bootstrap readiness, Team live lanes, generated quick references, and README usage.
- Remove the previous runtime support and its socket/workspace control path from the source tree.

## [0.6.81] - 2026-05-02

### Changed

- Require package pipeline UI/browser verification and visual inspection evidence to use Codex Computer Use only, explicitly rejecting Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, and other browser automation as substitutes.

## [0.6.80] - 2026-05-02

### Fixed

- Stop repeating the SKS update prompt after the installed `sks` binary is already at the npm latest version, and clear stale pending update offers before accepting another update response.

## [0.6.79] - 2026-05-02

### Changed

- Require Codex Computer Use-only evidence for UI-level QA/E2E verification, explicitly rejecting Chrome MCP, Browser Use, Playwright, and other browser automation as UI verification substitutes.

## [0.6.78] - 2026-05-02

### Added

- Add `sks harness fixture|review` and `harness-growth-report.json` for deliberate forgetting fixtures, skill card metadata, harness experiment schema, permission profiles, MultiAgentV2 defaults, terminal cockpit view coverage, and tool-error taxonomy.
- Record failed tool calls into `tool-errors.jsonl` with InvalidArguments, UnexpectedEnvironment, ProviderError, UserAborted, Timeout, PermissionDenied, NetworkDenied, ResourceExhausted, Conflict, or Unknown classification; Unknown is marked as a harness bug.

### Changed

- Tighten the ambiguity stop gate so a clarification-only final must visibly include the `Required questions` block and slot ids instead of passing on vague “I need decisions” wording.
- Expand Team dashboard panes to the requested Mission/Goal, Agent Grid, MultiAgentV2, Work Order Ledger, Memory Health, Forget Queue, Mistake Immunity, Tool Reliability, Harness Experiments, Dogfood Evidence, Code Structure, and statusline/title cockpit surfaces.
- Extend Goal workflow artifacts with checkpoints, resume context, clear policy, and structured `/goal` continuation metadata.

## [0.6.77] - 2026-05-02

### Changed

- Make `sks team` open a terminal multiplexer orchestration workspace with a live mission overview pane plus split per-agent lanes.
- Render `sks team watch` as a readable live cockpit instead of raw transcript JSON by default, with `--raw` preserving the old tail output.
- Color-code and rename tmux Team lanes by role, expose role status badges, and collapse agent panes back to the overview through `sks team cleanup-tmux` or the `session_cleanup` live event.
- Repair external terminal socket launch by restarting the multiplexer with a non-persistent permissive socket mode when default control rejects SKS with `Broken pipe`.

## [0.6.76] - 2026-05-01

### Added

- Add TriWiki memory-governor sweep reports with ADD/UPDATE/CONSOLIDATE/DEMOTE/SOFT_FORGET/ARCHIVE/HARD_DELETE/NOOP/PROMOTE operations and bounded retrieval budgets.
- Add `sks wiki sweep` to emit memory hygiene, Skill Forge, Mistake Memory, and code-structure mission artifacts.
- Add `sks code-structure scan` and `code-structure-report.json` for 1000/2000/3000-line structure gates and split-review exceptions.

### Changed

- Team preparation now writes memory sweep, skill forge, mistake-memory, and code-structure reports before dashboard rendering.
- Team dashboard state now includes Memory Attention, Forget Queue, Skill Autopilot, Mistake Immunity, and Code Structure panes.
- Split maintenance-heavy CLI handlers into `src/cli/maintenance-commands.mjs`, bringing `src/cli/main.mjs` below the 3,000-line split-required review gate.

## [0.6.75] - 2026-05-01

### Added

- Add `$Goal` and `sks goal create|pause|resume|clear|status` as the SKS bridge to Codex native persisted `/goal` workflows.
- Add `goal-workflow.json` and `goal-bridge.md` mission artifacts so pipeline runs record the native `/goal` control contract.

### Changed

- Replace the user-facing Ralph route, command, generated skills, and selftest surface with the native Goal workflow path.
- Update no-question, DB safety, retention, generated rules, docs, and discovery surfaces to use generic SKS run/Goal terminology.

## [0.6.74] - 2026-05-01

### Added

- Add schema-backed GPT-5.5 performance artifacts for Work Order Ledgers, effort decisions, From-Chat-IMG visual maps, dogfood reports, Skill Forge, mistake memory, Team dashboard state, terminal pane plans, and Honest Mode reports.
- Add `sks validate-artifacts` and `sks perf run` so mission evidence and performance budgets are locally checkable.
- Add lightweight effort orchestration, prompt-context ordering, Skill Forge, mistake memory, dogfood, From-Chat-IMG work-order, and Team dashboard renderer modules.

### Changed

- Team mission creation now writes work-order, effort, and dashboard-state artifacts and exposes `sks team dashboard`.
- Make ambiguity-removal awaiting states modal: pending questions are re-exposed in chat and new route prompts cannot replace the active question sheet before answers are sealed.
- Size/performance budgets now reflect the measured zero-dependency package payload after schema/orchestration modules were added.

## [0.6.73] - 2026-04-30

### Changed

- Make tmux readiness checks validate workspace socket health, not only the tmux executable version, so `sks deps check`, `sks doctor`, `sks tmux check`, and `sks --mad` report unhealthy app/socket states before launch.
- Make `sks team` create a named tmux Team workspace and target each split/send by returned workspace and surface refs, so visible Team lanes open as split panes instead of relying on ambient tmux environment variables.
- Select the newly created tmux Team workspace after launch and report the actual opened lane count, so split panes are brought to the visible workspace instead of opening behind the current tmux view.

## [0.6.72] - 2026-04-30

### Changed

- Add a bounded stop-hook repeat guard so repeated identical Honest Mode or final completion summary prompts are suppressed instead of re-entering an infinite finalization loop.

## [0.6.71] - 2026-04-30

### Changed

- Persist SKS-created tmux workspace refs so repeated `sks --mad --high` launches can reuse the last workspace even when tmux workspace listing is incomplete or unstable.
- Block duplicate workspace creation when tmux workspace inspection fails, instead of silently falling through to another `new-workspace` request.

## [0.6.70] - 2026-04-30

### Changed

- Make `sks --mad` reuse its named tmux workspace and close duplicate SKS-named MAD workspaces instead of creating another workspace on every launch.
- Add pipeline, Team inbox, generated agent, auto-review, and MAD/MAD-SKS policy text that blocks unrequested fallback implementation code.

## [0.6.69] - 2026-04-30

### Changed

- Add `sks team lane` per-agent monitoring for tmux Team panes, showing agent status, assigned runtime tasks, recent agent events, and a fallback global tail.
- Promote explicit `$From-Chat-IMG` work-order analysis to xhigh temporary reasoning and generated skill metadata.
- Allow runtime commands to work outside any project by falling back to a per-user global SKS root, with `sks root` showing the active project/global root.

## [0.6.68] - 2026-04-29

### Changed

- Align the `main` merge release metadata after SKS versioning advanced the merge package version during the final commit.

## [0.6.67] - 2026-04-29

### Changed

- Merge the verified 0.6.66 MAD tmux repair line from `dev` into `main`, preserving the public README emphasis for From-Chat-IMG and TriWiki voxels.

## [0.6.66] - 2026-04-29

### Changed

- Make `sks --mad` check npm for a newer Sneakoscope release before launch and prompt y/n for updating in interactive terminals.
- Make MAD dependency repair install missing Codex CLI with `@latest`, install or upgrade tmux through Homebrew, and re-probe real tmux app bundle binaries after cask installation.
- Update README MAD/tmux troubleshooting docs for update prompts, `--yes`, and direct tmux app bundle discovery.

## [0.6.65] - 2026-04-29

### Changed

- Make `sks --mad` launch the tmux MAD profile as full-access high reasoning with Codex automatic approval review enabled via `approvals_reviewer = "auto_review"`.
- Align SKS auto-review profile generation with current OpenAI Codex docs by using `auto_review` instead of the legacy `guardian_subagent` reviewer value.

## [0.6.64] - 2026-04-29

### Changed

- Expand the README into a fuller open-source CLI guide with quick start, requirements, installation modes, terminal CLI usage, Codex App `$` commands, common workflows, troubleshooting, and release checks.

## [0.6.63] - 2026-04-29

### Changed

- Make `sks --mad --high` attempt Homebrew tmux installation and re-probe before launch when tmux is missing, with a concise launch blocker if installation cannot complete.
- Replace the first tmux banner box with a stronger SKS/tmux ASCII mark for the CLI workspace header.

## [0.6.62] - 2026-04-29

### Changed

- Make plain `sks --mad --high` wake the tmux app before creating the `sks-mad-high` Codex CLI workspace, so the command opens the tmux UI path directly.

## [0.6.61] - 2026-04-29

### Changed

- Replace the SKS terminal runtime with a tmux-based Codex CLI workspace flow, including tmux dependency checks, help/discovery surfaces, setup guidance, and Team tmux live lanes.
- Add `sks --mad --high` as an explicit one-shot tmux launch that writes and uses the `sks-mad-high` full-access high-reasoning Codex profile without changing the normal default route.

## [0.6.60] - 2026-04-29

### Changed

- Add `$MAD-SKS` as an explicit scoped database authorization modifier that can compose with other dollar-command routes while keeping the widened permission limited to the active invocation.
- Require table-removal operations to pause for short user confirmation even under MAD-SKS, and close the override when the active mission gate is complete.

## [0.6.59] - 2026-04-29

### Changed

- Merge the dev branch Team runtime graph, From-Chat-IMG completion gates, and active TriWiki attention work into main while preserving the main README positioning for From-Chat-IMG and TriWiki voxels.

### Changed

- Infer predictable ambiguity-gate contract answers from the prompt/default safety policy so SKS asks only unresolved behavior or safety questions instead of static `GOAL_PRECISE` and `ACCEPTANCE_CRITERIA` templates.

## [0.6.55] - 2026-04-29

### Changed

- Require From-Chat-IMG completion to include scoped QA-LOOP evidence after the customer-request work is implemented, with every work-order item covered, post-fix verification complete, and zero unresolved QA findings.
- Raise the tracked-file size gate to 288 KiB for the enlarged From-Chat-IMG scoped QA-LOOP selftest while retaining the existing package size gates.

## [0.6.54] - 2026-04-29

### Changed

- Strengthen From-Chat-IMG completion gates with a required checked work checklist and temporary TriWiki-backed request snapshot, so chat screenshot text, image-region matches, work items, and verification steps are tracked before Team completion.
- Add From-Chat-IMG temporary TriWiki retention handling so session-scoped image-analysis claims can be pruned after the configured later-session TTL.

## [0.6.53] - 2026-04-29

### Changed

- Add a stop-gated From-Chat-IMG coverage ledger so every visible customer request, screenshot image region, and attachment must be mapped to work-order item(s) with `unresolved_items=[]` before Team completion.
- Teach Team plans, generated skills, prompt context, inferred acceptance criteria, and selftests to require the From-Chat-IMG no-omission work-order coverage pass.
- Add a compliance-loop guard so repeated identical stop-gate blocks produce an evidenced `hard-blocker.json` instead of looping indefinitely, re-evaluate normal gates after later repairs, and bound route runner `--max-cycles` values.
- Raise the tracked-file size gate to 272 KiB for the enlarged CLI selftest and Team plan coverage logic while retaining the 256 KiB packed tarball limit.

## [0.6.52] - 2026-04-28

### Changed

- Expand README with feature coverage for route commands, Codex App surfaces, workflow rules, release checks, and requirements.
- Raise package size gates to 256 KiB packed and 1 MiB unpacked so shipped README documentation has practical headroom while npm dry-run packaging remains verified.

## [0.6.51] - 2026-04-28

### Changed

- Expose `$From-Chat-IMG` directly in `sks dollar-commands`, manifests, policy, quick reference, and generated dollar-command output instead of only as a hidden Team picker alias.

## [0.6.50] - 2026-04-28

### Changed

- Add explicit `$From-Chat-IMG` / `From-Chat-IMG` Team alias for chat-history screenshot plus original attachment intake.
- Gate chat-image analysis behind the explicit From-Chat-IMG signal so ordinary image prompts are not treated as chat captures.
- Require From-Chat-IMG intake to list chat requirements first, use Codex Computer Use visual inspection to strengthen attachment matching, and produce a client modification work order before continuing the normal Team pipeline.
- Raise the package size gates to 168 KiB packed and 644 KiB unpacked for the added command alias, generated skill, and route-gating selftests.

## [0.6.49] - 2026-04-28

### Changed

- Raise the package size gates to 166 KiB packed and 642 KiB unpacked so the stack-current-docs and final-summary policy surfaces remain publishable.
- Require final answers to omit dirty-worktree boundary wording that the Honest Mode hook treats as an unresolved gap.

## [0.6.48] - 2026-04-28

### Changed

- Require every pipeline final answer to include a user-visible completion summary explaining what changed, what was verified, and what remains unverified or blocked.
- Block Honest Mode final stop when the completion summary is missing, with selftest coverage for the new stop-gate behavior.

## [0.6.47] - 2026-04-28

### Changed

- Route question-shaped implicit directives, policy complaints, and mandatory workflow statements to Team instead of Answer.
- Require Team roster confirmation before implementation by materializing `team-roster.json` and enforcing `team_roster_confirmed=true` in Team gates.
- Raise the packed size gate to 165 KiB and unpacked gate to 640 KiB for the added stack-current-docs and Team roster guidance.

## [0.6.46] - 2026-04-28

### Changed

- Require current Context7 or official-doc evidence whenever stack, framework, package, runtime, or deployment-platform versions change, then record the guidance as high-priority TriWiki claims before coding.
- Add current-doc TriWiki examples for hosted Supabase keys, Next.js 16 proxy files, and Vercel Function duration limits.
- Require the latest coordinate+voxel TriWiki pack shape in validation and pipeline guidance; coordinate-only legacy TriWiki packs now fail validation and must be regenerated before use.
- Keep the package size gate bounded while allowing the required TriWiki voxel validation metadata.

### Fixed

- Treat successful Honest Mode phrases like `No active blocking route gate detected` and verified expected blocking as resolved, so loopback does not reopen on closure evidence.

## [0.6.45] - 2026-04-28

### Added

- Add chat-history screenshot intake guidance so SKS extracts visible text, matches screenshot image regions to attachments, and carries the evidence through the normal Team pipeline.
- Raise the package size gate slightly for the added pipeline guidance while keeping the tarball bounded under 628 KiB unpacked.

### Fixed

- Block full-route completion when Team work continues after `reflection-gate.json` was passed, forcing reflection to be refreshed before final Honest Mode.

## [0.6.44] - 2026-04-28

### Changed

- Use a GitHub raw logo URL in README so npm can render the image.

## [0.6.43] - 2026-04-28

### Changed

- Make QA-LOOP dogfood real UI/API flows as a human proxy, immediately apply safe contract-allowed fixes, and require focused rechecks before passing the QA gate.

## [0.6.42] - 2026-04-28

### Changed

- Add full-route reflection with generated `reflection` skill, stop-gate enforcement, and TriWiki lesson recording.
- Add Team `team-session-cleanup.json` as a required pre-reflection gate.
- Require QA-LOOP reports to use `YYYY-MM-DD-v<version>-qa-report.md`.
- Treat verified expected-block evidence as resolved in Honest Mode gap detection.
- Add `sks bootstrap` plus `sks deps check/install` for first-install readiness, and make postinstall point to bootstrap instead of mutating projects by default.
- Reduce Ralph questions for setup work by inferring non-target DB/UI fallback slots from local context.
- Count user request topics in TriWiki packs and prioritize repeated or strongly frustrated feedback as high-weight context for future inference.
- Raise the npm unpacked size budget to 620 KiB so the richer setup, reflection, QA, and TriWiki priority pipeline remains releasable.

## [0.6.41] - 2026-04-28

### Fixed

- Preserve custom Codex App skills during `sks doctor --fix`.

## [0.6.40] - 2026-04-28

- Preserve user-owned non-generated skill aliases during upgrade/repair while removing obsolete SKS aliases.
- Add selftest coverage for custom skill preservation.

## [0.6.39] - 2026-04-28

- Restore fuller README guidance while keeping package size under the gate.

## [0.6.38] - 2026-04-28

- Seed SKS dollar-command skills into `$HOME/.agents/skills` during package install.
- Report project-local and global dollar-command readiness in `sks codex-app check` and `sks doctor`.
- Add the minimal `ㅅㅋㅅ` README mark.

## [0.6.37] - 2026-04-28

- Add Korean `ㅅㅋㅅ` branding, tmux/setup guidance, Team live event logging, Codex CLI readiness handling, design/image skills, and Team-default execution routing.
- Fix Korean execution-prompt routing, Team continuation after ambiguity gates, Context7 readiness checks, changelog release checks, and Honest Mode loop-back/no-gap handling.
