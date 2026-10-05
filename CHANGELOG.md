Warning: truncated output (original token count: 122815)
Total output lines: 6909

# Changelog

## [Unreleased]

### Documentation

- Reworked the README around the first five minutes: value proposition, one-command install, project bootstrap, Doctor, and the plan → build → verify → review loop.
- Added FAQ and troubleshooting guidance with recovery and redaction instructions.
- Added contribution, security, issue-form, and pull-request guidance.
- Added a publish-ready launch plan with an honest baseline and review-only outreach copy.

### Maintenance

- Added a CI workflow that runs install, build, typecheck, and the canonical test command on pushes and pull requests.


## [10.5.1] - 2026-10-04

### Security

- `smol-toml` is 1.7.1. `parse()` no longer hangs when an array or inline-table
  value is followed by a comment that has no trailing newline (CVE-2026-85730).
  SKS uses that parser for Codex config and role files.

### Fixed

- Desktop Bridge settings that grew past 256KiB on session pins were treated as
  missing. SKS Center then showed the saved Codex-LB preference as off and
  refused to save a change. The newest pins that still fit are kept, and a
  file already over the cap is read instead of discarded.

## [10.5.0] - 2026-10-02

### Changed

- Child agents no longer run by default for implementation. The router sent every
  implementation-shaped prompt to Naruto, where the parent only orchestrates and a
  full delegation prompt (about 19,000 characters, a subagent plan, a parent-edit
  gate, a parent summary schema) is injected, even for a one-line fix. A risk word
  such as `deploy` or `auth` also made a prompt high-risk and default-parallel, and
  specialized routes always fanned out. Child agents now run only for an explicit
  `$sks-naruto` or `$sks-work`, `--agents N`, a parallel or subagent request in the
  prompt (a risk word does not cancel it), a specialized route the user named, or,
  with Jev mode on, when Jev judges that the task splits into independent parts. A
  routed-to-Naruto prompt that is not delegated runs as the lightest parent-owned
  route, so none of the orchestrate-only text or gate is injected: a one-line fix
  carries about 3,800 characters of hook text instead of 19,000.
- Jev answers a new single-or-parallel question in the same call that picks the
  pipeline. `single` is the default and the answer whenever Jev is unsure; only a
  confident `parallel` starts Naruto for that prompt.
- The AGENTS block, the `prompt-pipeline` skill, the `sks-naruto` skill
  description, the README, and the Naruto guide say that implementation is the main
  agent's own work and Naruto is for work you ask to split.
- SKS writes Codex's own service tier ids (`priority`, `default`) wherever it
  configures Fast for Codex.
- The spawn policy says that bounded forks are an SKS rule: Codex 0.159 and
  0.153.4 both run a child on the `model` and `reasoning_effort` a spawn names,
  whatever the fork.

### Fixed

- `sks doctor`, `sks update`, and the install writers stripped keys Codex still
  honours: `features.multi_agent`, `features.codex_hooks` (a live alias, `= false`
  turns hooks off), `notice.fast_default_opt_out`, and `remote_control`. They also
  repaired values Codex accepts. Only SKS-owned tables are removed now.
- `codex features enable` ran from the doctor repairs and the install-time image
  repair, and rewrote a user's `<flag> = false` opt-out to true. The repairs no
  longer run it.
- Codex App git-action readiness was gated on `codex_git_commit`, a flag Codex
  removed, so readiness reported blocked on an empty config.
- SKS seeded `[features]` flags and `[agents]` defaults that are already on by
  default, and copied the global `[mcp_servers]`, `[plugins]`, and `[marketplaces]`
  tables into project Codex configs, where they are already visible.

### Removed

- The retired SKS-run Naruto scheduler and patch write-E2E modules, the Core Skill
  Engine optimizer and its release gates (the manifest-continuity and uninstall
  inventory checks stay as the `skills:manifest-continuity` gate), the retired
  `$Loop` runtime's gates, schemas, docs, and upper layers (the `sks loop`
  refusal and the readers of old loop state stay), the unregistered Python tools
  smoke check, and a context-pack projection helper nothing called.
- The four never-run LLM lens stubs of `sks review` (the `lenses` key of
  `review-report.json` is gone), the unread `goal_continuation` route metadata, the
  write-only DFix persona and lease ledger, and an unread QA-LOOP contract field.
- The SKS PreCompact and PostCompact hooks (SessionStart with `source=compact`
  already refreshes the context), the `DCODEX_*` environment aliases from a
  predecessor product, the hard-coded Codex.app `node_repl` paths, and an unwired
  imagegen repair check script.

## [10.4.0] - 2026-10-02

### Fixed

- The PermissionRequest hook approved every permission request that no SKS
  guard denied, without asking the user, in every Codex project (the user-level
  hook matches `*`). A request nothing matched now carries no `decision`, so
  Codex's own approval prompt still runs. An explicit allow is emitted only for
  a user git action during a no-question route, which is what the 0.7.62 Git
  Actions change intended.
- That git-action check read the payload's metadata even when a command was
  present, so `curl ... | sh # commit` counted as a git action. When a command
  is present it now decides on the command text alone (`git status|diff|add|
  commit|push|branch|remote|rev-parse|log` or `gh pr`); the force-style denials
  are unchanged.
- The harness guard, which stops an agent from running `sks setup`, `sks doctor
  --fix`, or an uninstall, classified any payload that merely mentioned such a
  command (a patch body, a search pattern, a goal) as that command, and missed the
  `cmd` key `exec_command` uses. It now reads the simple commands of a shell tool's
  command line, so quoted text and heredoc bodies are not commands. The parent
  orchestration gate treats the filesystem MCP `write_file`, `edit_file`, and
  `move_file` tools as source edits and both ends of a move or rename as targets.
- Codex sends no second `SubagentStart` when the parent follows up on a settled
  child (`followup_task`, `send_message`), so the parent gate and the wave
  lifecycle counted a child that was running a follow-up turn as settled. The
  first hook of a turn the log has not seen is now recorded as a `SubagentResume`
  and the child counts as running until its next `SubagentStop`. A spawn that
  names a managed role is no longer sealed to a Jev tier Codex would not run
  (Codex runs the role file's pin over the spawn's model): the input names the
  role's own pin and Jev is not asked. The MAD-SKS SQL plane reads Codex's real
  `tool_use_id` and no longer takes a lock when no operation was reserved.

### Removed

- Code that compensated for legacy Codex CLI versions and legacy models. Codex
  0.159 now picks multi-agent v2 per model from its catalog, discovers role files
  and `[agents]` spawn defaults, runs native `/goal`, loads skills and AGENTS.md,
  and reports its own capabilities through `hooks/list` and the generated
  app-server schema, so SKS no longer probes or re-implements them.
  - The release real-probe suite (`codex:current-core-real-probes`: web search,
    rich tool schema, doctor redaction, marketplace source, plugin catalog,
    sandbox alias, collab tool schema, image path, sandbox proxy). It tested the
    SDK-bundled Codex 0.153.4, not the operator's Codex, and its web search probe
    failed a 10.3.10 release run on a network flake. `codex:current:capability:real`
    and `codex:current:app-server-v2:real` stay.
  - The ten `codex-current` feature flags that nothing read, the capability
    matrix that grepped `codex --help`, the `agent_type` capability probe and the
    message-role fallback it fed (the probe could never succeed on a real host),
    the `codex --output-schema` availability ladder, the 0.130 remote-control
    version gate, the dead `codex plugin detail` and `--available` fallback, and
    the dead hook output normalizer.
  - The standalone-installer, Homebrew, and npm update planner: `sks codex update`
    runs the native `codex update` and fails closed with
    `codex_cli_update_method_unverified` when Codex does not advertise it.
  - The official-docs-compat report and the external-reference analyzer behind
    `sks codex-native reference-evidence` and `pattern-analysis` (the second verb
    now prints usage).
  - The fake-mode environment switches that only served those probes:
    `SKS_CODEX_CURRENT_CORE_FAKE`, `SKS_CODEX_CURRENT_FEATURE_FAKE`,
    `SKS_CODEX_CURRENT_FAKE`, `SKS_CODEX_CURRENT_APP_FAKE`, and their `*_FAIL`
    knobs. Fixtures use `SKS_CODEX_PLUGIN_JSON_FAKE` and `SKS_CODEX_VERSION_FAKE`.
  - Doctor JSON fields `runtime_readiness.agent_role_strategy`, `loop_mesh`,
    `rollout_budget_strategy`, `current_time_source`, `overload_retry_policy`,
    and the `codex_permission_profiles` inventory.
- Code that nothing in production reaches: 59 orphan check and blackbox
  scripts, the managed-config-merge module and its release gate, the evidence-key
  v2 library, modules kept alive only by their own tests (architecture-hardening
  state and contracts, mcp-manager, the codex-lb CLI image probe, subagent
  terminology), the empty infra-harness gate registry, the unreferenced
  doctor-status v2 schema, the 21 pipeline re-export shims and their budget
  check, the never-written codex-lb health circuit, the OpenRouter chat-stream
  client, and unreachable GLM remnants. Every deliberate refusal for retired
  flags such as `--glm` and the readers for old missions stay.

### Changed

- The Codex version floor is one literal, `CODEX_MIN_VERSION` (0.153.4 for now),
  decoupled from the `@openai/codex-sdk` pin, so a later bump is one line.
  `sks codex version|compatibility|doctor|current` still enforce it and
  `sks doctor` prints it next to the target.
- The Naruto spawn precheck reports `codex_below_supported_floor:<version>` or
  `codex_version_unknown` instead of `naruto_requires_multi_agent_v2`,
  `multi_agent_v2_missing_on_codex_<version>`, and `multi_agent_v2_probe_empty`.
- `sks doctor` removes the retired `.sneakoscope/codex-current-*` artifacts older
  versions wrote into projects.

## [10.3.10] - 2026-10-01

### Fixed

- A child could run an older model generation (for example `gpt-5.6-sol` while
  `gpt-6.1-sol` is listed) because SKS's spawn guards never saw the spawn.
  Codex 0.159 sends the multi-agent v2 spawn tool to hooks as
  `collaborationspawn_agent` (namespace and name joined without a separator),
  and the model check, the Jev tier seal, and the parent orchestration gate
  recognised only `spawn_agent`, `functions.spawn_agent`, and
  `collaboration.spawn_agent`. A spawn naming an old model passed untouched and
  the child ran it. Every spawn guard now matches all the names Codex uses.
- Role files pin a tier model and Codex runs that pin over the model a spawn
  names, but nothing rewrote a pin when Codex's models cache moved to a newer
  model, so a role could keep running the old generation while SKS reported the
  new one. SKS now refreshes the SKS-owned role files that pin an older model at
  three points: the first hook after the cache changes (the project's files),
  the first hook in any project (the files in `~/.codex/agents`, which serve
  every project, whether or not it was set up for SKS), and the spawn itself.
  Codex reads a role file when the spawn executes, so a pin refreshed just
  before the spawn applies to that spawn: it is allowed and runs the current
  model, with no denial and no manual repair. Only existing files whose marker,
  id and body hash still match are rewritten, and files you edited are never
  touched. A pin that is not older than its tier's current model, in a family
  the tier uses, is never lowered by any path (the hook refreshes, `sks update`,
  `sks init`, `sks doctor --fix`), whatever the model list says at that moment.
- SKS now takes the model list from the `model_catalog_json` file named in
  `~/.codex/config.toml` (the one the SKS bridge serves Codex Desktop through)
  and falls back to `~/.codex/models_cache.json` only when no catalog is
  configured. Any Codex client rewrites the cache with the models its own
  version can see, so an older client (the SDK-bundled 0.153.4 that the release
  checks run is one) left a list without `gpt-6.1-sol`; SKS then took 5.6 models
  as the newest and refreshed role files down to them, and would have refused
  `gpt-6.1-sol` spawns that Codex itself allows.
- The managed role catalog resolves its model on every read. The long-lived hook
  daemon copied it once at startup, so after a cache refresh it told the parent
  to spawn with a model the gate then rejected.
- The live bridge health probe sent its real request to the alphabetically first
  route (a hidden reviewer model, or the oldest generation). It now uses the
  newest generation the provider serves, which is the model Desktop would use.
- Without Codex's models cache, SKS no longer replaces a role pin or a default
  child model with its built-in ids unless the existing value is provably older
  than them, and the built-in balanced and context models are now the
  `gpt-6.1-sol` generation.
- `sks doctor --fix` moves a `[agents].default_subagent_model` in
  `~/.codex/config.toml` that names a superseded generation (an older SKS
  wrote `gpt-5.6-luna`) to the latest default child model. `sks doctor`
  without `--fix` only reports it.
- The bridge catalog Codex Desktop reads no longer advertises superseded
  generations of a family next to the current one, and a retiring model's
  migration prompt now points at the newest row of the family it named instead
  of `gpt-5.6-sol`. Codex builds the spawn model list from the visible rows, so
  a hidden generation can no longer be offered to a parent as a child model.
  Superseded rows are hidden, not removed, so a thread or `model =` line that
  still names one keeps working.

- Naruto could hand the same Computer Use or browser task to several children at
  once. Both are one shared GUI (one screen with one pointer and keyboard focus,
  one browser session), so the extra children only repeated each other's clicks.
  Each surface is now single-owner. The SKS PreToolUse spawn gate denies a second
  concurrent `computer_use_operator` or `browser_use_operator` spawn on every
  parent and releases the surface at the owner's `SubagentStop`. SubagentStop
  ends a child turn, so a resumed operator takes its surface again with its next
  tool call. A claim also expires (30 seconds for a spawn Codex rejected after
  the hook allowed it, 20 minutes without a tool call from the owner) so a missed
  event cannot lock a surface, and a hook delivered twice is not denied by its
  own claim. A goal whose suggested roles are only surface operators no longer
  joins the 16-child mass lane, and the delegation prompt, route policy, spawn
  contract, child guard, `AGENTS.md` block, and docs state the rule (the old
  "diversity may come from different tool surfaces" line no longer invites a
  second child on a surface). OpenRouter Only mode routes a managed role to a
  list role before the gate runs, so the gate cannot see the surface there and
  only the prompt rule applies. Verified with real Codex 0.159.2: a second
  parallel operator spawn is denied and the model sees the denial, the surface
  is owned from SubagentStart to SubagentStop, and the next spawn is allowed.

### Changed

- Leftover names that no longer matched the policy are gone: the `*Gpt56*`
  router helpers, the unused `gpt56_terra_luna_sol_routing` capability, the
  retired-GLM blocker id (`retired_glm_naruto_flag:--glm`), the duplicate effort
  tables in the model policy, the `luna_max`/`sol_high`/`sol_max`/`terra_max`
  keys in `sks naruto --help --json` (now `fast`/`balanced`/`deep`/`context`),
  and several modules nothing called. Docs that said every child uses GPT-6
  Astra, or quoted old models' prices, now describe the tiers.
- `sks agent-bridge async` follows the latest deep-tier model, the Astra effort
  migration covers every Astra generation, and `route-context.json` records the
  plan's parent model policy instead of a fixed constant.

## [10.3.9] - 2026-09-28

### Fixed

- SKS now runs in every project you open in Codex, not only in projects set
  up with `sks setup`. Codex loads hooks for every project only from the
  user-level `~/.codex/hooks.json`, but SKS kept its hooks in project
  `.codex/hooks.json` files and in a `~/.codex/requirements.toml`
  `managed_dir` setup that Codex never reads. In any other project Jev,
  prompt routing, and Naruto parent orchestration never ran, while `sks
  doctor` reported the hooks as active. `sks update` now installs the SKS
  hooks in `~/.codex/hooks.json` through a launcher it keeps pointed at the
  installed SKS and adds the SKS rules to `~/.codex/AGENTS.md`. It drops the
  dead setup's `allow_managed_hooks_only` line at once and its inert files on
  the next update, after the 10.3.8 updater's own final check has read them.
  `sks setup` and `sks doctor --fix` install the same hooks.
- Hook trust written by SKS now matches what Codex checks. SKS hashed the hook
  group one level too deep and wrote project-hook trust into the project
  config, which Codex ignores. It now writes Codex's hash, keyed by the
  canonical file path, into the user config, and checks the result with
  Codex's own `hooks/list` before reporting the hooks active.
- No event runs SKS twice. A project keeps its own SKS hooks only when they
  run that project's own SKS build (the SKS source repository or a
  project-local install); the user-level hook steps aside for those events.
  Other SKS project hooks are removed once the user-level hooks are active.
