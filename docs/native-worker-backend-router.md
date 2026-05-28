# Native Worker Backend Router 1.18.11

`runNativeCliWorker` now delegates backend execution to the Real Worker Backend Router instead of generating fixture patch envelopes directly.

The router writes `worker-backend-router-report.json` with:

- selected backend;
- worker process id;
- backend child process ids;
- output-last-message path when the Codex backend is selected;
- patch envelope count;
- proof level;
- fast mode and service tier;
- blockers.

Backend behavior:

- `fake`: fixture-only patch envelopes marked `source: "fixture"`.
- `process`: launches an actual child process and emits `source: "process_generated"` patch envelopes for leased write paths.
- `codex-exec`: uses the worker-safe Codex exec adapter, `--output-schema`, `--output-last-message`, and `--skip-git-repo-check`; model-authored envelopes are marked `source: "model_authored"`.
- `tmux`: delegates to the tmux backend and records lane child proof where available.

Unknown backend names block the worker. Write-capable tasks without patch envelopes produce a no-patch reason artifact and a blocker unless the task is read-only or explicitly no-op.
