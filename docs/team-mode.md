# Team Mode

SKS 1.16.0 routes Team collaboration through the Native Multi-Session Agent Kernel. The legacy multi-agent backend and command surface have been removed from Team execution.

## Native Agent Backend

`sks team` builds a Team mission, records the plan with native agent phase names, and resolves completion evidence from `.sneakoscope/missions/<id>/agents/agent-proof-evidence.json`.

Team mode uses:

- default 5 native agents with a maximum of 20;
- central agent records under `agents/`;
- dynamic per-agent effort records in `agents/agent-effort-policy.json`;
- non-recursive worker rules from `AGENT_WORKER_PIPELINE`;
- exclusive write leases and no-overlap proof before final proof;
- finalization only after every agent session is closed.

Manual scaling is explicit and bounded:

```sh
sks team "wide change" --agents 8
sks team "wide change" 20:agents
sks team "wide change" executor:8 reviewer:5
sks agent run "team slice map" --agents 8 --concurrency 4 --mock --json
```

Codex App prompts can request the same Team width without CLI flags by including `N:agents` or `N:agent` in `$Team` text, for example `$Team 20:agents migrate the route`. The Team parser removes the budget token from the task text, sets the Team bundle size and session budget to `N`, and caps it at the native kernel maximum of 20.

The parent orchestrator assigns effort from the slice risk: simple read-only lanes can stay low, orchestration/tooling lanes use medium, safety/DB/schema/release lanes use high, and frontier/forensic work can use xhigh. Blockers, lease conflicts, schema failures, and proof gaps can escalate a lane without raising every other lane.

## Native Agent Policy

Team mode must use native agent proof artifacts for analysis, execution handoff, verification, and closeout. Removed legacy multi-agent artifacts do not satisfy Team gates.

## 1.16.1 Runtime Closure

SKS 1.16.1 routes release-critical Team, Research, QA, and native agent proof checks through the native agent orchestrator, Codex exec output-last-message parsing, central ledger proof, and no-scout runtime gates.

SKS 1.16.2 adds prompt-side `N:agents` / `N:agent` Team width control for Codex App text prompts while preserving the native runtime closure.
