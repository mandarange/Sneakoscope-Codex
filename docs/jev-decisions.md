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
- An automatic plan variant that already covers every required slice, before
  coherent plan/budget/prompt promotion.

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
