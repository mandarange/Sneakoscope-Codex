# Loop Fixture Policy

Loop fixtures are test infrastructure, not production behavior.

Allowed contexts:

- release check or blackbox scripts under `dist/scripts` or `src/scripts`;
- `M-check-*` missions;
- project roots under the OS temp directory;
- `NODE_ENV=test` or `SKS_TEST_RUNTIME_FIXTURE_ALLOWED=1`.

Forbidden contexts:

- real project roots with ordinary mission ids;
- production command paths such as `sks loop run`, `sks goal`, and `sks naruto`;
- `SKS_LOOP_GATE_FIXTURE=1`, `SKS_LOOP_RUNTIME_FIXTURE=1`, or `SKS_LOOP_GPT_FINAL_FIXTURE=1` without an allowed reason.

Every fixture decision uses `sks.loop-fixture-policy-decision.v1` and records `allowed`, `mode`, `requested`, `production_like`, `reason`, and blockers. Gate and worker artifacts include `fixture_policy` plus `fixture_allowed_reason`; production misuse fails with blockers such as `loop_gate_fixture_forbidden_in_production` instead of synthetic-passing.

`gpt:final-arbiter` fixture verdicts are guarded by the same policy. Forced approve/reject is allowed in release checks and blackboxes, but production final arbitration cannot be fake-approved.
