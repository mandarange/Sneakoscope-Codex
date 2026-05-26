# Fake vs Real Proof Policy 1.18.5

SKS 1.18.5 uses `sks.fake-real-proof-policy.v2` to keep fixture evidence, fixture-instrumented real evidence, proven runtime evidence, optional live smoke evidence, and required-real blockers separate.

Proof levels:

- `fixture_only`: hermetic mock/fake evidence is useful for release:check but cannot support real runtime claims.
- `fixture_instrumented_real`: a real backend was used, but fixture delay or harness instrumentation shaped the run, so it is not reported as plain proven.
- `proven`: real runtime evidence exists, such as physical tmux pane evidence or real Codex output-schema result files.
- `integration_optional`: the live runtime smoke was not requested or unavailable, and no fake evidence was promoted.
- `real_required_missing`: `SKS_REQUIRE_REAL_DYNAMIC_AGENTS=1` or `SKS_REQUIRE_REAL_TMUX=1` was set, but the required real runtime proof was unavailable.
- `partial`: a subsystem has honest partial evidence, such as work graph quality below the proven threshold.
- `blocked`: a fake backend claimed real execution, a real tmux proof lacked physical pane evidence, or a route stand-in was used for a non-agent route.

The policy is written as `fake-real-proof-policy.json` next to agent proof. Trust and release readiness summaries surface subsystem proof levels for backend, tmux physical proof, Codex dynamic smoke, cleanup, and work graph independently.
