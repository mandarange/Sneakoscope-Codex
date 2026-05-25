# Release Parallel Full Coverage 1.18.0

SKS 1.18.0 keeps the 1.17.0 release DAG coverage and adds source intelligence, Goal mode, main no-Scout, worker Scout-limited, agent terminal, tmux lane, visual consistency, and priority closure gates.

The release coverage checker compares a previous gate snapshot against the current DAG and fails on coverage regression. Independent groups are preserved so the release suite can remain parallel without dropping UX/PPT, DFix, MAD-SKS, Hooks, codex-lb, Computer Use, all-feature, blackbox, Rust, perf, and readiness visibility.
