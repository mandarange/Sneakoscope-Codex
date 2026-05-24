# Research Mode

SKS 1.16.0 models Research and AutoResearch as native agent slices recorded through the central agent ledger.

## Native Research Agents

Research runs use native personas for source mining, skeptical review, synthesis, verification, and integration. These workers communicate through `.sneakoscope/missions/<id>/agents/agent-events.jsonl`, `agent-messages.jsonl`, task board files, leases, and proof evidence.

Research status reports native agent sessions and proof state. `agent-ledger.json` is the primary route-local research ledger for 1.16.0 research.

## AutoResearch

AutoResearch cycles inherit the same policy: no removed legacy multi-agent backend, no recursive `sks research run` from agent workers, and no final proof until native agent evidence passes.

## 1.16.1 Runtime Closure

SKS 1.16.1 routes release-critical Team, Research, QA, and native agent proof checks through the native agent orchestrator, Codex exec output-last-message parsing, central ledger proof, and no-scout runtime gates.
