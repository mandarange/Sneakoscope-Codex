# Essential Trust — the SKS 10 verification architecture

## Why

SKS was built when models lied often enough that every completion had to be
policed: an "Honest Mode" section matched by regex before a turn could end, a
completion-proof artifact per route, a reflection gate, a root-cause analysis
triggered by the substring `missing`, evidence ledgers written after every tool
call, skill files whose one-byte drift denied every subsequent tool call until a
human ran `sks doctor --fix`. Two cold Node processes ran on every tool call
(~1 s of pure harness time per call; a 40-call turn paid 19–34 s), and `sks
doctor --full` could never report `ready: true` on a real machine because the
image route's proof was a hardcoded `false` — which kept SKS Center's health
badge permanently orange.

Models no longer need that policing, and the rituals became the product's
largest cost. SKS 10 replaces "prove you are not lying" with "protect the
user's machine and data, and get out of the way".

## The two profiles

| Profile | Default | Meaning |
| --- | --- | --- |
| `essential` | **yes** | Safety gates only. Finished turns finish. Diagnostics report what they measured. |
| `strict` | opt-in | The pre-10 behavior, unchanged, for anyone who still wants the proof rituals. |

Selection, highest precedence first:

1. `SKS_VERIFICATION_PROFILE=essential|strict` in the environment.
2. `<project>/.sneakoscope/verification-profile.json` — `{ "profile": "strict" }`.
3. `<global root>/verification-profile.json` (the global root is `~/.sneakoscope-global`, or `SKS_GLOBAL_ROOT`).
4. Inside the SKS test harness (`NODE_TEST_CONTEXT` / `SKS_TEST_ISOLATION=1`): `strict`, so the existing suite keeps proving the legacy behavior; essential-profile tests ask for `essential` explicitly, and the built-CLI gates run outside the harness.
5. Otherwise `essential`.

The hooks live in the user-level `~/.codex/hooks.json`, so the one thing a
project file cannot change is which tool calls PostToolUse sees: that follows
the environment variable or the global file. A project that wants strict's
per-call PostToolUse evidence sets the profile globally.

The resolver lives in `src/core/verification-profile.ts`; every enforcement
point asks it a specific question (`stopFinalizationRitualsEnforced`,
`managedSkillDigestBlocksEnforced`, `postToolEvidenceEnabled`,
`manualProofRoutesBlockReadiness`, `hookDaemonEnabled`) rather than reading
the profile name, so a future profile can answer each question independently.

## What stays in both profiles — safety

These protect the user's machine, data, and credentials. None of them depends
on trusting the model's prose.

- **DB safety gate** — read-only by default; destructive statements always
  refused; writes only through an active MAD-SKS SQL-plane capability; the
  catastrophic set (`drop database/schema/table`, `truncate`, `delete` without
  `where`, `reset`) cannot be unblocked.
- **Secret handling** — plaintext secrets never enter proofs, logs, or
  evidence; redaction in every writer; the Desktop Bridge never forwards the
  ChatGPT identity to a provider or a provider key to the client.
- **Harness-maintenance guard** — an agent cannot run `sks doctor --fix`,
  `sks setup/init`, or uninstall SKS to escape supervision.
- **Fan-out bounds** — recursion guard, `max_depth = 1`, thread caps. The
  tier-model and bounded-fork rules apply to a Naruto parent's children;
  outside Naruto a `spawn_agent` is Codex's own (OpenRouter Only still limits
  every child to the subagent list).
- **No-question autonomy guards** — interactive commands (`sudo`, `ssh`,
  `read -p` …) refused while an autonomous loop runs.
- **Host-capability allowlists** for desktop-control tools.
- **Loop continuation** and other route mechanics that are about *finishing
  the work*, not about proving honesty.

## What the essential profile drops

| Ritual | Before | Now |
| --- | --- | --- |
| Stop hook Honest Mode / completion-summary wording gate | `decision: block` until the final message contained the right phrases | a finished turn is finished (`essential_profile_stop_accepted`) |
| Honest-gap loopback (two forced retries over a gap regex) | blocked | gone |
| Route completion proof, reflection gate, work-order ledger, root-cause analysis, engineering-sanity / DB-access / architecture-map review artifacts as Stop blockers | blocked | not evaluated at Stop; `sks proof …` commands still work when a user asks |
| PostToolUse evidence hook | one cold process per tool call writing Context7 / subagent / error-taxonomy ledgers | installed only for host-capability (`acas-tools`) and MCP database tools, whose safety lifecycle needs the completed call (the next host-capability step, the MAD-SKS SQL-plane result); no other tool call pays for it, and `sks update` rewrites a stale `*` entry while keeping user-authored hooks |
| Managed-skill digest drift blocks prompts and tool calls | `content_digest_mismatch` denied everything until `sks doctor --fix` | repaired or advised; never a denial |
| Interrupted-tool-output quarantine | every later prompt in the thread was refused until the thread was replaced | only the turn that reports the lost output gets the recovery advice (strict refuses that one turn); the thread continues after recovery (ledger T5) |
| `route-image` manual real-output proof as a doctor blocker | `doctor --full` `ok: false` on every real machine; Center badge orange | a warning (`route:route-image:…`), `ready: true` when the machine is actually healthy |
| "then run Honest Mode" in the managed `AGENTS.md`; `$Honest-Mode` skill described as required | ritual text in every session | plain guidance: state the result, what was verified, what remains — once |
| Proof artifacts seeded into every routed plan | request intake, a repository scan for the code-structure report, engineering-sanity and architecture-map seeds, and completion-proof / reflection / work-order stages in every `$` route plan | not produced; the plan lists only stages essential acts on and ends with "report the result, what was verified, and what remains, once" |
| "Honest Mode" in route context, the language instruction, the Naruto parent summary, and Computer Use / PPT closing steps | injected on every routed turn | strict only |
| Per-tool-call notices and logs | a "tool call inspected" notice on every allowed tool call and a Naruto decision row per hook event | silent unless SKS denies, rewrites, or adds context; only the prompt-time Naruto decision is logged |
| Managed-skill drift at SubagentStart | a "MANDATORY … BLOCK HANDOFF" that stopped the child | the child keeps working; strict still hands off |

