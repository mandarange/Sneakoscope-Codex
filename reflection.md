# Post Route Reflection

## 2026-06-12 SKS 3.1.0 Naruto Loop Mesh Reflection

- Mission: M-20260612-165947-17a6
- Route: Naruto with parent-owned integration
- Outcome: Implemented the 3.1.0 Naruto Loop Mesh directive and verified the new loop/goal/naruto/docs/release gates.

### Summary

The directive required a dynamic Loop Graph runtime, loop-local state/proof artifacts, owner leases, affected gate selection, Naruto loop mesh routing, `sks loop` CLI, goal-to-loop default compatibility, docs, schema files, and 3.1.0 release metadata. The implementation added these surfaces and wired them into package scripts and `release-gates.v2.json`.

### Evidence

- `npm run build --silent` passed.
- `npm run release:version-truth --silent` passed for 3.1.0 with zero warnings.
- 32 new loop/naruto/goal/docs/release DAG scripts passed as a focused batch.
- `npm run release:metadata --silent` passed after loopback doc/Rust version fixes.
- `npm run release:check --silent` passed: 80 selected gates, 80 pass, 0 fail.
- `sks wiki validate .sneakoscope/wiki/context-pack.json` passed with 32/32 trust anchors.

### Lessons

1. Release metadata can catch version surfaces that focused version truth misses, especially versioned docs and the Rust helper display string.
2. A helper `$Naruto` live session that is interrupted or produces no native-session proof must not be promoted to final evidence; parent-owned release and focused gate proof should be reported separately.
3. Large directive closeout should rerun the affected release wrapper after the last doc/version loopback, because readiness can transition from metadata failure to pass only after the final source edit.

- Mission: SKS 1.18.11 Real Codex Parallel + Warp/Tmux Right-Lane closure
- Route: Team with MAD authorization and native goal continuation
- Reflected at: 2026-05-28T14:55:00Z
- Outcome: Completed with release gates passing and the source directive checklist closed.

## Summary

The original directive required real native worker backend routing, Codex child process overlap proof, model-authored patch envelope proof, Warp/tmux right-lane layout evidence, Fast mode propagation, release/readiness integration, documentation, and checkbox closure.

The earlier hard-blocked state is superseded. The implementation now includes backend routing for fake/process/codex-exec/tmux, a worker-safe Codex exec adapter, strict patch envelope provenance fields, real Codex parallel proof for 5/10/20 workers, right-lane coordinate/content/attach gates, runtime truth/readiness rows, and release metadata for 1.18.11. The original directive file was updated from 5,874 unchecked boxes to 5,874 checked boxes with zero unchecked boxes remaining.

## Evidence

- `npm run release:check` passed and refreshed `.sneakoscope/reports/release-check-stamp.json`.
- `npm run release:readiness --silent` passed with `remaining_p0_gaps: []`.
- Real Codex parallel worker reports passed for 5, 10, and 20 workers with `proof_level: proven`, matching native worker and Codex child counts, and zero fixture patch envelopes.
- New P0 gates passed for worker backend routing, Codex child overlap, model-authored patch envelopes, Warp/tmux physical UI, coordinate proof, content proof, MAD attach proof, and Fast mode propagation.
- `sks versioning status --json` reported package/runtime version parity at `1.18.11` and no pre-commit hook installation.

## Lessons

1. For large directive checklists, run the release wrapper and readiness after all loopback fixes before checking the original document.
2. Codex real-parallel proof must distinguish native worker PIDs, Codex child PIDs, model-authored patch envelopes, and fixture envelopes.
3. Structured output schemas for Codex exec need strict required fields at every nested object, or real worker calls fail after the process proof looks healthy.
4. Release fixture commands can move the active mission pointer; final summaries should cite concrete report files and command results rather than relying on `latest`.

## 2026-06-04 Local Ollama Hybrid Toggle Reflection

- Mission: M-20260604-160801-bcd4
- Route: Team
- Outcome: Completed targeted hybrid local-model routing repair.
- Issue recorded: The stored disabled local-model config made one-off explicit local backend activation behave like a hard blocker. The fix keeps default/off behavior intact while allowing explicit run activation, and preserves `SKS_OLLAMA_WORKERS=0` as the hard force-off.
- Verification: `npm run build --silent`; `node --test test/unit/ollama-worker-config.test.mjs test/unit/native-worker-backend-router.test.mjs test/unit/agent-command-surface.test.mjs test/unit/team-agent-prompt-spec.test.mjs`; `node dist/bin/sks.js wiki validate .sneakoscope/wiki/context-pack.json`.

## 2026-06-07 Qwen3.6 MTP Local Server Reflection

- Mission: M-20260607-220643-6671
- Route: Team
- Outcome: Completed local MTP runtime activation through `llama-server`.
- Issue recorded: Ollama 0.30.4 could host the GGUF but did not expose an MTP/speculative decoding flag, so enabling MTP required switching SKS to an OpenAI-compatible `llama-server` endpoint with `--spec-type draft-mtp`.
- Verification: `launchctl` service state checked for `com.sneakoscope.llama-server-qwen36-mtp`; `llama-server` stderr contained `adding speculative implementation 'draft-mtp'`, `speculative decoding context initialized`, and `thinking = 0`; `/v1/chat/completions` returned `READY`; `sks with-local-llm status --json` reported `status: verified`.