- In a project that was never set up, SKS keeps its `.sneakoscope/` state out
  of git through `.git/info/exclude`, never the tracked `.gitignore`.
- The user-level hook launcher no longer stops working silently after
  `brew upgrade node`. It pinned the versioned Cellar path that Node reports
  for itself, which the upgrade deletes, and fell back only to `sks` on PATH,
  which a Codex app started from the Dock does not have. It now pins the npm
  prefix's `bin/node` or a stable Homebrew alias, falls back to `node` on
  PATH and the usual install locations, and `sks doctor` and the update check
  report a launcher that can no longer reach an SKS.
- Codex opened in the home directory or a filesystem root no longer gets SKS
  state or mission gates: the user-level hook does nothing there instead of
  creating `~/.sneakoscope`.
- The project fan-out of `sks update` asks Codex about the hooks once instead of
  once per known project, and closes the `codex app-server` it starts.

### Changed

- `sks hooks install` and `sks hooks repair` install the user-level hooks;
  `sks hooks status` reports whether they are active. `sks hooks
  official-parity` compares SKS's view with Codex's `hooks/list` answer.
- SKS Doctor shows an `sks_codex_hooks` row when the user-level hooks are
  missing or untrusted.
- Removed code nothing reached: 491 unused exported functions, constants, and
  types, unused imports and locals, and 88 files (48 modules and 40 check
  scripts that no gate, npm script, or test ran; 4 of those scripts already
  failed). What a command, hook, gate, or test reaches is unchanged.
- Tests that failed only on a loaded machine no longer do: hang guards for the
  cold Swift compile of the menu bar singleton test, the launchctl stubs of the
  upgrade smoke isolation test, the CLI child of the hook output and postinstall
  tests, and the native producer of the latency SLO gate (one longer retry when
  it hangs; a finished run is still judged by the p95 budget).

## [10.3.8] - 2026-09-27

### Added

- OpenRouter Only Mode runs the Codex main thread and every subagent on
  OpenRouter models. It and Prefer Codex-LB are mutually exclusive: turning
  either on turns the other off in the same operation. SKS Control Center has
  an **OpenRouter Only** switch next to **Prefer Codex-LB** and a new
  **Subagent Models** page; the CLI is `sks bridge openrouter-only
  status|on|off` and `sks bridge subagent-models list|set --stdin`.
- Subagents may run only the models on the subagent list (up to 16), each with
  criteria, a reasoning effort, and one default. With Jev mode on, Jev picks the
  model for every spawn, in Naruto and any other parallel work, from those
  criteria; otherwise a child keeps a listed model the parent asked for, or
  gets the default. The SKS spawn hook denies any other model, and the Desktop
  Bridge refuses non-OpenRouter model requests and unlisted subagent models
  even without the hooks.

### Fixed

- The README published since 10.3.5 had a second copy of the page spliced into
  the Naruto section, cutting a sentence in half. It is one page again.
- The Codex 1M Context setting no longer says it works only for GPT-5.6 Sol.
  Codex caps the window at each model's own maximum, so SKS now reads that
  maximum from Codex's model list: every model with a larger maximum gets it
  (872K for the current GPT-5.6 and GPT-6 models), and SKS Center warns only
  when the active model's window is fixed, uncapped, or unknown.

## [10.3.7] - 2026-09-25

### Fixed

- `sks update` offers a version only once npm serves it. A version npm lists
  but whose version document or tarball still returns 404 is reported as
  pending, and `sks update` says this install is current instead of starting
  an install that cannot finish. Offline or unclear answers never hide an
  update. `SKS_UPDATE_TARBALL_PROBE=0` turns the check off.
- `sks update` and `sks doctor --fix` no longer leave a project blocked on
  old skill copies an earlier SKS wrote before it stamped managed markers.
  They are recognized by structure, not by a list of names: the folder is a
  name the SKS route registry resolves, the frontmatter names that folder, and
  it holds only the files SKS writes for a skill. Such copies are moved to
  `.sneakoscope/quarantine`, not deleted; a copy with any other file stays and
  still asks the user.

## [10.3.6] - 2026-09-25

### Fixed

- `sks update` no longer fails in the minutes after a release is published.
  npm lists a new version before it serves the package file, and an update in
  that gap got a 404. The update now retries the download for up to six
  minutes, with `--prefer-online` so a cached 404 is not replayed, and prints
  that it is waiting. If npm still has not served the file, nothing is
  installed, the current version keeps working, and the update says to run it
  again in a few minutes. `SKS_UPDATE_PUBLISH_WAIT_MS` sets the wait.
- `sks update` and `sks doctor --fix` no longer stay blocked when the global
  skills were written by a newer SKS that is not the one on PATH, as after a
  rollback, a dev checkout, or an update that stopped halfway. The installed
  SKS now rewrites them to its own version. They are still left alone when a
  newer SKS really is the `sks` on PATH.

## [10.3.5] - 2026-09-25

### Added

- Image generation has two modes, set on the new Image Generation page of
  SKS Control Center or with `sks imagegen enable --model <id>` and
  `sks imagegen disable`. With the custom image model off (the default), SKS
  uses Codex's own image generation: the built-in tool inside a Codex turn,
  and outside a turn the hosted image tool on the bridge route of your Codex
  model. With it on, every SKS image goes through the Desktop Bridge to the
  OpenRouter image model you chose; the bridge holds the key. SKS no longer
  pins an image model and records the model each output came from.
- `sks imagegen status|models|enable|disable|generate`. `generate` writes
  the image plus a `<image>.sks-imagegen.json` evidence sidecar that UX-Review,
  PPT, and slide gates verify against the image bytes. The model list comes
  from OpenRouter's Image API, 55 models today instead of the 9 the general
  catalog returned, and each request is fitted to the aspect ratios,
  qualities, formats, and reference-image limit the model reports.
- UX-Review callouts, PPT assets, slide reviews, QA-LOOP, the hooks, and the
  skills follow the active image mode.
- Jev mode decides more: the pipeline for each prompt (an explicit `$sks-*`
  command always wins), whether a turn makes an image, the aspect ratio and
  quality of `sks imagegen generate`, the model tier of each unsealed Naruto
  worker, and when QA-LOOP raises its effort. Unconfident answers keep the
  deterministic behavior.

### Fixed

- Image generation failed whenever the host could not select the pinned
  `gpt-image-2.5-sunburst` model, which included Codex's own image tool. The
  pin and its `imagegen_model_unavailable` blocker are gone. Doctor and the
  preflight now accept Codex's built-in tool as configured, and still require a
  real output before an image claim passes.
- An image the provider returns as JPEG is no longer saved under a `.png`
  name; SKS asks for the named format and otherwise uses the real extension.

- `sks update` now brings every SKS project up to date, not only the folder
  it ran in. SKS runs from one global install, but Codex reads hooks, agent
  roles, and AGENTS.md from each project, so a project used only through
  Codex kept what an older version wrote there, such as `gpt-5.5` agent
  roles. The update now queues every known SKS project for one detached
  runner that migrates them after the update releases its lock. Known
  projects are the folders SKS has run in plus the Codex-trusted folders
  that carry an SKS marker; temporary folders are excluded. Each project
  goes through the same lock, receipt check, and migration doctor as
  `sks <command>`, and results land in
  `~/.sneakoscope-global/reports/project-migration-fanout.json`.
- The first Codex hook in a project after an update also queues that
  project's full migration, and a project marked only by
  `.codex/SNEAKOSCOPE.md` now counts as an SKS project there. Tests and CI
  never start the runner; `SKS_BACKGROUND_PROJECT_MIGRATION=0` turns it off.
- A project opened through a symlink, or through macOS `/var` instead of
  `/private/var`, no longer reports a fresh migration receipt as stale. The
  migration gate now compares canonical paths.

## [10.3.4] - 2026-09-25

### Fixed

- A Naruto parent no longer implements slice work itself. The PreToolUse hook
  denies root-parent source edits (`apply_patch`, file writes, and write-intent
  shell commands) before the mission's first child starts and while children
  of the run are still running. `.sneakoscope` artifacts, read-only tools, and
  verification commands stay open. Child threads are recognized by the
  `agent_id` / `agent_type` fields Codex actually sends, since hook payloads
  carry no thread id and children share the parent's `session_id`. Each phase
  releases after two denials with one warning, recorded in
  `parent-orchestration-gate.json`, so a host without a spawn tool cannot
  deadlock.
- Implementation requests no longer slip past orchestration. The task
  classifier and the router now share one implementation-verb vocabulary, so
  "make the header sticky", "set up eslint", or "결제 모듈 연동해줘" route to
  Naruto instead of the read-only Answer route or a parent-only turn.
- Prompt text that contradicted the contract is gone from every injected and
  installed surface: "every child uses gpt-6-astra regardless of role
  preferences", "use Naruto only for explicit parallel work", "execute general
  code-changing work in the current task", a parent-model fallback of
  gpt-6-astra max, and a child-start line that named a model Jev had already
  replaced. The Jev turn line never tells the parent to switch models.
- `sks update` no longer fails on a home without `~/.sneakoscope`, and the
  retired provider-branded bridge cleanup accepts the later
  `auth_priority_enabled` settings key.
- `sks update` no longer skips cleanup because of file permissions. A new
  first migration stage, `managed-permission-repair`, finds SKS-managed paths
  the user cannot delete before retention and the other stages run. It fixes
  read-only folders and user immutable flags on paths the user owns. For
  root-owned or system-flagged paths it asks for administrator permission
  through the macOS administrator dialog, cached `sudo`, or a terminal `sudo`
  prompt, and changes only ownership, flags, and user permission bits. It
  never deletes anything itself, and user skills and Codex sessions are never
  touched. A stage that still fails is rerun once after a second repair. A
  declined prompt leaves the exact `sudo` command in the receipt and is not
  repeated for 12 hours outside an explicit update. When `npm install -g`
  fails with `EACCES` or `EPERM`, update gives the SKS package folder and its
  two npm folders back to the user and retries once instead of using
  `sudo npm`. Tests and CI never elevate.

### Changed

- No child model is pinned anymore. SKS picks a tier for each child (fast,
  balanced, context, or deep) and runs the newest model Codex lists for that
  tier in its models cache, so children use `gpt-6-luna`, `gpt-6-sol`, and
  `gpt-6-astra` today and move to a newer family without an SKS release. The
  `gpt-5.6-*` seal list and the Astra-only child rules are gone from the Jev
  question set, the spawn policy, role files, role preferences, the standalone
  `sks naruto run` defaults, the config child default, and every injected or
  installed prompt. Stored preferences on an older family move to the latest
  model of the same tier.
