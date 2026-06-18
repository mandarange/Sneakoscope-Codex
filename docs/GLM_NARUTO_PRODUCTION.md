# GLM Naruto Production Contract

Sneakoscope 4.0.10 hardens GLM Naruto around deterministic boundaries:

- Model lock: every GLM Naruto request uses `z-ai/glm-5.2` with OpenRouter provider fallback disabled.
- Candidate contract: patch workers emit `<sks_patch_candidate>` envelopes; the Naruto candidate gate extracts only the `patch:` unified diff.
- Worker isolation: workers produce patch envelopes and artifacts; final workspace mutation is single-threaded after deterministic gates.
- Verifier contract: verifier responses are model-guarded and must validate as `sks.glm-naruto-verifier-output.v1`.
- Merge contract: selected patches are conflict-checked at hunk level and combined before one final `git apply --check`.
- Stop contract: canonical `sks.stop-gate.v1` is the only stop authority for Naruto-family routes.
- Artifact safety: worker artifacts store request hashes/sizes, not raw secrets, and a secret audit runs before passing the stop gate.

`--worktree` must not silently pretend to isolate writes. The accepted default is patch-envelope-only isolation; unimplemented worktree behavior must block honestly.
