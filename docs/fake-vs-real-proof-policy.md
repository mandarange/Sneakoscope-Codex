# Fake vs Real Proof Policy 1.18.4

SKS 1.18.4 uses `sks.fake-real-proof-policy.v1` to keep fixture evidence, real runtime evidence, and optional live smoke evidence separate.

Proof levels:

- `fixture_only`: hermetic mock/fake evidence is useful for release:check but cannot support real runtime claims.
- `proven`: real runtime evidence exists, such as physical tmux pane evidence or real Codex output-schema result files.
- `integration_optional`: the live runtime smoke was not requested or unavailable, and no fake evidence was promoted.
- `blocked`: a fake backend claimed real execution, a real tmux proof lacked physical pane evidence, or a route stand-in was used for a non-agent route.

The policy is written as `fake-real-proof-policy.json` next to agent proof. Trust and release readiness summaries surface fake, real, and integration-optional status independently.