- Jev mode uses Jev for every decision SKS can apply: the turn tier, each
  spawn's tier, per-role tiers and role omission, the plan, the context, and
  gated parent edits. Context and plan decisions follow the mode instead of
  stored flags, a Jev-fixed automatic child count is stated to the parent, and
  the delegation prompt drops its tier rules so the parent spends no time
  choosing models or efforts.
- Jev decides at tool-call time. A gated parent edit before the first spawn
  asks Jev whether it is orchestration scaffolding (`parent_owned`) or slice
  work (`delegate_child`); only a confident `parent_owned` releases it, and any
  feature, fix, or test change counts as slice work. A spawn that Jev could not
  seal gets its role's own tier instead of bouncing off the spawn policy.
- `sks update` removes more stale setup: the retired Local LLM skills and
  `~/.sneakoscope/local-model.json`, SKS hook entries for events the profile
  no longer installs in project and user `hooks.json`, and conflicting
  OMX/DCodex markers (quarantined by the migration stage that the doctor
  pre-check used to block). Retired `sks ralph` and `sks loop` references now
  rewrite to `sks naruto`.
- A project used only through Codex hooks refreshes its SKS-managed AGENTS.md
  block and `.codex/SNEAKOSCOPE.md` once on the first hook after an update.
  User-authored guidance is never touched.

### Removed

- Test files that no runner executed: `test/integration`, `test/blackbox`,
  `test/types`, `test/wrongness`, `test/chaos`, the E2E tests outside the
  `git-collaboration:e2e` gate, the unused `safety-check` runner, the
  architecture sandbox scripts, and the fixtures only they used. The
  canonical suite, the E2E gate, and the architecture-map gates still run
  every remaining test.

## [10.3.3] - 2026-09-22

### Fixed

- `sks update` rewrites the managed Codex guidance and Naruto skill so
  implementation stays parent orchestration and Jev seals each new child
  spawn. The live managed hook execs the installed SKS entrypoint instead of
  a PATH lookup.

## [10.3.2] - 2026-09-22

### Changed

- Naruto child spawns ask Jev for the sealed model at spawn time. A confident
  answer rewrites that child's model and effort. An already open parent thread
  is not rerouted on later tool calls. A stored role-model preference stays in
  place.
- Ordinary Naruto work is parent orchestration: the parent decomposes, spawns,
  and integrates, and does not implement the slice itself. The same Decisions
  request can omit a recommended role that the task does not need.

## [10.3.1] - 2026-09-22

### Fixed

- Jev mode calls OpenRouter Decisions on every Codex user prompt, including
  turns that do not start a Naruto fan-out. A confident answer seals the model
  for that turn.
- Enabling Codex LB selects `model_provider = "codex-lb"` so the Codex app
  sends model traffic to the gateway. Disabling it returns the managed OpenAI
  binding.

## [10.3.0] - 2026-09-22

### Added

- When Jev is on, one Decisions request routes each dynamic Naruto role.
  Jev chooses among Luna, Sol, Terra, and Astra, and the same call scores
  difficulty and detects high-stakes work. A confident fast choice uses the
  sealed effort for that model. Judgment-level difficulty or high risk stays
  on Astra. Jev off keeps the Astra baseline. User role preferences stay
  authoritative.
  Modes are `off` and `jev`. A valid answer is compiled into an existing SKS plan
  or optional-context selection. There is no advisory text and no second LLM
  judge. Recovery remains unsupported. The Control Center Decisions page can
  enable and disable Jev, opens Connections for the shared OpenRouter credential,
  and is reachable from Overview.
- Interactive global `npm i -g sneakoscope` on macOS builds and starts the SKS
  Menu Bar with the Control Center. Dependency, CI and piped installs stay
  inert; `SKS_POSTINSTALL_MENUBAR=1` forces the build, `SKS_POSTINSTALL_NO_MENUBAR=1`
  skips it.

### Changed

- `sks update` removes the managed `~/.sneakoscope/local-decision` runtime and
  its private socket directory, then rebuilds the Menu Bar so the installed
  Decisions page matches the package.

## [10.2.0] - 2026-09-15

### Changed

- Optimize the installed SKS user environment for GPT-6 Astra. Skill picker
  descriptions are complete WHEN-scoped sentences inside the 64-character
  budget, with no ellipsis truncation. AGENTS.md, SNEAKOSCOPE.md, and route
  hooks point at TriWiki only when a claim needs project memory, and they keep
  authorized work going until verification or a hard blocker.

### Fixed

- Keep a stale live Desktop Bridge catalog from blocking the migration receipt
  after a version bump. Migration Doctor still records the follow-up; ordinary
  Doctor profiles still require a ready bridge.

## [10.1.6] - 2026-09-12

### Changed

- Default instructed backend, core, UI, and native implementation to GPT-6
  Astra Low. Keep planning, analysis, debugging, and review on their judgment
  profiles, and reads, exploration, and direct tool operation on Astra Medium.
- Align managed role files, runtime routing, generated skills, and delegation
  guidance. Preserve parent settings, explicit Astra effort preferences, and
  serialized policy identifiers used by existing installations.

## [10.1.5] - 2026-09-10

### Changed

- Use one officially verified GPT Image model policy, currently GPT Image 2.5
  Sunburst, across generation, editing, UX, and PPT. Explicitly set the image
  tool model in Responses requests and support the current size/quality contract.
- Remove model-specific request/response artifacts, the old validator, duplicate
  request writes, and the retired live-smoke environment alias. Do not infer an
  engine from a prompt or relabel Codex built-in image outputs as the current API model.

### Fixed

- Raise the shared Desktop Bridge Responses body limit from 16 MiB to 128 MiB
  for HTTP and WebSocket traffic so large image and tool histories can reach
  their selected provider. Preserve request contents, routing, credential
  isolation, decoded-size limits, and bounded WebSocket queues.
- Return HTTP 413 for oversized bodies, including compressed decoded overflow
  and chunked uploads. Keep the socket open long enough to deliver that response
  and distinguish size rejection from malformed compressed JSON. Log only the
  byte limit, observed wire size when available, and encoded/decoded stage.

## [10.1.4] - 2026-09-08

### Changed

- Enforce GPT-6 Astra for every managed child agent. Use low effort for tiny
  mechanical work, medium for reads, exploration, and tool operation, high for
  implementation, and max for judgment. Preserve the active parent's selected
  model, reasoning effort, and service tier.


## [10.1.3] - 2026-09-07

### Fixed

- Route ordinary Codex App Responses WebSockets from the first request's model
  instead of sending model-less upgrades to ChatGPT OAuth. Apply the same policy
  and credential isolation as HTTP, including Codex-LB priority and model aliases.
  Preserve native Astra steering and async messages; reject provider changes on
  an established connection before forwarding or changing its session pin.
- Repair stale Desktop Bridge launch configuration during `sks update` through
  the current installer and verify the serving version after repair. Keep saved
  provider credentials and routing preferences. Report remaining service failures
  instead of treating a successful launchctl command as a completed repair.
- Show saved Codex-LB priority as unavailable while the running bridge reports a
  stale or unhealthy runtime.
- Hold a prewarmed Codex Responses WebSocket open until its first request instead
  of closing it after the request timeout. Nothing upstream is dialed before a
  model arrives, and an unbound socket is released with a normal close only
  after an hour.
- Launch a PATH-resolved `sks` JavaScript entry through the current Node binary
  in the Desktop Bridge launch agent. launchd's minimal PATH has no `node`, so
  the symlinked entry failed with `env: node: No such file` and a failed
  restart booted the service out.
- Keep a Desktop Bridge that came up running when the installer or a settings
  restart reports only a blocker such as a stale runtime version. Booting a
  serving bridge out over a version label left Codex with a dead port; the
  blocker is now returned for the caller to report.

## [10.1.2] - 2026-09-07

### Added

- Enable experimental Codex context management by default during global setup
  and repair. Add a Settings switch in SKS Center and
  `sks codex-app context-management status|on|off`; preserve explicit opt-outs.
  This preference applies to new tasks subject to Codex account/provider support.
- Update the bundled Codex SDK/runtime to 0.153.4 so it can load the new nested
  context-management feature setting.

## [10.1.1] - 2026-09-06

### Added

- Add `sks agent-bridge async` for native Astra Async tool calling through the
  registered Codex-LB route. Start selected read-only SKS tools during streaming,
  continue independent model work, and return results on their original call IDs.
  Bound execution, cancel tool process trees, and report observed async behavior.
- Prefer a persistent WebSocket for the async command and continue with only new
  tool results. Use HTTP when connection establishment fails or a completed
  connection closes; never replay a request interrupted after transmission.

### Changed

- Apply official Astra prompting guidance: honor existing authorization, explain
  skill-induced pauses, keep small tasks parent-owned, and avoid repeated checks.
- Make essential-mode prompts match the profile: no compulsory reflection or
  Honest Mode labels; copy and translation responses return the requested content.
- Prefer exposed async reads and bounded programmatic batches, preserve pending
  work during steering, and document compatible effort updates and host limits.

### Fixed

- Map Astra SDK requests using `none` or `minimal` effort to `low`, including the
  Python adapter, while preserving supported efforts and other models.
- Await asynchronous App Server tool handlers with bounded capacity, deadlines,
  cancellation, and original request IDs instead of serializing Promise objects.
- Keep explicitly incomplete Responses output incomplete and isolate output from
  a new steering continuation so an earlier response cannot satisfy it.
- Give SKS Center MCP inventory reads enough time to finish both configuration
  scopes, and show incomplete or rejected responses as unavailable.
- Pass the selected workspace and its read-only trust context to the Center's
  effective MCP inventory so it matches Overview instead of falling back to HOME.
- Refresh existing SKS-owned global agent roles during setup and repair so
  legacy Sol/Terra defaults converge to Astra. Preserve user provider and
  permission overrides, symlinks, and absent global role directories.

## [10.1.0] - 2026-09-05

### Added

- Add a persistent codex-lb authentication-priority setting, exposed through
  `sks bridge auth-priority status|on|off` and SKS Center, with explicit active,
  off, and unavailable status. Saved preferences remain visible when connection
  startup fails; uncertain saves are read back before the switch is re-enabled.

### Changed

- Improve SKS Center setup, navigation, and connection and maintenance controls
  so users can find the current state and the action needed to change it.
- Use GPT-6 Astra for standalone Naruto defaults and managed implementation,
  judgment, and context/tool roles. Tiny mechanical workers retain GPT-5.6
  Luna Max. Active tasks preserve the user's selected model, reasoning effort,
  and service tier; model capabilities come from the current Codex catalog.
- Remove the unused V1 dynamic release/cache implementation, detached scheduler
  and ledger helpers, report-presence flagship proof chain, and synthetic
  parallel-smoke marketing evidence. The active V2 release DAG, real execution
  checks, source integrity, and safety checks remain.
- Research review uses evidence, method, and falsification findings without
  requiring historical personas, a prescribed genius summary, or resolution of
  every minor comment. Material findings and source integrity remain enforced.
- Document the direct `npm publish` handoff against the final clean commit,
  with full release proof, package provenance, and maintainer authentication.
  Earlier release records retain their original versions and evidence.
- Keep generated navigation projections as local caches so refreshing release
  evidence does not require another release commit. Metadata-only navigation
  commits in existing projects no longer trigger a false stale-code warning.

### Fixed

- `sks update` uses the same installed-package doctor and convergence path
  when the package is already current, so an update still reconciles managed
  runtime state. Nested postinstall bootstrap is suppressed to keep the updater
  responsible for maintenance and final verification.
- A package-local doctor run cannot reuse a previous report as current success,
  and timed-out runs cannot pass the update's verification.
- Persist lightweight pipeline plans, read pipeline status from the calling
  session, and preserve the active mission during maintenance Align. Align,
  Wiki validation, and hook preflight share extractor identity; generated packs
  and maps no longer invalidate their own source fingerprints.

## [10.0.0] - 2026-09-02

### Changed

- **Essential Trust.** SKS was built when models lied often enough that
  every completion had to be policed; the rituals became the product's
  largest cost. 10.0 introduces a verification profile
  (`src/core/verification-profile.ts`) and makes `essential` the default:
  safety gates stay, proof rituals go. `strict` restores the pre-10 behavior
  (`SKS_VERIFICATION_PROFILE=strict`, or
  `verification-profile.json` under the project's `.sneakoscope/` or the
  global root). Inside the SKS test harness the default stays `strict` so the
  existing suite keeps proving the legacy behavior. See
  `docs/essential-trust.md`.
- In the essential profile a finished turn finishes: the Stop hook no longer
  blocks on Honest Mode / completion-summary wording, the honest-gap loopback,
  or Stop-time completion proof, reflection, work-order, root-cause,
  engineering-sanity, DB-access-review, or architecture-map ledgers
  (`essential_profile_stop_accepted`). Loop continuation and no-question
  autonomy are route mechanics and still apply. `sks proof …` commands remain
  available on request.
- Managed-skill digest drift (`content_digest_mismatch`) no longer denies
  prompts or tool calls in the essential profile — at prompt time, post-hoc,
  or on every tool call; it is repaired or advised. An interrupted-tool-output
  prompt is advised instead of refused.
- The PostToolUse hook is not installed in the essential profile; it wrote
  proof evidence nothing in that profile reads, at one cold process per tool
  call. `sks update` / `sks doctor --fix` remove the stale SKS entry from
  `.codex/hooks.json` and the managed TOML while keeping user-authored hooks.
- Hooks run through the per-project `sksd` daemon by default (~150 ms per
  hook instead of a ~600 ms cold start; identical decisions;
  `SKS_HOOK_DAEMON=0` opts out; the test harness stays cold). Every request
  carries the caller's package version and a mismatch retires the daemon
  (`sksd_version_mismatch`) so the next call spawns one on the new code.
