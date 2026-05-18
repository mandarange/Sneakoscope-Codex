# Feature Fixtures

`sks all-features selftest --mock --execute-fixtures --strict-artifacts --json` promotes the feature registry from metadata-only coverage into release-gated mock/static fixture validation. `npm run feature-fixtures:strict` is the release script wrapper.

The fixture gate checks:

- every feature has a fixture contract;
- mock/static fixtures have commands;
- deterministic safe allowlist commands execute successfully;
- expected artifacts are declared as arrays;
- every feature has an explicit fixture; unknown features return `missing` instead of implicit static pass;
- fixture quality is recorded as `runtime_verified`, `runtime_mock_verified`, `integration_optional`, `static_contract`, or `missing`;
- runtime route features cannot be `static_contract`;
- runtime fixtures default to `hermetic_temp_project` roots unless explicitly marked `source_checkout_required`;
- expected artifacts are resolved from the mission id emitted by the command output, not from placeholder materialization;
- fixture pass count is at least 90;
- `not_required` count is at most 16;
- mock fixture blocked count is zero;
- expected artifacts exist where the command generated them and expose declared schemas or route gate pass fields.
- `cli-scouts` executes `sks scouts run latest --engine local-static --mock --json` and validates `scout-team-plan.json`, `scout-consensus.json`, `scout-handoff.md`, `scout-gate.json`, and `scout-engine-result.json`.
- all-features selftest checks `five_scout_intake_contract_present`, `scout_gate_fixture_pass`, `scout_proof_evidence_contract_present`, and `scout_read_only_policy_present`.

External dependency routes remain honest: a mock fixture can pass while the real dependency path remains `blocked`, `not_verified`, or `verified_partial` until real evidence exists.

## Quality Boundary

- `runtime_verified`: actual command executed and generated artifacts validated.
- `runtime_mock_verified`: mock route command executed and generated artifacts validated.
- `integration_optional`: real dependency may be absent, but a blocker is recorded.
- `static_contract`: docs/skill/manifest-only; no runtime behavior claim.
- `missing`: invalid release state.

`npm run feature-quality:check` fails when runtime route features are static-only or when quality counts are missing from the registry.
# 1.0.0 Feature Quality Target

Stable release feature quality is release-gated by `npm run feature-quality:check`.

Targets:

- `runtime_verified >= 22`
- `runtime_mock_verified >= 45`
- `integration_optional <= 6`
- `static_contract <= 45`
- `missing = 0`

Current stable verification snapshot:

- `runtime_verified=43`
- `runtime_mock_verified=47`
- `integration_optional=5`
- `static_contract=30`
- `missing=0`

Runtime-capable CLI and route features should not stay `static_contract` unless they are explicitly documentation-only or no-op surfaces.
