# Real Codex Patch Envelope Contract 1.18.11

Patch envelopes now carry proof-source metadata so fixture output cannot be counted as model-authored Codex work.

Required or supported metadata includes:

- `source`: `fixture`, `model_authored`, `process_generated`, or `tmux_generated`;
- `native_cli_worker_session_id`;
- `native_cli_process_id`;
- `worker_process_id`;
- `backend_child_process_id` when a backend child process exists;
- `fast_mode`;
- `service_tier`;
- `lease_id`;
- `allowed_paths`;
- `strategy_task_id` or `micro_win_id`;
- `verification_node_id`;
- `rollback_node_id`.

Model-authored envelopes must come from Codex `output-last-message` JSON. Synthetic stdout fallback does not satisfy real proof. Fixture envelopes remain valid for hermetic tests, but they are counted separately and never promoted to real Codex parallel execution.
