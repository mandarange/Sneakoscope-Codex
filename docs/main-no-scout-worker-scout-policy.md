# Main No-Scout / Worker Scout-Limited Policy 1.18.0

SKS 1.18.0 separates orchestration proof from worker-local exploration.

| Scope | Scout Allowed | Proof Role |
| --- | --- | --- |
| Main orchestrator | no | Blocks release if detected |
| Team/Research/QA main | no | Blocks route proof if detected |
| Agent worker session | yes, local only | Optional local evidence only |

Worker Scout evidence must stay under `agents/sessions/<agent_id>/worker-scout/`. It cannot write a mission-root `scout-ledger.json`, cannot create global Scout consensus, and cannot satisfy the central native-agent backend gate. The central proof SSOT remains `agents/agent-proof-evidence.json`.
