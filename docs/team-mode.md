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
sks team "wide change" executor:8 reviewer:5
sks agent run "team slice map" --agents 8 --concurrency 4 --mock --json
```

The parent orchestrator assigns effort from the slice risk: simple read-only lanes can stay low, orchestration/tooling lanes use medium, safety/DB/schema/release lanes use high, and frontier/forensic work can use xhigh. Blockers, lease conflicts, schema failures, and proof gaps can escalate a lane without raising every other lane.

## Native Agent Policy

Team mode must use native agent proof artifacts for analysis, execution handoff, verification, and closeout. Removed legacy multi-agent artifacts do not satisfy Team gates.
