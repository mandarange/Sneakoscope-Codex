# Real Codex Patch Smoke

SKS 1.18.10 adds `agent:real-codex-patch-envelope-smoke` for live Codex patch envelope evidence.

By default the gate writes `agent-real-codex-patch-envelope-smoke.json` as `integration_optional` unless `SKS_TEST_REAL_CODEX_PATCHES=1` is set. When enabled, the smoke checks that `codex exec` supports `--output-schema` and `--output-last-message`, runs a small temp project with two real Codex agents and three files, parses actual `patch_envelopes`, enqueues and applies them, then verifies rollback proof, verification proof, protected-path absence, and process report profile/proxy metadata.

`SKS_REQUIRE_REAL_CODEX_PATCHES=1` turns missing live Codex support into a blocker. Fixture-only fake backend evidence cannot satisfy this gate; artificial live prompts are reported as `fixture_instrumented_real`, while a non-artificial successful live run can report `proven`.
