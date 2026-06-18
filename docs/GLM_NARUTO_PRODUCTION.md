# GLM Naruto Production Contract

Sneakoscope 4.0.11 hardens GLM Naruto around measurable production-runtime boundaries:

- Model lock: every GLM Naruto request uses `z-ai/glm-5.2` with OpenRouter provider fallback disabled.
- Candidate contract: patch workers emit `<sks_patch_candidate>` envelopes; the Naruto candidate gate extracts only the `patch:` unified diff.
- Worker isolation: patch-envelope-only remains explicit, while `--worktree` creates per-worker git worktrees when available or blocks honestly unless `--allow-patch-envelope-fallback` is set.
- Verifier contract: verifier responses are model-guarded and must validate as `sks.glm-naruto-verifier-output.v1`.
- Merge contract: selected patches are scored through `candidate-scoreboard.json`, conflict-checked at hunk level, and combined before one final transaction.
- Apply contract: final workspace mutation is single-threaded and writes `apply-transaction.json` with rollback evidence.
- Stop contract: canonical `sks.stop-gate.v1` is the only stop authority for Naruto-family routes.
- Artifact safety: worker and mission artifacts store request hashes/sizes, not raw secrets, and a JSON key-aware secret audit runs before passing the stop gate.

Use direct GLM for single, obvious local edits. Use GLM Naruto when the task benefits from measured parallel candidates, verifier scoring, conflict-aware selection, and rollback-aware final apply.