## Hooks: warm daemon by default

The hook decision cost was never the checks — it was loading the runtime
(~660 ms of module graph per cold process). `sks hook <event>` now goes through
the per-project `sksd` daemon (`src/core/daemon/`), which evaluates the exact
same `evaluateHookPayloadOnce` in a warm process: ~150 ms per hook instead of
~600 ms, identical decisions, spawn-on-miss, 30-minute idle exit,
`SKS_HOOK_DAEMON=0` to opt out. Because a daemon outlives `sks update`, every
request carries the caller's package version and a mismatch retires the daemon
(`sksd_version_mismatch`) so the next call spawns one on the new code — the
same stale-long-lived-process lesson the Desktop Bridge taught in 9.2.x.

Decisions also read the environment (the recursion guard's `SKS_AGENT_WORKER`,
a standalone Naruto parent's `SKS_NARUTO_PARENT_*`, the profile variable, Jev's
provider key), and a daemon used to answer with the environment of whichever
hook process spawned it. Now the daemon starts without per-process markers, a
caller that carries them evaluates inline, and every request carries a
fingerprint of the decision-relevant environment that the daemon must match
(`sksd_env_mismatch` otherwise, answered inline) — so a daemon decision is the
decision the caller would have made itself.

Per tool call in the essential profile: one PreToolUse hook (~150 ms warm)
instead of PreToolUse + PostToolUse cold (~1 s).

The cold path itself is also kept small, so a daemon miss, `SKS_HOOK_DAEMON=0`,
and the daemon's own start stay cheap. A hook skips the command router, and
`hooks-runtime` loads the route pipeline, the official-subagent lifecycle, the
SubagentStop handler, Jev, and the managed-guidance preflight only on the events
that use them. A PreToolUse hook for a plain shell command loads about 160
modules instead of about 610 (measured on a Linux container: ~580 ms → ~180 ms
cold). Keep it that way: a module PreToolUse imports statically is paid on every
tool call, so route-specific code belongs behind a dynamic `import()`.

## Doctor: measured health, not proof of everything

`ready` means: Codex CLI present and its config readable, managed hooks and
skills current, the Desktop Bridge serving with a reachable upstream (its own
log is read for `bridge_upstream_unavailable` evidence), Menu Bar installed
when a fix attempted it. Capabilities the user has never exercised (image
generation real output, Computer Use OS permissions, the Chrome extension) are
reported as information. The readiness matrix also now reads the bridge
inspection correctly (it previously read the wrapper object and the branch was
dead), so a genuinely blocked bridge fails `core_ready` as it always should
have.

## Release pipeline (maintainer) — unchanged in 10.0.0, simplified next

Publish correctness is still guarded by the load-bearing gates: version truth,
dist freshness, pack receipt, the release-check stamp bound to the commit, the
prepublish preflight (`main`, clean tree, `HEAD == origin/main`), and the
canonical release tests. The ceremony around them — push-guard/receipt rituals,
physical evidence receipts, prose-substring assertions on the release docs — is
slated for the next minor as a `publish` preset; it was left untouched here so
this release ships through a pipeline that has already proven itself.

## Migrating

### Model tiers and runtime cleanup

Standalone Naruto launches default to the latest deep-tier model at the existing
`max` effort. Active Codex tasks keep their selected model, effort, and service
tier. Managed child roles run on tiers: balanced at low effort for instructed
ordinary coding execution, deep at max for planning, analysis, review, and other
judgment, context at medium for context and tool work, and fast at low for tiny
mechanical work. Each tier resolves to the newest model Codex lists for it. Four
task-class profile IDs remain stable as serialized labels, including
`sol_high_implementation`; explicit High effort remains supported.
Model capabilities come from the configured Codex catalog or official
`model/list`, with unavailable metadata reported explicitly. The changes follow
[OpenAI's Astra guidance](https://developers.openai.com/api/docs/guides/latest-model)
on instruction conflicts, autonomy, and proportionate verification.

General work stays with the parent unless independent slices justify delegation.
Generated support skills no longer repeat route activation and full context
policy. PreToolUse validates current skill files without repeating the same
path block. Lightweight plans are actually persisted, pipeline status reads the
calling session, and maintenance Align preserves its active mission.
Align, Wiki validation, and hook preflight share one extractor identity.
Generated packs and maps are excluded from their own source fingerprints;
real source changes still invalidate the index.

Removed the unused V1 dynamic release/cache path, detached scheduler and ledger
helpers, the flagship report-presence proof chain, and synthetic parallel-smoke
marketing evidence. The active V2 release DAG, real agent/worktree execution,
source-backed memory, and safety checks remain. Prescribed release prose and the audit's
1,200-line threshold no longer block checks. Research uses evidence, method, and falsification
reviews; it no longer requires `Eureka!`, historical personas, a genius summary,
or resolution of every minor comment. Material findings, source integrity,
artifact hashes, and bounded review deadlines remain enforced.

These are runtime and instruction changes, not a claim of measured model quality
or token-cost improvement. Updating an installed copy remains a separate action.

Nothing to do. `sks update` converges the managed hooks and `AGENTS.md`
block. To keep the legacy behavior: `sks` reads
`~/.sneakoscope-global/verification-profile.json` — write
`{ "profile": "strict" }` there (or set `SKS_VERIFICATION_PROFILE=strict`).
