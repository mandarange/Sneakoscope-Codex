# Main No-Scout / Worker Scout-Limited Policy 1.18.0

SKS 1.18.0 separates orchestration proof from worker-local exploration.

SKS 1.18.2 keeps that separation for replenished worker slots: the main scheduler owns queue/backfill proof, while each session generation records only its scoped worker evidence.

SKS 1.18.2 allows worker-local Scout evidence to justify schema-bound `follow_up_work_items`, but those items still flow through the main scheduler and never become the proof SSOT.

SKS 1.18.3 route-truth backfill gates keep Team, Research, and QA on their actual command surfaces while preserving this split: the main scheduler owns task graph, queue, and proof reconciliation, while worker Scout remains local evidence only.

| Scope | Scout Allowed | Proof Role |
| --- | --- | --- |
| Main orchestrator | no | Blocks release if detected |
| Team/Research/QA main | no | Blocks route proof if detected |
| Agent worker session | yes, local only | Optional local evidence only |

Worker Scout evidence must stay under `agents/sessions/<agent_id>/worker-scout/`. It cannot write a mission-root `scout-ledger.json`, cannot create global Scout consensus, and cannot satisfy the central native-agent backend gate. The central proof SSOT remains `agents/agent-proof-evidence.json`.
