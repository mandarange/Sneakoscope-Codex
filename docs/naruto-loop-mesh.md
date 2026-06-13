# Naruto Loop Mesh

Naruto Loop Mesh runs a Loop Graph through bounded mini swarms instead of one oversized pipeline. Each loop receives maker workers, checker workers, loop-local gates, and a shared global active-worker budget so independent loops can move concurrently without overloading the host.

The Loop Graph remains the execution SSOT while Naruto supplies the hardware-safe worker mesh for each node.

Maker workers produce patch candidates inside the owner scope. Checker workers are fresh and separate from makers, and high-risk loops require a stronger checker policy. Integration reserves workers for merge, final gates, and GPT final arbiter review.

Worker prompts include loop purpose, owner files, allowed directories, selected gates, state file, budget, and collision policy. Workers are not allowed to mutate outside owner scope.

## Production Budget And Proof

In 3.1.2, Naruto Loop Mesh consumes the Loop concurrency budget instead of merely reporting an advisory worker split. `naruto-loop-worker-routes.json` includes both the Naruto active-worker budget and the loop concurrency budget so reviewers can compare planned parallelism with actual worker/session handles.

Active maker/checker workers register loop handles with loop id, phase, worker id, session id, pid, start time, interrupt support, and status. This gives Loop kill/resume a concrete process/session target and gives `sks loop status latest` a live active-worker view.

The final graph proof now carries integration merge strategy summary, side-effect report status, and GPT final arbiter contract fields. A passing production Loop Mesh proof therefore means real gates executed, worktree merge strategy ran, side effects were scanned, final arbitration was finalizer-owned, and no production fixture misuse was accepted.
