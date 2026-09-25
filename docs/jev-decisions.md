# Jev Decisions (labs, optional, off by default)

`sks decision` is an optional OpenRouter Decisions integration. When enabled,
Jev answers bounded Choice / Noul / Score questions over SKS-supplied evidence.
Trusted TypeScript compiles a valid answer into an existing plan variant or
optional-context selection. There is no advisory mode and no second LLM judge.

## What it is, in one paragraph

Jev owns only the selected semantic judgment over the supplied evidence. SKS
owns permissions, exact lookups, freshness, candidate validity, transaction
consistency, task coverage, and execution. A valid accepted answer is compiled
into an already valid candidate. On timeout, rate limit, malformed data, missing
required uncertainty, or service failure, SKS keeps the deterministic baseline
or reports unavailable. It never calls TypeSafe directly and never asks another
model the same question.

## Modes

| Mode | Effect |
|---|---|
| `off` (default) | No network call, no source hydration solely for Jev, no new mission artifact. Routes keep their baseline. |
| `jev` | After explicit `--consent-cloud`, SKS may send one bounded Decisions request outside the official subagent lifecycle lock. A valid answer is applied before coherent plan/budget/prompt promotion. |

Existing OpenRouter credentials are reused and never rewritten. There is no
local-model decision provider. `sks update` deletes the managed
`~/.sneakoscope/local-decision` runtime (config, virtualenv, snapshots, logs)
and its private socket directory. It does not touch a shared Hugging Face cache.

## Requirements

| Item | Value |
|---|---|
| Credential | Existing OpenRouter key (`OPENROUTER_API_KEY`, `SKS_OPENROUTER_API_KEY`, or the stored SKS OpenRouter secret). There is no Jev-specific secret store. |
| Endpoint | `POST https://openrouter.ai/api/alpha/decisions` (not `/api/v1/...`, not TypeSafe `/v1/systemone`) |
| Model | `typesafe/jev-1.13` |
| Provider policy | `zdr:true`, `data_collection:"deny"`, `allow_fallbacks:false`. SKS never weakens this automatically. |
| Deadline | 1500 ms for the Decisions request, including body consumption; retries 0. Local snapshot work does not consume that budget. A Jev failure keeps the baseline and does not fail preparation. |
| Recovery | Unsupported on this host: no SKS-owned ambiguous-failure handler exists |

## Control Center

The Control Center **Decisions** section (sidebar, `cpu` icon) is a thin front
end over the same commands. Overview **Decisions…** opens that page. Off/Jev
is the live mode switch for official-subagent preparation.

1. **Refresh** runs `decision status --json` (local, non-billable).
2. **Enable Jev…** and the Off/Jev popup ask for cloud consent, then run
   `decision enable --provider openrouter --model typesafe/jev-1.13 --consent-cloud --json`.
   A missing OpenRouter key does not lock the control; add the key in
   **Connections…** or Jev stays on the deterministic baseline.
3. **Disable** runs `decision disable --json`.

When Jev is on and a key is present, eligible Naruto/official preparation may
send one bounded Decisions request (automatic plan variants, including
undecomposed worker-count choices, and optional context). Recovery stays
unsupported.

## Commands

```bash
sks decision status --json
sks decision enable --provider openrouter --model typesafe/jev-1.13 --consent-cloud --json
sks decision disable --json
sks decision probe --json
sks decision evaluate --dataset rows.json --output report.json --json
```

Exit codes: `0` ok, `1` unavailable or failed, `2` usage error.

`status` never calls OpenRouter and never starts a service.
`probe` is an explicit tiny synthetic connectivity request. A 200 response is
connectivity evidence, not SKS task accuracy or a privacy audit.
`evaluate` is replay/reporting only; it is not a production mode.

## What Jev may change

- Optional retrieved excerpts that are already fresh, reproducible, and not
  pinned to the mission write scope.
- When Jev is on, Naruto dynamic roles are routed in that same Decisions
  request. Each role gets a Choice among model tiers, never model names:
  `fast` (low), `balanced` (low), `context` (medium), and `deep` (max), plus a
  difficulty Score and a high-stakes Noul. Code promotes a choice only at
  probability 0.85 and confidence 0.70. The top difficulty level, or a risk
  Noul at or above 0.70, escalates that role to `deep`. Each tier resolves to
  the newest model the Codex models cache lists for it (today `gpt-6-luna`,
  `gpt-6-sol`, `gpt-6-sol`, `gpt-6-astra`), so Jev keeps routing to the latest
  models. Jev off gives each role its own tier. User role preferences on a
  current model stay authoritative.
- An automatic plan variant that already covers every required slice, before
  coherent plan/budget/prompt promotion.
- Each Codex user prompt: one Choice rates the turn. On a turn the Naruto gate
  marks as parent orchestration (a new mission or a continuation), the answer
  is the default child seal. On other turns it is only a reasoning hint. The
  parent model, effort, and service tier always stay as the user set them.
- The same request picks the SKS pipeline for the prompt (answer, implement,
  tiny fix, research, experiment, web search, QA loop, presentation, UX review,
  database, computer use, SEO), with the keyword router's guess as a fact and a
  `keep_baseline` escape. A confident pick replaces the keyword route for that
  prompt only, scoped to the hook call. An explicit `$sks-*` command is never
  re-routed and does not ask for a route. When the custom image model mode is
  on, the request also asks whether the turn makes an image, so the custom-mode
  instruction appears only on image turns.
- `sks imagegen generate`: the aspect ratio and quality the caller left open
  (skipping the ratio when a reference image fixes it). See
  [Image generation](image-generation.md).
- Each unsealed Naruto worker (no plan-time seal, preference, or override):
  Jev rates its task at routing time. A pick the codex-lb catalog does not
  serve is ignored and the task tier stays; it never blocks the worker.
- QA-LOOP effort: after a failed fix attempt, an `escalate` or `hold` Choice
  replaces the two-failure rule, so a failure that needs deeper reasoning
  raises the effort at once and a flaky or environmental one does not.
- Each Naruto `spawn_agent` call: Jev picks the tier at spawn time and SKS
  seals that tier's newest model and effort. When Jev was called but could not
  decide and the parent passed no current model, the child gets its role's own
  tier (deep for an unknown role, with `fork_turns="none"` when absent) instead
  of bouncing off the spawn policy.
- In Jev mode the context and plan decisions always run (derived from the
  mode, not stored flags), a Jev-fixed automatic child count is stated to the
  parent, and the delegation prompt drops its tier rules: the parent reads one
  line saying Jev decides models and efforts, so it spends no time on them.
- A gated parent tool call before the first spawn (see the parent
  orchestration gate in `naruto.md`): one `delegation` Choice between
  `delegate_child`, `parent_owned`, and `keep_baseline`. `parent_owned` means
  orchestration scaffolding that no slice owns (a shared interface stub,
  workspace or build wiring, or a plan file); any feature, fix, or test change
  is slice work however small. Only a confident `parent_owned` (probability
  0.85, confidence 0.70) releases that edit; everything else keeps the
  deterministic spawn-first baseline.

## What Jev may not do

- Change explicit operator or route-owned counts, models, effort, or gates.
- Certify a test, grant a permission, mark a release ready, or authorize a
  destructive side effect.
- Invent a patch, file path, command, capability, or plan absent from the
  candidate set.
- Append natural-language advice for another model to judge.
- Dispatch recovery on this host.

A saved `jev_decision` receipt is not proof that the native Codex host spawned
a child. `native_host_dispatch` stays `unverified`.
