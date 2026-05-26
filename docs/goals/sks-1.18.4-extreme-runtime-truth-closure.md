# SKS 1.18.4 Extreme Runtime Truth Closure

Goal payload for the 1.18.4 runtime-truth closure.

- [x] Version metadata targets 1.18.4.
- [x] Real tmux physical pane proof is implemented with list-panes, capture-pane, reconciliation, and drain-close artifacts.
- [x] Real Codex dynamic smoke is implemented as opt-in `SKS_TEST_REAL_DYNAMIC_AGENTS=1` evidence.
- [x] `sks agent close/cleanup` calls an executor and writes cleanup proof.
- [x] Intelligent work graph artifacts are generated from source/test/dependency ownership.
- [x] Fake-vs-real proof policy separates fixture, proven, integration-optional, and blocked evidence.
- [x] Release gates include cleanup, intelligent work graph, fake-vs-real policy, route blackbox realism, and real-check smoke surfaces.
