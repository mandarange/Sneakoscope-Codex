# Goal To Loop Migration

In SKS 3.1.0, `sks goal "<request>"` compiles the goal into a Loop Graph by default. The goal remains the user intent and continuation surface, while the Loop Graph becomes the execution SSOT.

Each goal mission writes `goal-compat.json` with the legacy goal text, loop plan path, loop graph proof path, runtime `loop-graph`, and compat mode. Existing goal artifacts can continue to exist, but execution proof now references loop proof.

The temporary escape hatch is `sks goal "<request>" --legacy-goal-runtime` or `SKS_LEGACY_GOAL_RUNTIME=1`. This keeps old behavior available while the default moves to loop runtime.
