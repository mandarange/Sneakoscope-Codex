# Naruto Loop Mesh

Naruto Loop Mesh runs a Loop Graph through bounded mini swarms instead of one oversized pipeline. Each loop receives maker workers, checker workers, loop-local gates, and a shared global active-worker budget so independent loops can move concurrently without overloading the host.

The Loop Graph remains the execution SSOT while Naruto supplies the hardware-safe worker mesh for each node.

Maker workers produce patch candidates inside the owner scope. Checker workers are fresh and separate from makers, and high-risk loops require a stronger checker policy. Integration reserves workers for merge, final gates, and GPT final arbiter review.

Worker prompts include loop purpose, owner files, allowed directories, selected gates, state file, budget, and collision policy. Workers are not allowed to mutate outside owner scope.