- `sks doctor --full` can now be `ready` on a real machine: the image route's
  manual real-output proof (`codex_imagegen_real_output_unverified`, a
  hardcoded `false` in capability detection that no doctor run could clear) is
  a warning in the essential profile, which also turns SKS Center's
  permanently orange Overview badge green when the machine is healthy.
- The managed `AGENTS.md` block and the `$Honest-Mode` / `$Answer` skills drop
  the "run Honest Mode" ritual; final output states the result, what was
  verified, and what remains — once.

### Fixed

- The doctor readiness matrix read the Desktop Bridge inspection's WRAPPER
  object, so its bridge branch was dead in production and `core_ready`
  over-reported green for a blocked bridge; it now unwraps `.status`.

## [9.2.7] - 2026-09-02

### Fixed

- Desktop Bridge readiness no longer decays to `degraded` ~100 seconds after
  every transport verify. The serving process's state heartbeat rewrote the
  whole state document from its in-memory copy, whose `last_verified_probe_ids`
  is always empty (only the verifier ever learns them), so the ids a
  `sks bridge verify --level transport` had just written were erased on the
  next tick, the last transport diagnostic never bound to the current process,
  and readiness sat at `degraded` — `ready: false` with an EMPTY blocker list,
  which every surface above it read as green. The heartbeat now adopts the
  on-disk ids before it writes; the verifier's own refresh still writes
  exactly what it passes.
- `sks doctor --json` — the fast path SKS Center's Diagnostics view calls —
  emitted a fixed `not_checked` Desktop Bridge stub. It now reads the serving
  process's own evidence (state file plus a bounded log tail through the new
  import-free `upstream-evidence` module; no launchctl, no probes, no secret
  stores) and reports `desktop_bridge.status` as `log_evidence_clear`,
  `upstream_unreachable_evidence` (with the blocker and the repair in
  `blockers`/`recovery_actions`, mirrored into `warnings` and `next_actions`),
  or `not_checked` with the reason. The fast contract is unchanged: `ok: true`,
  `fast_readonly_ok`, well inside the 1.2 s gate.
- `sks doctor --fix` and the `sks update` catalog-repair stage run one
  transport-level verify after a restart, or whenever the serving bridge reads
  `degraded`, so a repaired machine finishes `ready` instead of "running but
  unverified" (`desktop_bridge_transport_reverified` /
  `desktop_bridge_transport_reverify_incomplete:<state>`). The read-only
  doctor never fires live probes.
- The full doctor names a `degraded` bridge instead of swallowing it:
  `desktop_bridge_readiness_degraded:transport_unverified_for_current_process`
  as a warning with the verify command, whenever `ready` is false with no
  blockers.

## [9.2.6] - 2026-09-02

### Fixed

- Desktop Bridge upstream targets are no longer pinned for the life of the
  serving process. Field shape (2026-09-01, this machine): the bridge resolves
  each provider's DNS once at start and pins the first answer; a network
  change after start (VPN flip, Wi-Fi swap, CDN address rotation) left that
  pin unreachable, every codex-lb request failed as
  `bridge_upstream_unavailable:EHOSTUNREACH` for days, and nothing — repair,
  doctor, update, or any readiness surface — detected or healed it short of a
  manual service restart. Three convergent fixes:
  - The bridge self-heals at runtime: an unreachable-class connect failure
    (`EHOSTUNREACH`, `ENETUNREACH`, `ENETDOWN`, `EHOSTDOWN`, `EADDRNOTAVAIL`,
    `ECONNREFUSED`, `ETIMEDOUT`, connect timeout) re-resolves the target
    in place — steering away from the address that just failed when the
    answer set allows it, under the same private-address/rebinding validation
    as a fresh start, deduped and rate-limited across concurrent requests —
    and replays a buffered Responses body against the fresh address
    (`bridge_upstream_unreachable_rerouted:*` in the bridge log). Streamed
    bodies and WebSocket upgrades cannot replay, but still trigger the
    re-resolution so the client's own retry reaches a live address.
  - Pins also re-resolve on a 5-minute TTL before anything fails, keeping a
    still-listed address stable (a healthy pin never flaps between families)
    and following DNS only once the pinned address has left the answer set —
    so CDN and load-balancer rotations stop costing one failed request each.
    A pinned address that now presents another host's certificate
    (`ERR_TLS_CERT_ALTNAME_INVALID`) counts as a dead pin too. WebSocket
    upgrades on a dead pin reconnect once against the refreshed address
    instead of spending the client's reconnect budget.
  - DNS being unavailable at bridge start (login before Wi-Fi, a VPN
    mid-flip) no longer fails preflight. The serve process used to exit
    non-zero and launchd relaunched it every few seconds until the network
    came back. The pin is now deferred (`deferred_upstreams` on the
    `started` log line), the bridge serves, a request while DNS is still down
    is answered `bridge_remote_dns_failed`, and the first request after DNS
    returns resolves the pin. Invalid answers (private address, rebinding)
    still refuse to prepare exactly as before.
  - `sks doctor` (read-only) surfaces recent `bridge_upstream_unavailable`
    rejections written by the CURRENT serving process — state file plus log
    tail, no probes — as a `desktop_bridge_upstream_unreachable:*` blocker
    with the repair named; a reroute logged after the last failure means the
    bridge already healed itself and is left alone. `sks doctor --fix`
    restarts the service on standing evidence (re-resolving every pin).
  - `sks update` inherits the same detection/restart through its
    desktop-bridge catalog-repair stage, so an update converges a stranded
    bridge even when versions already match; the official ChatGPT upstream
    (`chatgpt.com`) gets every one of these heals as well.



## [9.2.5] - 2026-08-27

### Fixed

- Desktop Bridge official-models `auto` routing converges in BOTH directions at
  bridge start. Field shape (2026-08-27, this machine): one 9.2.4 start
  resolved `auto` off a transient not-ready provider-registry snapshot, flipped
  the bare `gpt-5.6-*` routes to the official `openai` identity, and persisted
  that policy — and because the serve-time apply only ever flipped TOWARD
  passthrough, every later healthy start (codex-lb registered, credentialed,
  settings `auto`) kept sending `gpt-5.6-sol` turns out through the operator's
  ChatGPT OAuth while SKS Center showed a ready, registered gateway.
  `applyOfficialModelPassthrough` gateway mode now restores each bare official
  id still routed to `openai` to the target its `codex-lb:<id>` twin names
  (catalog upstream aliases included; a twin-less official route is left as
  passthrough), the serve path applies the resolved mode in both directions and
  logs which mode it applied, and a passthrough→gateway round trip regenerates
  the original policy generation.

### Changed

- The Codex runtime contract tracks Codex CLI/SDK 0.150.1
  (`@openai/codex-sdk` 0.147.0 → 0.150.1). The vendored models-manager base
  instructions are byte-identical between rust-v0.147.0 and rust-v0.150.1 (the
  vendoring header now says so); the feature-flag strip list was re-verified
  against the 0.150.1 `features list` table (`multi_agent_mode` left the table
  entirely instead of reporting `removed`; the strip set itself is unchanged
  and every managed flag — `hooks`, `fast_mode`, `apps` — is still stable); and
  the SDK capability and dependency-graph gates pass on 0.150.1.

### Added

- Legacy runtime data GC inside the shared doctor/init convergence
  (`sks.legacy-runtime-data-gc.v1`), with deletion authority kept narrow and
  provable: aged `config.toml.*` backups beyond the newest 3 (exact SKS backup
  name shapes only), staged bridge catalog generation bundles that are neither
  the active bundle nor the newest rollback (the active-generation pointer is
  required proof — without it nothing is deleted), retired `codex-01xx-*`
  capability/doctor caches whose readers were replaced by `codex-current-*`,
  and the v1 `chrome-native-hosts.json` record once the v2 record exists. The
  machine-local `~/.codex/config.toml` also loses the append-per-move
  `# SKS moved machine-local Codex config` comment pile: the newest provenance
  line survives, the rest are compacted away.

## [9.2.4] - 2026-08-26

### Fixed

- The Desktop Bridge launchd service starts again. Its plist has always passed
  `bridge serve --supervised`, but the CLI argument parser never registered
  `--supervised`, so every launchd start exited immediately with
  `bridge_command_unknown_option`. `KeepAlive { SuccessfulExit: false }` does not
  restart a clean exit, the failed activation booted the service out, and Codex
  reconnected forever against a loopback port nothing was listening on. The CLI
  option table and the launchd argv are now one module
  (`src/core/codex-lb/bridge-cli-contract.ts`): per-subcommand allowlists are
  typed against the parser's own table, and the plist builder refuses to emit an
  option the parser has not registered.
- `sks update` now revives a Desktop Bridge that is installed but not running.
  The restage stage only ever restarted a bridge that was already serving (
  `launchctl kickstart -k`) and silently skipped a down service, so the one
  command an operator runs to fix a dead bridge replaced the package and left the
  service down. A plist plus settings with no live process is now bootstrapped
  back into launchd. Recovery still never fails the update: an unsuccessful
  attempt warns and names `sks bridge repair`, matching the catalog-repair stage.
- `bridge ensure|repair` no longer writes a launchd entry macOS cannot execute.
  A launchd agent holds no files-and-folders grant, so an entry under
  Desktop/Documents/Downloads dies inside node's module loader ("Cannot use
  import statement outside a module") before any bridge code runs. Running the
  CLI from a checkout in one of those folders pinned exactly that path into the
  plist; the resolver now skips protected candidates, falls back to the global
  `sks` on PATH, and reports `desktop_bridge_entry_macos_protected_folder` when
  no runnable entry is left.

## [9.2.3] - 2026-08-24
### Fixed

- Desktop Bridge status validation now treats `openai` as the canonical
  official identity route id for bare official-family models such as
  `gpt-5.6-luna`, matching OpenCodex (`OPENAI_CODEX_PROVIDER_ID` +
  `isBareOpenAiFamilyModel`). The live route policy already flipped those
  models onto that target, but the status schema and runtime validator
  still enumerated only `codex-lb` and `openrouter`, so `sks doctor --fix`
  and Control Center failed closed with
  `desktop_bridge_status_schema_invalid:$.routing.policy.model_routes."gpt-5.6-luna".provider_id:enum`.
  Provider profiles, `default_provider_id`, and session pins stay
  provider-only; official passthrough is still not a registry provider.
- Current-core web-search and image-path real probes now ignore host
  `config.toml` and pin native OpenAI. A down Desktop Bridge /
  OpenCodex Design B `openai_base_url` loopback no longer fails
  release-authorizing Codex compatibility checks; Desktop Bridge live
  evidence stays optional for direct `npm publish`.

## [9.2.2] - 2026-08-24

### Changed

- `auto` official-models routing now follows the operator's ACTIONS, not just
  the host login. Registering and enabling the codex-lb provider IS choosing
  the gateway: selected models keep running through it — even on a
  ChatGPT-OAuth host — until the provider is un-registered, at which point the
  next bridge start or catalog sync converges bare official models back onto
  the operator's own identity. OpenRouter model picks were already sticky per
  model route and stay that way. Explicit
  `sks bridge route official-models <passthrough|gateway>` pins still beat
  registration in both directions. (This change was staged for 9.2.1, but the
  9.2.1 tarball was published from the pin-persistence commit hours before it
  landed — npm forbids republishing a version, so it ships here.)

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [9.2.1] - 2026-08-23

### Fixed

- A pinned official-models choice actually persists now. Two settings writers
  enumerated the settings keys and silently dropped `official_passthrough`:
  `defaultDesktopBridgeServiceSettings` (every settings rebuild, including
  the very command that sets the pin) and the catalog-sync serializer
  (`serializedSettings`). The effect was that
  `sks bridge route official-models gateway` appeared to work but the choice
  reverted to `auto` on the next rebuild or sync — exactly the durability
  the setting exists to provide, found by post-publish verification on this
  machine (the 9.2.0 sync-written settings file lacked the field). Both
  writers carry the field now, and a regression test round-trips a pinned
  gateway choice through the serializer. Behavior for machines that never
  pinned a choice is unchanged (`auto` was re-defaulted on read anyway).

## [9.2.0] - 2026-08-22

### Added

