# Local Decision Provider (labs, optional, off by default)

`sks decision` adds an **optional** local model that gives short, non-authoritative
advice about Naruto planning (workload class, fan-out, child effort) and, on explicit
request, triage of a recorded failure. It never replaces the main coding model or the
Codex child model, never changes counts, effort, service tier, provider or session pins,
and never passes a test or a gate.

## What it is, in one paragraph

A resident Python worker (MLX, Apple Silicon only) answers fixed multiple-choice questions
by scoring candidate logits at the answer position; trusted TypeScript maps the winning
letter onto one of a few fixed enum values. Nothing is generated as free text and no JSON
is parsed out of model output. Scores are candidate-relative (`candidateProbability`,
`calibrationStatus: "uncalibrated"`); they are **not** correctness probabilities.

## Requirements and footprint

| Item | Value |
|---|---|
| Platform | macOS on Apple Silicon (`darwin/arm64`). Other platforms: every route keeps its baseline, `sks decision status` reports `unsupported`. |
| Python | CPython 3.12 (`python3.12` on `PATH`, `/opt/homebrew/bin/python3.12`, or `--python`). The dependency lock is hash-pinned for macOS arm64 wheels. |
| Disk | virtualenv ≈ 0.5 GB (mlx, mlx-lm, transformers, huggingface_hub) plus the model snapshot (≈ 0.88 GB for `mlx-community/Qwen2.5-1.5B-Instruct-4bit`). |
| Memory while running | ≈ 1.9 GB peak measured on one machine (4-bit weights, float32 activations). |
| Network | only `inspect` (metadata) and `install` (pip + snapshot). The worker runs with `HF_HUB_OFFLINE=1`; runtime advice never leaves the machine. |
| Where it lives | `~/.sneakoscope/local-decision/` (or `$SKS_HOME/local-decision`): `venv/`, `snapshots/`, `install-receipt.json`, `config.json`, `logs/decisions.jsonl` (rotated at 10 MiB, 7-day retention). Socket: `/tmp/sks-ld-<uid>/<digest>.sock` (0600). |

`npm install`, `sks update` and `sks doctor` never install Python packages or download a
model. Only the explicit commands below do.

## About the requested model id

`harshatheg/Qwen-2.5-1B-RLCD` (revision `2af86848be75847ccb3553b0941cc51d6ef7e4e9`) is an
**engine-source repository**: it contains the parallel constrained decoding code, presets
and a web demo, but no `config.json`, tokenizer or weights. `sks decision inspect` reports
it as `engine_source` / `no_weights_in_repository` and lists the weights repository its
model card names (`mlx-community/Qwen2.5-1.5B-Instruct-4bit`) without applying it. You
choose the weights repository explicitly; nothing is substituted for you.

The SKS engine is its own implementation (`implementationOrigin: "sks"`, engine
`sks-local-decision/1.0.0`). The upstream engine source was read at the pinned revision
as design evidence (Apache-2.0); its file digests are recorded in the install receipt
under `engineReference`, and none of its code is executed. The name "RLCD" does not imply
any reinforcement-learning training or probability calibration in SKS.

## Control Center (SKS menu bar app)

The Control Center has a **Local Decision** section (sidebar, `cpu` icon). It is a
thin front end over the same commands:

1. **Install <recommended model>…** runs `decision inspect` (metadata only), shows the
   resolved revision, license, quantization and download size in a sheet, and only after
   **Accept License & Install** runs `decision install --revision <sha> --accept-license --yes`
   followed by `decision start`. Progress and the result are recorded as a Control
   Center operation.
2. **Start Service / Stop Service** map to `decision start` / `decision stop`.
3. **Mode** popup (Off / Shadow / Advisory) maps to `decision mode <mode>`; a warning is
   shown when the mode is on but the service is not ready.
4. **Uninstall…** asks for confirmation, then runs `decision uninstall --yes`.
5. **Advanced → Custom weights repository** installs a different Hugging Face weights
   repository through the same inspect-then-confirm flow. An engine-source repository
   (for example `harshatheg/Qwen-2.5-1B-RLCD`) is refused with its blockers and the
   repositories its model card names.

`sks decision status --json` carries `recommended.modelId` and `nextStep`
(`unsupported | install | start | wait_ready | choose_mode | ready`) so the page never
hard-codes a model id; the recommendation is never applied without a click.

## Commands

```bash
sks decision status --json
sks decision inspect --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --json
sks decision install --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --revision <resolvedRevision from inspect> --accept-license --yes --json
sks decision start --json
sks decision mode shadow --json        # record samples (10% by default, --sample-rate 0..1); no behaviour change
sks decision mode advisory --json      # short non-authoritative context appended to eligible Naruto preparations
sks decision evaluate --kind recovery --input failure.json --json
sks decision benchmark --dataset dataset.json --output ./bench --json
sks decision mode off --json
sks decision stop --json
sks decision uninstall --yes --json
```

