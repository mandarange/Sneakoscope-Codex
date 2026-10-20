# Goal Runtime Migration

SKS 3.1.0 temporarily compiled `sks goal` requests into SKS-owned Loop Graphs and wrote `goal-compat.json`. That runtime is historical and is not a supported execution path in SKS.

Codex native `/goal` is now the only persisted goal owner, and SKS ships no goal command: the `$sks-goal` skill expands a request into a detailed native `/goal` (outcome, scope, constraints, verification, done-when, stop conditions, non-goals) and creates no SKS mission, compatibility artifact, loop, or fallback state. The former stateless `sks goal` helper only printed that command and was removed. Implementation work continues through the selected SKS execution route rather than through a Goal-owned runtime.

Treat existing `goal-compat.json` and legacy Goal mission state as non-authoritative historical artifacts.