- Official ChatGPT identity passthrough in the Desktop Bridge. The bridge was
  a pure provider multiplexer: every request had its ChatGPT OAuth
  `Authorization` stripped (and `chatgpt-account-id` dropped) and a substituted
  gateway key attached — so everything bound to the operator's own account on
  the server side broke intermittently. Codex Apps connector calls answered
  "This app connection requires reauthentication" no matter how many times the
  app was re-linked (431 occurrences in this machine's August rollouts), and
  conversation affinity for `previous_response_id` — exactly what a compact
  task depends on — was left to gateway node luck. Requests the route policy
  does not claim for a provider now pass through to the official upstream
  carrying the client's own identity: unknown models, non-Responses
  `backend-api` endpoints (`alpha/search` answered 400 before; it forwards
  now), and WebSocket upgrades with no session pin (501
  `bridge_websocket_route_unresolvable` before; they tunnel now). Official
  error bodies stream back verbatim — quota, plan, and auth detail Codex
  renders natively is no longer redacted away — and transient 5xx on buffered
  Responses bodies still get the fresh-connection replays. Provider routing is
  untouched: an explicitly routed model still gets the provider credential,
  and the two identities can never cross (asserted both ways, tested both
  ways).
- Official-models routing follows the operator's auth automatically, and an
  explicit choice is durable. The default mode is `auto`: on every bridge
  start (which `sks update` triggers via the restage stage and skew
  self-convergence) and every catalog sync, a host signed in with ChatGPT
  OAuth gets its BARE official-family model routes (`gpt-*`, `o*`,
  `codex-mini*`) rewritten to the `openai` identity route — no manual command
  — while a host on gateway/API-key auth stays on the gateway (passthrough
  there would just 401). `sks bridge route official-models
  <passthrough|gateway|auto>` pins the choice: a deliberate `gateway`
  operator is NEVER flipped by an update, sync, or restart, and `passthrough`
  holds even if auth probing fails. Provider-prefixed picks
  (`codex-lb:gpt-5.6-sol`) and SKS-internal models (`codex-auto-review`)
  always keep their gateway route, threads pinned to the gateway before a
  flip are absorbed into passthrough instead of dying with
  `session_pin_route_unavailable`, and the applied flip is persisted to both
  the settings and the route-policy file before serving so session pins and
  status generations stay coherent (log event
  `official_models_auto_applied`).

### Fixed

- The supervised version-skew restart can no longer storm. On 2026-08-19 a
  9.0.6 bridge saw installed 9.1.0, restarted — and launchd brought back 9.0.6
  again, every ~100 seconds, 438 times over 14.5 hours, cutting every
  in-flight turn (compaction turns, the longest-lived requests, first). A skew
  restart now records the exact (running, installed) pair; seeing the same
  pair again within 30 minutes proves restarting cannot converge and is
  suppressed with `action: "suppressed_cooldown"` instead of repeated. A
  genuinely new install on either side restarts immediately.
- Subagent auth write-back no longer discards the newest token rotation. The
  native auth bridge copies ChatGPT OAuth tokens into a private CODEX_HOME for
  every `runCodexTask` subagent and CAS-writes refreshed tokens back; on a
  concurrent host change it previously dropped the refreshed tokens
  unconditionally — and since refresh tokens rotate, dropping the newer
  rotation strands the host on a dead refresh token ("refresh token was
  already used" → forced re-login). The write-back now keeps whichever
  rotation is newest for the same account: host-newer resolves clean
  (`host_newer_kept`), ours-newer retries the CAS once against the fresh host
  state and carries the host's own non-token fields forward.
- `authSemanticIdentityPreserved` now keys on account identity, not bytes. A
  legitimate token refresh during a catalog sync failed the byte-equality
  invariant and aborted the migration — the intermittent `catalog.sync`
  failure the doctor retried around, and with identity passthrough tokens
  refresh routinely. Same mode + same non-null identity fingerprint is
  preservation; an identity change, mode flip, or unverifiable fingerprint
  still blocks, and non-OAuth snapshots keep byte equality.
- Every bridge log record carries a wall-clock `at` timestamp and `started`
  records carry `sks_version`. The August restart-storm forensics had to
  reconstruct a 14.5-hour timeline from serve-state blobs because no rejection,
  skew, or start record had a clock.
- The `desktop-bridge:*` release gates now re-fire when
  `src/core/codex-lb/desktop-bridge/**` changes (they previously fell to the
  default affected-glob of their own check scripts), and the `codex*` gates'
  affected set gains `src/core/codex-lb/**`.
- Ships the three-fresh-replay compact-503 absorber that was committed to main
  after the 9.1.1 publish (the published 9.1.1 artifact replays once; the
  9.1.1 changelog entry above describes the behavior as of this release).

## [9.1.1] - 2026-08-20

### Fixed

- The bridge no longer shows every provider fault as "Upstream request failed",
  and it no longer hands Codex compact a leftover 503 after one miss. Live
  logs from 9.0.5 had 41,199 `404:upstream_error` rows and zero
  `translated_503` rows: the first translation keyed the wrong field, and even
  after 9.0.6 checked either slot it only healed 404. The same gateway
  transient also arrives as 502/503/524, `upstream_request_timeout`, or an
  empty/HTML body. Codex compact treats `unexpected status 503 Service
  Unavailable: Upstream request failed` as fatal and does not honor
  Retry-After, so the bridge now absorbs those failures internally — first
  try plus three fresh-connection replays with short backoff — and only then
  surfaces 503. A 429 stays 429 with `rate_limited` and Retry-After.
  Exhausted transients say `temporary_upstream_failure`; other 4xx/5xx say
  `bridge_upstream_request_failed`. Identifiers still survive; free text still
  dies at the bridge.
- WebSocket upgrade refusals no longer crash the bridge process. A late
  `socket.end` after the client had already gone away raised
  `ERR_STREAM_WRITE_AFTER_END` as an unhandled error and killed every in-flight
  HTTP turn (observed in `desktop-bridge.err.log`). Both upgrade writers now
  swallow socket errors and refuse to write an already-ended stream.
- A days-old official-subagent mission can no longer capture unrelated later
  prompts. Two live bindings did that on this workspace: hook payloads without
  `conversation_id`/`session_id` treated the repo cwd as a named session
  (`8d4e45613309` here), and `inspectActiveOfficialSubagentWorkflow` stayed
  `active` forever when the plan was non-terminal — even with zero child
  threads. Unnamed hooks now load only unowned standalone state, and a
  workflow with no activity for two hours is inactive so the new prompt can
  prepare a fresh run.

### Changed

- `sks update` quarantines OMX/DCodex harness markers itself instead of failing
  the update and asking the user to run `sks conflicts cleanup --yes`.
- `sks update` also removes SKS-owned retired skills from `~/.cursor/skills`
  and `~/.claude/skills`. User-authored skills in those directories are left
  alone, including ones whose names collide with a retired SKS skill.

## [9.1.0] - 2026-08-19

### Added

- `sks codex-app context-1m status|on|off` -- an explicit opt-in for the
  OpenAI-documented 1M-token context window on GPT-5.6 Sol. `on` writes
  `model_context_window = 1000000` and `model_auto_compact_token_limit =
  900000` as top-level keys in `~/.codex/config.toml` (before any `[section]`
  header, exactly the placement the Codex config loader honors), each stamped
  with an inline `# sks-codex-context-1m prev=...` ownership marker that
  records the pre-enable value. `off` restores that previous value -- or
  removes the key when there was none -- and never deletes a value SKS did not
  write. Duplicate key declarations and unparseable values fail closed
  instead of rewriting ambiguous config, and every write goes through the
  guarded CAS config writer with backup and round-trip validation.
- SKS Center gains a "Codex 1M Context" card in Settings. The toggle reads
  its state from `codex-app context-1m status --json` (schema
  `sks.codex-context-1m.v1`), applies changes under the `codex-config`
  guarded-mutation group, and reports exactly what happened to Codex.
- Enabling or disabling restarts Codex Desktop automatically -- but only when
  it is already running (SKS never launches Codex on its own; when Codex is
  closed the change simply applies on its next launch). The restart honors
  `SKS_SKIP_CODEX_APP_RESTART=1` and a `--no-restart` flag, and both surfaces
  state that only new sessions pick up the change.
- The toggle surfaces the documented caveats instead of hiding them: a
  warning when the active model is not `gpt-5.6-sol` (the keys are global and
  not model-aware, so smaller-window models can overflow), and a note that
  requests beyond 272K input tokens bill the entire request at the
  long-context rate.

## [9.0.6] - 2026-08-13

### Fixed

- `sks doctor --fix` from the home directory repairs the bridge again. The
  9.0.2 global-only routing kept the bridge status check but dropped the
  bridge repair, so a stale codex-lb catalog was reported with a
  retry_catalog_sync remedy the run itself never executed -- blocked on every
  re-run. The global-only fix now runs the same catalog repair the project
  fix uses (sync, read-back verify, one retry, stale-runtime restart) and
  reports the post-repair snapshot.
- `sks update` completes from any directory. Since 9.0.2, updating from home
  installed the new package and then failed its own receipt stage, because
  the migration doctor rerouted to global-only and never wrote the
  home-rooted migration receipt. It writes it now, and a new
  desktop-bridge-catalog-repair migration stage clears a stale catalog during
  the update itself -- never failing the update, and naming
  `sks doctor --fix` as a follow-up when the catalog cannot converge. The
  Swift-mirrored operation stage list is untouched.


## [9.0.5] - 2026-08-13

### Fixed

- `sks align run` completes end to end on real workspaces. Under 9.0.4's
  coverage fix a second layer surfaced: extractor caps sized before the
  topology and evidence extractors ever faced real inputs. A 162-gate
  manifest tripped the per-glob match cap 15 times and an 880-entry proof
  bank tripped a 512-entry cap, blocking compile fail-closed. Caps are now
  sized from measurement with stated headroom; an over-wide glob is
  represented whole on the gate node instead of failing the compile; two
  per-gate caps that were breaking silently mid-expansion now fail closed;
  and an honest gate id (gate:secret:preservation) is no longer refused as a
  secret by the evidence guard -- the snapshot lint's structural exemption is
  shared instead of duplicated. A real-scale contract test compiles a fixture
  at or above every measured axis so the next growth is caught in-suite.


## [9.0.4] - 2026-08-13

### Fixed

- `sks align run` works again. 8.4.0 widened align to the topology and
  evidence extractors while the exact-file-coverage invariant stayed keyed to
  the code inventory, and those extractors mint `file` nodes for paths the
  inventory does not hold (gate cache inputs like `package.json` and docs;
  cited `.codex/config.toml` and `AGENTS.md`) -- 26 poison nodes on this
  repository alone, and every align since failed with
  `code_navigation_exact_file_coverage_failed`. On 9.0.x that cascaded: the
  v2 index can only be rebuilt by align, so context search stayed refused.
  File nodes now pass through one inventory-membership choke point per
  extractor family; non-source citations keep their gate metadata and source
  nodes, so nothing is lost from the graph. The invariant was right and is
  untouched; the check also moved left into the extractor and compiler suites.
- The gateway's self-described transient failures stop killing compact tasks.
  hyper-lab wraps its own upstream faults as `type: upstream_error` but
  labels them 404, which Codex treats as permanent -- the "remote compact
  task ... 404" reports after a rate limit. Exactly that self-described
  signature (404 + upstream_error + no specific code) is corrected to 503
  with Retry-After: 10 so Codex retries; a genuine not-found carries a
  different type and passes through untouched.


## [9.0.3] - 2026-08-13

### Fixed

- The bridge stops erasing what the gateway actually said. Upstream error
  bodies are redacted because they can echo request content -- but the
  redaction replaced the whole body, identifiers included, so every upstream
  failure reached the user as the same sentence: "Upstream request failed".
  A gateway saying "response not found" and one saying "rate limited" were
  indistinguishable, and the undiagnosable report was manufactured by the
  bridge itself. Machine-shaped `error.type` and `error.code` identifiers now
  survive into the response body and the bridge log; the free-text message,
  which can carry request content, still dies at the bridge.

### Diagnosed

- The "remote compact task ... 404/502 Upstream request failed" reports that
  follow a rate limit: reproduced against the live gateway -- repeated
  follow-ups on the same `previous_response_id` flip from 200 to persistent
  errors when routing shifts to a gateway node that does not hold the
  conversation. That is a gateway-side conversation-affinity gap (failover
  without sticky routing); with this release the bridge log finally records
  which upstream error code each such failure carried.


## [9.0.2] - 2026-08-13

### Fixed

- `sks doctor --fix` stops rendering skipped checks as failures. The fix
  profile deliberately skips the deep Codex App and harness measurements, but
  the console read the empty results as `degraded`, `missing`,
  `optional_missing` and `unavailable` — a wall of red over checks that never
  ran, which users read as breakage on machines that were fine. Every row fed
  by a skipped source now says `not measured (run: sks doctor --full)`, and a
  measured check that genuinely fails still says so.
- The home directory can no longer become a project root. `~/.sneakoscope` is
  the product's own global state directory, so root discovery treated most
  machines' home as a project the moment a command ran outside a repo: global
  npm installs classified as project-local, init-deep attempted against home,
  the Menu Bar target read dirty on every run and restarted itself, and Codex
  config gained a trusted `[projects."~"]` entry. A marker directly in home is
  now skipped — the 8.6.6 `project_config_is_codex_home_noop` judgment
  extended to discovery itself — and `sks doctor --fix` from home runs the
  global-only repair with a pointer to run project checks from the project.


## [9.0.1] - 2026-08-13

### Fixed

- The bridge no longer executes a quiet WebSocket. An idle timer destroyed the
  upstream after `idle_timeout_ms` (5 minutes by default) of silence, so every
  session where the user read or thought for a while died on a healthy machine
  and Codex flashed its reconnect banner. Liveness on an established tunnel now
  belongs to TCP keepalive, which reaps dead peers without killing
  healthy-but-quiet sessions.
- The bridge converges to the installed package on its own. It is a launchd
  service: upgrading replaces the files on disk and never restarts the process,
  so every bridge fix stayed invisible until someone happened to run
  `doctor --fix` — users kept reporting bugs that were already fixed, and each
  report was true of their running process and false of their installed
  package. A supervised bridge now checks the installed version once a minute
  and, on two consecutive reads of the same newer version, drains in-flight
  work and exits for launchd to relaunch on the new code. `sks update` also
  restarts a stale bridge immediately, as a migration stage.
- An upstream 4xx/5xx is now recorded. A gateway 404 ("Upstream request
  failed", cf-ray attached) passed through with no bridge-side record, so a
  user report holding only a cf-ray id was undiagnosable from the machine that
  produced it; the bridge log now carries status, provider, public model, and
  path — never bodies or secrets.

### Removed

- `contextGraphArtifactPaths`, a helper that never had a caller at any commit
  in its history.


## [9.0.0] - 2026-08-13

The major bump is a binary format break: the context-retrieval index moves to
SKSCG2 format revision 2, and a revision-2 reader does not read a revision-1
index. Nothing needs migrating — the index is a generated cache — but the first
`sks search --mode context` after upgrading will ask for one
`sks align run --rebuild-index`. Every refusal names that command.

### Added

- **Context Retrieval Kernel v2 (CRK2).** `sks search --mode context` and the
  subagent attention path now answer from a compiled binary index — string
  interning, CSR adjacency, a BM25F identifier-aware lexicon, fixed-point
  scoring — instead of parsing a 63 MB JSON snapshot per query. Freshness is
  decided from a 0.5 MB meta record: the preflight that read 64 MB in ~275 ms
  now reads under 2 ms where the parse was the cost, and heap on that path drops
  about 14×. Measured on the paired benchmark (62 cases, real engines), v2
  must-include recall is **0.481 against v1's 0.461** with fewer confidence
  violations (3 vs 10) and zero determinism mismatches.
- `sks search context --changed <path>` (repeatable): tell the kernel which
  files a question is about. Caller-supplied paths become verified seeds; the
  engine never guesses one. Subagent missions feed their declared write scopes
  through the same join, and `SearchRequest.tokenBudget` — documented but read
  by nothing — is now honoured.
- Metadata values keep their type. A boolean an extractor writes reads back as
  a boolean, arrays survive per element (`['a,b','c']` is no longer the same
  value as `['a','b','c']`), and empty arrays stop vanishing.

### Changed

- **BREAKING:** the on-disk context index is format revision 2. A revision-1
  index is refused with `context_index_format_unsupported` and the repair
  command now depends on the direction of the skew: an index older than the
  build says `sks align run --rebuild-index` (the previously unconditional
  `sks update` would have named a command that changes nothing).
- `context-graph.prev.json` is no longer written. It was a byte-identical
  63.66 MB duplicate that no code ever read at any commit in its history; the
  next compile reclaims the leftover copy.
- Caps that truncate an answer now say so. Test selection, gate recommendations
  and the advisor report `*_truncated` reasons and cut in a stated, layout-
  independent order (nearest first) instead of whatever order the index
  happened to store edges in. The kernel reports `query_terms_capped` when a
  long query is cut at 64 terms.

### Fixed

- Subagent worker processes no longer outlive their work. Workers detach into
  their own process group and are torn down tree-wide on exit, timeout, or
  abort; a pre-spawn sweep reaps orphaned and zombie workers first, stale
  heartbeats no longer count as active sessions, and a generation-depth guard
  stops a subagent from spawning subagents of its own.
- The desktop bridge replays a request that died on a stale pooled socket
  (Wi-Fi drop, sleep/wake) on a fresh connection instead of surfacing
  `502 bridge_upstream_unavailable`.
- The verification budget reacts to what actually changed: a run that touched
  release surface finalizes as `release` rather than the `affected` it was
  planned with, and machine feedback runs the runnable related tests instead of
  cutting the list alphabetically before filtering — a cut that deterministically
  kept the tests it could not run, reported ok, and accepted the patch.
- Freshness answers `missing` when the v2 index does not exist — previously a
  workspace arriving from 8.7.0 heard `fresh` from every diagnostic surface
  while holding no index at all.
- The lexicon's secret guard covers joined tokens: a key-shaped string directly
  followed by a file extension was interned whole and searchable while the
  telemetry reported it dropped. Claim prose is likewise guarded against bare
  base62/base64/base64url/hex tokens, JWTs, emails and IPs before it reaches
  index bytes.
- The v2 generation store is gitignored (the v1 protection was hand-added to
  this repository and fresh installs never had it) and excluded from the cache
  key by subtree — publishing an index no longer moves the very key that
  decides whether the workspace is stale.


## [8.7.0] - 2026-08-11

### Fixed

- `sks doctor --fix` can finally clear a stale bridge catalog. Four defects
  compounded into "the fix never fixes it", each one enough on its own:

  - The provider catalog was treated as fresh for **15 minutes**, and nothing
    refreshes it in the background — the running bridge never reads
    `expires_at`, and only an explicit `catalog.sync` rewrites it. Doctor synced
    the catalog, verified it, went green, and a quarter of an hour later the
    same `<provider>_catalog_stale` blocker was back. Freshness is now a named
    12-hour contract that outlives a working session.
  - The repair addressed the wrong home. Every bridge path derives from HOME
    (`<home>/.codex/…`), but the repair passed the project root, so whenever
    doctor ran from inside a project — the common case — it found no managed
    bridge, concluded there was nothing to do, and returned a green check over
    an untouched stale catalog.
  - Doctor reported the bridge snapshot taken *before* the repair transaction.
    A repair that succeeded still printed `Desktop Bridge: blocked` listing the
    blockers it had just cleared, indistinguishable from one that never ran.
  - The repair phase could be skipped as "clean". A catalog lapses with the
    passage of time, which no config hash observes, so the marker written while
    it was fresh made `--fix` skip the repair the user was running it for.

- An inactive provider no longer blocks bridge readiness. Readiness demoted an
  unconfigured provider's problems to `inactive_provider:<id>:<problem>`
  warnings and the combined-catalog aggregate promoted the same facts straight
  back, so one report carried `warning: inactive_provider:openrouter:
  openrouter_credential_missing` beside `blocker: openrouter_credential_missing`.
  Nothing routes to that provider and no `--fix` can invent an API key.

### Removed

- Local LLM support is gone in full: the `with-local-llm` command, the
  `$with-local-llm-on` / `$with-local-llm-off` routes and skills, the Ollama and
  MLX worker backends, the local control-plane adapter, the local worker
  capability card, the `local-llm-real` release-gate resource class, and the
  local-model config at `~/.sneakoscope/local-model.json`. Workers run on Codex
  official backends only, and doctor no longer reports a Local LLM section.

  GPT Final survives with a narrower trigger. It existed because local model
  output was draft material; worktree-derived candidate output still is, so the
  arbiter, its acceptance rule, and the all-pipelines gate remain — the gate is
  now `gpt-final:all-pipelines-required`, driven by a worktree candidate rather
  than a local draft. The local-collaboration policy, its four modes, and the
  "the arbiter must not itself be local" check are removed with the backend
  that gave them meaning.

## [8.6.6] - 2026-08-11

### Fixed

- A bridge restart no longer cuts requests it is carrying. Shutdown destroyed
  every open socket immediately, so anything in flight died mid-request —
  surfacing to the client as `error sending request for url …` or
  `stream disconnected before completion` while the bridge recorded
  `bridge_client_disconnected`, each side blaming the other for a connection
  the restart had cut. A configuration change restarts the service, so this
  fired during ordinary operation, and the longer the request the wider the
  window: a compaction turn is exactly the shape that lost the race. In-flight
  work now gets a bounded grace period before sockets are taken down.

- The catalog repair verifies its own result and retries. It trusted the sync
  command's ok flag and reported a repaired catalog that was still stale. The
  unification migration inside that sync fails intermittently — observed
  failing, with its own rollback also failing, and then succeeding on the very
  next attempt, on two separate machines. The catalog is now read back after
  the sync, a second attempt is made when it is still stale, and a catalog that
  survives both is reported rather than passed.

- A failed unification migration names its cause. It reached the operator as
  two opaque codes while the real error was discarded, so the advertised
  remedy gave no hint whether retrying could help. The failure now carries the
  originating error code; free-form text is never appended, because this
  blocker is rendered to the operator and written to reports.

- One refused WebSocket upgrade produces one log line. The refusal was written
  and logged, then rethrown into the server's own upgrade handler, which
  logged it again under a different status — so a single refusal appeared
  twice, the second line misreporting the outcome.

## [8.6.5] - 2026-08-11

### Fixed

- `sks doctor --fix` restarts a stale Desktop Bridge again. The restart was
  handed the PROJECT root where it needed the home directory, so it looked for
  the bridge under the repository, found nothing, concluded it was not running,
  and silently did nothing — leaving the long-lived launchd service on its
  original code while every report said the repair had run. Measured on a real
  install: a bridge up for 29 hours on pre-8.6.2 code restarted only once the
  home directory was passed. The restart outcome is also carried through the
  stale-catalog branch, which is the common case and previously discarded it.

- The last unlogged bridge error path reports its cause. `writeHttpBridgeError`
  was the fourth error writer in this module and the only one still silent,
  which is why a reported 502 left nothing in the log at all.
  `bridge_upstream_unavailable` is additionally the catch-all
  `safeBridgeErrorCode` returns for anything that is not a bridge error, so it
  names a symptom rather than a cause; the originating socket error code is now
  recorded alongside it (`bridge_upstream_unavailable:ECONNRESET`), and those
  identifiers carry no request data.

- The image route stops recommending a command that cannot fix it.
  `codex_imagegen_real_output_unverified` means no real image output has ever
  been observed, which no `sks doctor` run can satisfy, yet the next action told
  the operator to run `sks doctor --fix --full --yes` — the very command whose
  own output carries that line. It now states the manual step, matching how the
  Computer Use and Chrome review routes already report manual readiness.

## [8.6.4] - 2026-08-11

### Fixed

- The Codex Responses WebSocket is routable at all. An upgrade carries no
  request body and no `x-sks-model` — that header is SKS's own and only its
  probes ever send it — while the HTTP path reads the model from the JSON
  body. The model was therefore always empty here, `model_routes['']` never
  resolved, and every WebSocket upgrade through the bridge failed. It went
  unnoticed because Codex falls back to HTTP and serves the turn anyway, so
  the only visible trace was the `Reconnecting 1/5 … 5/5` banner at the start
  of every conversation. Verified against a live configuration: 16 model
  routes, none keyed by the empty string. A thread's session pin already
  records the provider and model bound to it, which is exactly the routing
  decision the upgrade lacks, so a pinned thread now routes. Another thread's
  pin is never borrowed.

- An unroutable upgrade no longer masquerades as a flaky upstream. A thread
  nothing has bound yet cannot be routed, and that is a permanent property of
  the request, so it is answered `501 Not Implemented` with
  `retryable: false` instead of `502 Bad Gateway` — letting the client fall
  back immediately rather than spending its whole reconnect budget first.

- Bridge WebSocket refusals say what actually happened. Every failure on this
  path was reported as `bridge_websocket_upstream_unavailable`, so the one
  code users ever saw named the one cause usually not responsible, and the
  path wrote nothing to the bridge log. The real code is now returned and
  logged. An idle timeout on an established upstream also destroyed the socket
  with no cause, so a stream that died there reached the client as a bare
  disconnect with nothing naming the bridge as the party that closed it; it
  now carries `bridge_websocket_upstream_idle_timeout`.

## [8.6.3] - 2026-08-11

### Fixed

- `npm publish` fails on a missing login before it builds the tarball, not
  after. The publish preflight verified that the package was built correctly
  but never that it could be uploaded, so a run passed every lifecycle stage
  and then died on the upload. npm answers an unauthorized publish with 404,
  not 401, so an expired token surfaces as `404 Not Found - PUT` — which reads
  as "this package does not exist" rather than "you are logged out", and did
  exactly that on a real release after a 2.7 MB tarball had already been built
  and streamed. Preflight now checks `npm whoami` and package-maintainer
  membership first and names the login step. Only a real upload is gated:
  `npm pack`, `--dry-run`, CI trusted publishing (which has no npm identity)
  and an explicitly offline run all skip it.

- A bridge fix now actually reaches the user. The Desktop Bridge is a
  long-lived launchd service, so upgrading the package replaces the files on
  disk while the running process keeps executing the code it started with —
  which is why 8.6.1's subagent fix appeared not to have landed for anyone who
  upgraded without rebooting the service. Nothing could even detect it: the
  bridge state recorded no version. The serving process now records
  `sks_version`, `desktopBridgeServiceStatus` reports
  `desktop_bridge_runtime_version_stale:<running>:<installed>`, and
  `sks doctor --fix` restarts a stale bridge. A state written by an older
  bridge has no version field and is treated as stale, which is exactly the
  case in the field today.

- Rejected bridge requests are recorded. The bridge emitted a single `started`
  line in its entire lifetime and nothing when it refused a request, so a bridge
  rejecting every request looked identical in the logs to one serving them
  perfectly — diagnosing `bridge_codex_session_identity_mismatch` required
  reading the source. Refusals now log a structured
  `sks.desktop_bridge.rejected` line carrying the error code, transport, method
  and pathname. Never headers, bodies, query strings or credentials: the
  per-client capability segment is redacted, and a rejection storm is capped at
  a small per-code burst followed by a periodic summary, so a reconnect loop
  costs a bounded number of lines.

- `sks doctor` run from the home directory no longer claims the global Codex
  config. The project root is the working directory, so running from `~` made
  `<root>/.codex/config.toml` resolve to `~/.codex/config.toml` — the
  host-owned global config — which the project-config repair then rewrote and,
  since 8.5.0, stamped the SKS ownership marker into. It is now recognised and
  skipped with an operator action naming the real fix: run from a project
  directory. `splitCodexProjectConfigPolicy` already refused this case; the
  guard is now shared.

## [8.6.1] - 2026-08-10

### Fixed

- Subagents run again. The Desktop Bridge required a request's `thread_id` and
  `session_id` to be equal, but they are different identifiers that coincide
  only on a root turn: a spawned agent runs in its own thread inside the
  parent's session, so Codex sends the child's `thread_id` with the session's
  unchanged `session_id`. Every subagent request was therefore rejected with
  `bridge_codex_session_identity_mismatch`, which is why no subagent could
  start and the parent had nothing to fan out to. Codex 0.147's turn metadata
  carries `parent_thread_id`, `parent_turn_id`, `forked_from_thread_id` and
  `subagent_kind` precisely because a thread is not its session; forked and
  resumed threads diverge the same way, and a WebSocket upgrade carries no turn
  metadata to tell them apart. Nothing downstream read `session_id` — both
  callers key the route and the provider pin on `thread_id`, which is correct,
  and giving each spawned thread its own pin is what lets subagents run in
  parallel. Cross-source disagreement about the same field remains a hard
  conflict.

- A decomposed wave is no longer throttled to the pre-decomposition width.
  `wave_capacity` was pinned to `first_wave`, which is computed once before
  decomposition from the requested count and never rewritten, while the target
  was allowed to grow. A parent that decomposed into more independent slices
  than it originally requested ran them a narrow wave at a time and was told
  `subagent_wave_capacity_exceeded` for opening the wider wave its own
  decomposition justified. When the target outgrows the plan the capacity is
  recomputed against the live thread-slot ledger and the configured thread cap;
  a plan whose target never grew keeps its deliberate wave staging, and a real
  slot shortage still throttles.

## [8.6.0] - 2026-08-10

### Fixed

- The doctor idempotence gate can finally observe a non-idempotent repair. It
  compared `changed_files` from two consecutive `doctor --fix` runs, but nothing
  in the pipeline ever emitted that field, so the gate read every run as a clean
  no-op and had never once been able to fail. Each fix phase now reports the
  paths it wrote, the transaction publishes their union, and the gate fails
  closed when the field is absent instead of treating it as "nothing changed".

- `sks doctor --fix` verifies its work against the files on disk. The postcheck
  was a pure function over the transaction object — it restated fields the
  phases had already reported and could only ever agree with them — and it ran
  *before* `mcp_transport_collision` and `codex_native`, two repairs that write
  configs after the transaction closes. Both now feed the doctor verdict, and a
  new `config_disk_verification` re-reads both Codex configs after every mutator,
  confirming they still parse and that the official subagent lane is still on.

- A mission no longer inherits an architecture-map requirement nothing can
  satisfy. `maybeSeedArchitectureMapForPlan` discarded its own result, so a
  project without a compiled context graph got `architecture_map_required: true`
  for a baseline the seed had just declined to write — and the Stop gate could
  then only answer `architecture_map_baseline_missing` forever. The binding is
  now kept only when the baseline was actually sealed, and the plan records the
  seed's own remediation text when it was not. This is the same single-source
  rule the sibling engineering-sanity binding already documents.

## [8.5.0] - 2026-08-10

### Fixed

- Codex-LB session pins survive catalog churn. `policy_generation` digests the
  entire route map, so an unrelated model appearing or a bridge restart
  regenerating the catalog aged every live pin at once and surfaced as an
  intermittent `session_pin_route_unavailable` mid-session. Both resolvers now
  compare a pin against the current route: the thread keeps its provider and is
  re-pinned against the live generations, and the blocker is reserved for a pin
  whose provider or upstream model really would change.

- `sks doctor --fix` can repair a project `.codex/config.toml` again. Ownership
  was proved only by an entry in the gitignored `.sneakoscope/manifest.json`,
  and `configInventoryOwned` re-listed the config only when ownership already
  held — so losing the manifest lost ownership permanently and every later run
  refused with `user_owned_file_without_sks_marker`. Managed writes now stamp
  `# SKS-MANAGED-CODEX-CONFIG` into the file itself, and a config carrying the
  exact managed `[agents]` + `[features.multi_agent_v2]` shape proves its own
  provenance.

- `sks doctor --fix` names why it failed. A blocked run reported `status:
  "blocked"` with an empty top-level `blockers` array and no operator action, so
  it exited 1 saying nothing; the ten conditions behind the verdict are now
  reported individually, and a refused config repair ships the manual step.

- `sks setup` no longer rewrites a project config it has not proved it owns. The
  write bypassed the ownership guard entirely and left user files half-migrated
  in a state `doctor --fix` then declined to touch.

- Machine-local Codex keys are no longer lost between the project and home
  configs. Both guarded writes discarded their results, so a refused home write
  still stripped the keys out of the project config; the home merge now runs
  first and the project rewrite is skipped unless it succeeded.

- `sks doctor --fix` stops deleting live Codex feature flags. Nine of the
  thirteen entries in its removed-flag list — including `computer_use`,
  `guardian_approval`, `plugins`, and `multi_agent` — are still `stable` in
  Codex 0.147, and deleting the line restored Codex's default of `true`,
  silently reversing an explicit `= false`. The list now holds only flags Codex
  reports as `removed` or does not know, pinned against the vendored binary by
  `test/unit/codex-feature-flags.test.mjs`.

- An explicit `multi_agent_v2 = false` is preserved. The boolean form was
  deleted before any ownership or inheritance check and replaced with
  `enabled = true`, reversing an opt-out written by
  `codex features disable multi_agent_v2`.

- A `features.multi_agent_v2` declared as a dotted key, an inline table, or
  under a spaced header no longer voids the whole merge. The rewrite produced a
  TOML redefinition, and the caller silently returned the original text — so
  `[agents]` was never written and the repair reported success having changed
  nothing. Such a declaration is left alone and reported as
  `project_multi_agent_v2_declaration_form_unmanaged`.

- `agents.max_concurrent_threads_per_session` above the ceiling no longer throws
  out of the Codex startup-config repair phase, and values written as `1_6`,
  `0x10`, or `+16` are read instead of being treated as absent and overwritten.

- Stale `[features.multi_agent_v2] max_concurrent_threads_per_session` totals of
  5, 6, and 7 are refreshed like 13 was, instead of staying pinned while the
  `[agents]` key migrated to 256.

- `doctor --fix` re-runs a phase when either Codex config changes. No phase
  hashed the home config and most hashed neither, so a `clean` marker survived
  config corruption and the repair was skipped.

- The Codex startup postcheck fails when the official subagent lane is off,
  instead of reporting `ok: true` with `multi_agent_v2` disabled.

- A write mission is no longer clamped to two workers because its recommended
  roles happen to end in `_reviewer`. The read-only reviewer cap now applies
  only without explicit write intent.

- The fail-closed config ownership guard no longer treats any config mentioning
  `multi_agent` as SKS-managed — `codex features enable multi_agent_v2` writes
  that string.

- Legacy global hook cleanup matches real installations. Its command pattern
  recognised only this repository's `node ./dist/bin/sks.js` form, so it removed
  nothing for every global and project install while still reporting `ok`.

- Managed table writes keep the blank line before the next TOML table. Two
  writers destroyed and re-added it on every pass, so the config never converged
  and each `doctor` run leaked another backup pair.

- The home Codex config stops accumulating provenance comments. Each apply
  appended another `# SKS moved machine-local Codex config …` line and removed
  none; a real home config had reached 58.

## [8.4.0] - 2026-08-09

### Added

- Architecture Map: policy-driven Mermaid projections from the compiled context
  graph, Align publication under `.sneakoscope/wiki/architecture-map/`,
  read-only `sks triwiki atlas-*` inspection, and
  `architecture-map:*` release/confidence gates behind
  `src/scripts/architecture-map-check.ts`.

### Changed

- `npm run release:check:full` runs in roughly half the time (383s → 221s on a
  10-core host): the expensive release inspections are memoized per process on
  content-addressed keys, whole-tree digests reuse a stat fingerprint, the Swift
  latency harness is content-addressed, and the gate cache, cache bridge, and
 …72815 tokens truncated…iew before/after Image Voxel relations and visual wrongness records for bad callouts, stale screenshots, and failed fixes.
- Add Codex memory summary version/rebuild integration for TriWiki/Wrongness generated summaries.
- Add Goal/QA/Research repeated blocker and usage-limit loop stop behavior aligned with Codex 0.132.

### Fixed
- Prevent UX-Review from passing with prose-only screenshot critique.
- Prevent mock gpt-image-2 callout fixtures from being promoted to verified real UX evidence.
- Prevent visual fix claims without post-fix recapture and changed-screen re-review.
- Prevent version drift between package metadata, runtime version, Rust crate version, changelog, and release stamp.

### Changed
- Treat `$UX-Review this screenshot with gpt-image-2 callouts, then fix the issues` as a first-class real execution route.
- Treat source screenshot fidelity and coordinate alignment as release-gated visual evidence requirements.
- Treat Codex 0.132 structured resume output as the preferred path for schema-bound automation artifacts.




## [1.0.7] - 2026-05-20

### Added
- Add Computer Use live evidence capture mode with opt-in real macOS screenshot/action evidence attempts.
- Add Computer Use live evidence schemas for capability probe, screenshot capture, action capture, Image Voxel linkage, and external capability blockers.
- Add codex-lb persistence truthfulness report that distinguishes durable setup from process-only ephemeral setup.
- Add setup plan/apply drift checks that compare requested codex-lb persistence choices with actual filesystem, Keychain, launchctl, and shell profile state.
- Add release readiness report for Computer Use real evidence, codex-lb persistence, hook strict subset, and docs truthfulness.

### Fixed
- Prevent Computer Use smoke from being described as real capture when it only ran a capability probe.
- Prevent codex-lb setup from silently producing process-only credentials without a clear warning.
- Prevent README/docs from overclaiming universal Computer Use availability or live evidence.
- Prevent setup action reports from passing when actual filesystem changes differ from requested setup choices.

### Changed
- Treat Computer Use evidence mode as one of `probe_only`, `live_capture_attempted`, `live_capture_success`, or `live_capture_blocked`.
- Treat codex-lb persistence as explicit: `durable_env_file`, `durable_keychain`, `durable_launchctl`, `shell_profile`, or `process_only_ephemeral`.
- Treat documentation truthfulness as a release invariant.

## [1.0.6] - 2026-05-20

### Added
- Add explicit Codex hook strictness classification: upstream schema, upstream semantic unsupported, SKS zero-warning strict subset, and SKS policy-disallowed.
- Add codex-lb setup plan/preview and exact answer-to-action mapping for default provider selection, env file writing, Keychain storage, launchctl sync, shell profile snippets, and health checks.
- Add optional real macOS Computer Use smoke under `SKS_TEST_REAL_COMPUTER_USE=1` to verify live capability handshake and evidence status when available.
- Add Computer Use live evidence report that distinguishes available, permission missing, Codex App missing, capability missing, external block, and not-macOS.
- Add wrongness records for setup-choice drift and Computer Use live-smoke mismatch.

### Fixed
- Prevent hook validators from overclaiming exact upstream parser mirroring when SKS intentionally enforces a stricter zero-warning subset.
- Prevent codex-lb setup wizard prompts from being ignored.
- Prevent env file, provider selection, launchctl, Keychain, or shell profile writes from happening contrary to the user's explicit setup choices.
- Prevent Computer Use optional live checks from fabricating visual evidence when Codex App or macOS permissions are unavailable.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

### Changed
- Treat codex-lb setup as a two-phase plan/apply workflow.
- Treat Computer Use live evidence as optional real verification, separate from mock-safe route fixtures.

## [1.0.5] - 2026-05-20

### Added
- Add Codex hook semantic validator that mirrors `rust-v0.131.0` runtime parser rules, not just JSON schema.
- Add strict PreToolUse rule enforcement for unsupported `permissionDecision:ask`, `allow` without `updatedInput`, unsupported `continue:false`, `stopReason`, and `suppressOutput`.
- Add Stop/UserPromptSubmit/PostToolUse block output normalization with non-empty reason requirements.
- Add macOS codex-lb env loader metadata, Keychain-aware lookup/storage hooks, launchctl repair visibility, and missing-env regression checks.
- Add raw `CODEX_LB_API_KEY` missing-message regression gate.
- Add Computer Use capability handshake checks, visual route requirement fixture, and external capability block evidence shape.
- Add hook/codex-lb/Computer Use wrongness kinds and avoidance rules for regression learning.

### Fixed
- Prevent hook outputs that pass JSON schema but fail Codex runtime semantic rules.
- Prevent `permissionDecision:ask`, PreToolUse allow-without-rewrite, unsupported universal hook fields, and legacy top-level hook fields from reaching release fixtures.
- Prevent raw codex-lb missing env errors from appearing in status, doctor, health, postinstall, setup fixture, or black-box outputs.
- Prevent SKS from describing Computer Use as blocked by safety policy or MAD-SKS.
- Prevent visual route proof from omitting Computer Use status when image/visual evidence is required.

### Changed
- Treat Codex hook semantic compatibility as stricter than schema compatibility.
- Treat codex-lb readiness as a durable macOS/user-session setup contract.
- Treat Computer Use as the preferred macOS visual verification path when available.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

## [1.0.4] - 2026-05-20

### Added
- Add Codex CLI `rust-v0.131.0` compatibility layer with vendored hook schema snapshots and strict hook output validation.
- Add `sks codex-lb setup` interactive wizard for domain/base URL and API key capture with secure storage and env auto-load.
- Add codex-lb missing-env prevention so macOS users do not see the raw CODEX_LB_API_KEY missing-env text after setup or update.
- Add macOS Codex App Computer Use capability detector and visual-route integration that treats Computer Use as a first-class visual evidence source.
- Add hook warning black-box tests that fail release if Codex hook output produces deprecated-shape or unknown-field warnings.
- Add `sks codex compatibility` and `sks hooks codex-validate` surfaces for checking Codex CLI version, hook schemas, and SKS output shape.

### Fixed
- Replace legacy hook output shapes with Codex `rust-v0.131.0` canonical `hookSpecificOutput` / camelCase output syntax.
- Prevent SKS from misclassifying Codex App Computer Use as a MAD-SKS or generic safety block.
- Prevent codex-lb launch/setup paths from throwing raw missing-env errors when setup can repair or explain the missing key.
- Prevent secrets from being written to proof, logs, screenshots, hook replay, black-box reports, or wrongness memory.

### Changed
- Treat Codex CLI compatibility and hook-schema freshness as release invariants.
- Treat Computer Use availability as a capability check, not an SKS safety policy decision.


## [1.0.3] - 2026-05-19

### Added
- Add `sks git policy|install|status|doctor|precommit|publish-plan|summary` for SKS git collaboration hygiene.
- Add tracked shared-memory policy files: `.sneakoscope/git-policy.json` and `.sneakoscope/shared-memory-manifest.json`.
- Add merge-friendly shared TriWiki shards for claims, wrongness, image voxels, and avoidance rules under `.sneakoscope/wiki/**`.
- Add `sks wiki publish latest --shared`, `sks wrongness publish latest --shared`, `sks wiki rebuild-index --json`, and `sks wiki validate-shared --json`.
- Add release checks for git hygiene, precommit fixtures, shared memory validation, and git collaboration E2E coverage.
- Add Codex App hook trust-state generation for current hook trust syntax so managed hooks are written with matching trusted hashes.

### Fixed
- Replace broad `.sneakoscope/` ignore behavior with runtime-only ignores so shared memory shards can be committed.
- Surface shared wrongness shards in wrongness retrieval even when the local project ledger is missing.
- Add git collaboration status to Trust Kernel reports.

### Changed
- Update managed-path manifest schema to `sks.managed-paths.v2` with explicit shared-memory, generated-index, local-runtime, and harness planes.
- Bump npm package and optional Rust crate metadata to `1.0.3`.


## [1.0.2] - 2026-05-19

### Added
- Add `scripts/check-ts-suppressions.mjs` plus `npm run typecheck:suppressions` intended as a release gate rejecting `@ts-nocheck`, `@ts-ignore`, and unstructured `@ts-expect-error` suppressions outside `src/generated/**`.
- Add `npm run typescript:migration-report` emitting `.sneakoscope/reports/typescript-migration.json` / `.md` with suppression and dist summary counters.
- Add dist build manifest schema `sks.dist-build.v2` (writes package version plus `mjs_runtime_files`; enforced by `dist:check`).
- Tighten `dist:check` to validate manifest schema and manifest `mjs_runtime_files`.

### Fixed
- Add suppression rules and reporting intended to eliminate silent TypeScript escapes before `release:check` can declare a strict-runtime seal complete.
- Refine `command-registry` lazy adapters to narrow unknown module exports via explicit callable guards rather than broad `RawCommandModule` casts.
- Rework CLI `router.ts` normalization with explicit `CommandName` guards plus structured blocked results for unknown commands.
- Rewrite `core/fsx` with typed process execution (`RunProcessOptions` / `RunProcessResult`), `TailBuffer`, and explicit JSON boundary helpers aligned with SKS filesystem utilities.

### Changed
- Bump crate `sks-rs` metadata version to remain aligned with the npm package semver for optional Rust tooling.


## [1.0.1] - 2026-05-19

### Added
- Add a hybrid-free TypeScript runtime: CLI entrypoint, command registry, Trust Kernel, Evidence Router, Completion Proof, Image Voxel, Scouts, and route commands now build from TypeScript source into `dist`.
- Add actual typed runtime command registry used by the CLI, replacing the previous contract-only TypeScript registry plus MJS runtime registry split.
- Add dist-only package verification that blocks copied MJS runtime files and verifies every command registry lazy import from the packed package.
- Add `sks run --execute` and `sks run --auto` route execution modes for safe routes.
- Add TypeScript runtime/schema parity checks for completion proof, evidence records, route contracts, scout outputs, image voxel ledgers, and feature fixtures.

### Fixed
- Remove build-time copying of `src/**/*.mjs` into `dist`.
- Remove the hybrid `TypeScript contracts + MJS runtime` package boundary.
- Fix the missing `1.0.0` changelog lineage and document the 1.0.1 runtime completion.
- Prevent feature quality targets from drifting below RC-level requirements.
- Prevent typed command registry from diverging from actual runtime command registry.

### Changed
- Treat TypeScript-built runtime as a release invariant.
- Treat `.mjs` runtime implementation as legacy-only and excluded from the published package.
- Treat `sks run --execute` as the novice-safe execution path for supported routes.

## [1.0.0] - 2026-05-19

### Added
- Add TypeScript-first architecture for SKS core trust kernel, command registry, route contracts, evidence records, completion proof, Image Voxel ledgers, Scout outputs, and feature fixtures.
- Add generated runtime validators or schema guards for every trust-kernel contract.
- Add packed-package command registry import smoke tests that verify every registered command resolves from the packed tarball.
- Add real black-box matrix coverage for pack install, npx one-shot, global shim, Unicode paths, paths with spaces, no-git directories, and read-only project directories.
- Add `sks run --execute` and `sks run --auto` to run selected routes through route command execution, finalization, proof, trust report, and status.
- Add environment-tiered performance budgets for source, packed, CI, local, and global install modes.
- Add hard architecture gates that fail on internal monolith regressions.

### Fixed
- Prevent package `files` exclusions from breaking command registry imports in packed installs.
- Prevent static-contract feature coverage from masking runtime route verification gaps.
- Prevent architecture warnings from allowing new monoliths.
- Prevent `sks run` from stopping at prepared state when `--execute` is requested.
- Prevent TypeScript type drift between compile-time contracts and runtime JSON artifacts.

### Changed
- Treat TypeScript type safety and runtime schema validation as release invariants.
- Treat packed package command import smoke as mandatory before publish.
- Promote `1.0.0` to the stable npm release target so plain `npm publish` can ship on the `latest` dist-tag.

## [0.9.20] - 2026-05-18

### Added
- Add SKS Trust Kernel invariants that make route completion, evidence, and proof validation a single contract.
- Add core performance budgets for CLI hot paths, proof validation, Image Voxel validation, Scout intake, and feature fixture execution.
- Add route finalization audit tests that prove serious route fixtures write Completion Proof through real command paths.
- Add strict evidence router checks so mock/static evidence cannot be upgraded to verified real evidence.
- Add managed-path rollback and pollution checks for SKS-owned project files.
- Add core dominance documentation covering speed, stability, proof, image memory, black-box install, and known gaps.

### Fixed
- Prevent static contracts from being interpreted as runtime verification by routing route completion through `route-completion-contract.json`, `evidence-index.json`, and `trust-report.json`.
- Prevent stale image/voxel/proof/scout evidence from passing route completion by adding freshness and stale-anchor validation.
- Prevent release checks from passing without trust, evidence, safety, chaos, benchmark, and black-box matrix gates.
- Prevent performance claims without benchmark artifacts by writing `.sneakoscope/reports/performance/core-bench.json` and `.md`.
- Keep release metadata aligned after an explicit SKS version bump advances the package version.

### Changed
- Treat SKS as a core trust kernel rather than a feature-cloning harness.
- Prefer fewer, stronger, release-gated core surfaces over broader unverified feature expansion.
- Expose novice-facing `sks run`, `sks status`, `sks trust`, `sks paths`, `sks rollback`, and `sks bench` surfaces.

## [0.9.19] - 2026-05-18

### Added
- Add real scout output parsing for Codex/tmux scout runs into `sks.scout-result.v1`.
- Add consensus binding that uses parsed real scout outputs as the primary source for `scout-consensus.json`.
- Add tmux lane scout execution with session/window creation, watcher, timeout, output collection, and cleanup.
- Add Codex App subagent capability descriptors so SKS only launches subagents when a real local event/output surface is declared.
- Add black-box packed package tests for npm pack, temp install, npx-style one-shot, and global shim behavior.
- Add pipeline runtime decomposition checks so `pipeline-runtime.mjs` is a small compatibility facade.
- Add stricter feature fixture quality gates that distinguish static contracts from runtime-verified features.
- Add scout speedup benchmark proof that allows speed claims only when parsed real scout outputs and measured baselines exist.

### Fixed
- Prevent real scout engines from claiming success when Codex/tmux output cannot be parsed into scout-result schema.
- Prevent pipeline budget checks from ignoring `pipeline-runtime.mjs`.
- Prevent static feature contracts from being treated as runtime route verification.
- Prevent package publish checks from passing without packed install smoke coverage.

### Changed
- Treat real Scout consensus as an evidence-bound parsed-output contract, not a synthetic fallback.
- Treat packed package behavior as part of the release proof.
- Treat pipeline architecture modularity as a hard release invariant.

## [0.9.18] - 2026-05-18

### Added
- Add real 5-Scout execution engine detection and selection for Codex exec, tmux lanes, Codex App subagents, local static fallback, and sequential fallback.
- Add read-only scout filesystem guards with pre/post source snapshots and mission-local allowed write paths.
- Add hermetic E2E route test roots so route tests no longer share the source checkout `.sneakoscope` state.
- Add strict feature fixture mode that rejects features without explicit fixtures and validates command-generated artifacts only.
- Add strict scout validation mode for release checks.
- Add split pipeline architecture module surfaces for stage policy, scout policy, route prep, stop gate, active context, prompt context, and plan writing.
- Add scout performance evidence v2 with speedup claims allowed only when real parallel execution has a measured sequential baseline.

### Fixed
- Prevent new features from receiving implicit static-pass fixture fallback.
- Prevent the former legacy multi-agent strict validation path from silently creating a passing run during release checks.
- Prevent E2E latest-mission collisions by isolating route tests in temp project roots.
- Prevent scout read-only violations by detecting source changes outside allowed scout artifacts.

### Changed
- Treat Five-Scout intake as real engine-backed when available and as verified-partial fallback otherwise.
- Treat feature fixture pass as explicit, command-generated, schema-validated evidence only.
- Promote pipeline budget, scout engine detection, strict scout checks, and hermetic fixture execution into `npm run release:check`.

## [0.9.17] - 2026-05-18

### Added
- Add `src/core/proof/auto-finalize.mjs` and route fixture integrations so serious route commands write Completion Proof without a separate `sks proof finalize` step.
- Add real-command E2E route tests for Team, QA-LOOP, Research, PPT, Image UX Review, Computer Use, DB, Wiki, and GX.
- Add `sks rust status|smoke --json` with optional native detection, stale-binary version checks, and JS fallback parity evidence.
- Add release scripts `route-modularity:check`, `command-budget:check`, and `feature-fixtures:strict`.

### Changed
- Remove the runtime `src/core/commands/route-cli.mjs` monolith and move route logic into focused `src/core/commands/*-command.mjs` modules.
- Make executable feature fixtures validate artifacts generated by the command run itself, including mission-local proofs, visual ledgers, DB reports, and route gates.
- Promote route modularity, command budget, and strict fixture execution into `npm run release:check`.

### Docs
- Document route finalization, feature fixtures, optional Rust behavior, and the 0.9.17 upgrade report path.

## [0.9.16] - 2026-05-18

### Fixed
- Install generated Codex App skill templates for `$Commit` and `$Commit-And-Push` so updated global setups show the commit routes in the dollar-command picker.
- Add a regression test that every `DOLLAR_SKILL_NAMES` entry is backed by a generated `SKILL.md` template.
- Emit canonical Codex hook command output with `hookSpecificOutput` wrappers and `PreToolUse.permissionDecision=deny` instead of relying on legacy top-level context/block shapes.

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
- Preserve ChatGPT OAuth only as a backup while codex-lb uses `requires_openai_auth = false`; the codex-lb proxy key stays in `CODEX_LB_API_KEY`/`env_key`, and PPT/imagegen bridge checks no longer require OpenAI OAuth for that provider.
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
- Extend the native Computer Use policy text to require `@Computer` or `@AppName` in a fresh Codex App thread when live native Mac/non-web evidence is needed.
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

- Keep the Codex CLI update preflight release-ready after the version hook advanced the package again, including agent prompt auto-approve coverage and the extracted install helper path.

## [0.7.28] - 2026-05-08

### Changed

- Check npm `@openai/codex@latest` before tmux launches, prompt `Y/n` when the installed Codex CLI is missing or outdated, and continue the same launch with the updated binary after approval.
- Treat non-interactive agent runs as auto-approved for SKS update/install prompts, and include that environment flag in generated agent guidance.
- Document the Codex CLI update preflight in the README default tmux runtime flow.

## [0.7.27] - 2026-05-08

### Changed

- Make bare `sks` open or reuse the default tmux Codex CLI workspace, keeping `sks tmux open` as the explicit launch form for session/workspace flags.
- Update CLI help, generated quick reference wording, and README runtime guidance so the default tmux launch surface is discoverable.

## [0.7.26] - 2026-05-08

### Added

- Add a generated agent skill package that lets attached agents enable the shell tool and discover/use SKS workflows from a target repo root.
- Document generated agent setup, config YAML, sandbox note, and useful SKS commands in the README.
- Raise the package file-count budget to 54 for the generated agent helper modules while keeping packed and unpacked byte budgets unchanged.

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

- Add `$Computer-Use` / `$CU` as a maximum-speed Codex Computer Use lane for native Mac/non-web visual tasks, deferring TriWiki refresh/validate and Honest Mode to final closeout while preserving the Computer Use evidence policy.

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

- Historical package-pipeline UI/browser verification used Codex Computer Use-only evidence; current policy supersedes that with Codex Chrome Extension-first web verification while still rejecting Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, and other browser automation as substitutes.

## [0.6.80] - 2026-05-02

### Fixed

- Stop repeating the SKS update prompt after the installed `sks` binary is already at the npm latest version, and clear stale pending update offers before accepting another update response.

## [0.6.79] - 2026-05-02

### Changed

- Historical UI-level QA/E2E verification used Codex Computer Use-only evidence; current policy supersedes that with Codex Chrome Extension-first web verification while still rejecting Chrome MCP, Browser Use, Playwright, and other browser automation as substitutes.

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