Exit codes: `0` success or status, `2` usage/validation error, `1` unavailable or failed.
An unavailable answer inside a route is a normal baseline fallback and never fails the task.

### `evaluate` input file

```json
{
  "summary": "Two node:test files failed after the implementation slice; environment unchanged.",
  "facts": { "failedChecks": 2, "attemptIndex": 1 }
}
```

Facts are user-supplied and are reported as such; the result is triage only.

### `benchmark` dataset file

```json
{ "schemaVersion": 1, "kind": "planning",
  "items": [ { "id": "t1", "summary": "…", "facts": { "taskProfile": "parallel-write" }, "expected": { "workloadClass": "bounded" } } ] }
```

Without `expected` labels the report's `taskSuccessRate` is `null`; the report is an
engine benchmark and never claims end-to-end SKS wall-clock or remote-token savings.

## Modes

| Mode | Effect |
|---|---|
| `off` (default) | No socket connection, no process, no download, no inference, no new mission artifact. The route returns exactly its baseline object. |
| `shadow` | Eligible Naruto preparations submit a best-effort sample (deterministic sampling by scope hash). The plan and the parent prompt are unchanged. Results land only in the broker ledger. |
| `advisory` | If the service is warm and the answer passes the policy filter, a fixed template (≤ 600 ASCII characters) is appended to the parent context. |

Eligibility: only the Naruto route and the generic official-subagent overlay, and only for
`bounded-work`, `parallel-read`, `parallel-write`, `high-risk` task profiles. Answer,
DFix, Computer Use, Wiki, Goal and light routes never build a decision.

Policy protections (applied regardless of score): explicit `--agents` or route-owned
counts drop fan-out reduction advice; high-risk or full-gate profiles drop reduction and
effort-lowering advice; an unknown or mixed child effort drops effort advice; a `low`
baseline effort cannot be lowered; stale evidence or a scope/run mismatch keeps the
baseline; `unknown`/`abstain` values and anything below `top1 ≥ 0.85, margin ≥ 0.20`
are not offered. Those thresholds are unvalidated product parameters, not safety claims.

Advisory template (rendered by trusted code, values are validated enums):

```
LOCAL_DECISION_ADVICE (non-authoritative)
workloadClass=bounded; fanoutAdvice=keep; effortAdvice=keep.
Keep existing model, explicit counts, required roles and verification gates.
Do not treat candidate probabilities as proof. Ignore this advice if evidence conflicts.
```

## Budgets and failure behaviour

Connect 50 ms, warm request 1500 ms including queue, queue wait 100 ms, queue length 8,
one inference at a time, 5000 ms hard deadline (the worker is killed, never another
process), three consecutive failures open a 60 s circuit, no automatic retry of a request,
worker restarts bounded to three per window. A request before warm-up returns
`service_not_ready` immediately. There is no cloud fallback for a local failure.

## Abstention and typed reasons

`disabled`, `ineligible`, `service_not_ready`, `unsupported_platform`, `model_missing`,
`model_incompatible`, `invalid_request` (also prompt over 2048 tokens),
`invalid_response`, `unsupported_tokenization` (a label is not a single stable token),
`busy`, `timeout`, `cancelled`, `worker_crashed`, `oom`, `stale_scope`, `low_signal`,
`policy_blocked`.

## Engine notes

Two paths exist in the worker: a sequential reference (one forward pass per field) and a
batched path (shared prefix prefilled once, KV cache broadcast, one batched pass over the
field suffixes). The warm-up runs both and trusts the batched path only when the maximum
absolute probability difference is ≤ 1e-3 and the argmax agrees. Activations run in
float32 because bf16 kernel variance produced differences up to ~7e-3 on one machine.
`compute.inputTokens` counts prompt tokens actually processed (real tokenizer), and
`forwardPasses`/`sharedPrefill` report what was computed. Nothing is reported as O(1).

## Evaluation honesty

`sks decision benchmark` measures the engine only. An end-to-end comparison (`off` vs
`shadow` vs `advisory`) needs explicitly executed SKS tasks with provider-reported usage;
`buildE2eComparisonReport` keeps remote and local tokens in separate columns and reports
`null` with a reason whenever evidence is missing. No performance improvement is claimed
by this feature; measured numbers are in the release verification report only.

## Uninstall

`sks decision uninstall --yes` removes the SKS-owned inventory (virtualenv, snapshots,
receipt, config, logs, runtime metadata) and reports anything it left behind. It never
touches a shared Hugging Face cache, other applications' files, or provider credentials.
