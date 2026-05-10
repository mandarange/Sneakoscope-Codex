# Changelog

## [Unreleased]


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
