# Feature Fixtures

`sks all-features selftest --mock --execute-fixtures --strict-artifacts --json` promotes the feature registry from metadata-only coverage into release-gated mock/static fixture validation. The canonical release wrapper is `npm run feature-quality:check`; no separate fixture alias is required.

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
- `cli-agent` executes `sks agent run fixture --mock --json` and validates the native central ledger, task board, leases, no-overlap proof, cleanup, proof evidence, and dynamic effort policy.
- `cli-agent` is the native multi-session fixture surface and validates `agents/agent-proof-evidence.json`, agent sessions, leases, task board, central ledger, and cleanup evidence.
- all-features selftest checks `native_agent_intake_contract_present`, `cli_agent_fixture_pass`, `legacy_multiagent_removed`, `agent_proof_evidence_contract_present`, and `agent_lease_policy_present`.

External dependency routes remain honest: a mock fixture can pass while the real dependency path remains `blocked`, `not_verified`, or `verified_partial` until real evidence exists.

## Quality Boundary

- `runtime_verified`: actual command executed and generated artifacts validated.
- `runtime_mock_verified`: mock route command executed and generated artifacts validated.
- `integration_optional`: real dependency may be absent, but a blocker is recorded.
- `static_contract`: docs/skill/manifest-only; no runtime behavior claim.
- `missing`: invalid release state.

`npm run feature-quality:check` fails when runtime route features are static-only or when quality counts are missing from the registry.
# 1.0.1 Feature Quality Target

Stable release feature quality is release-gated by `npm run feature-quality:check`, which now reads the TypeScript-built `dist` runtime.

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
- `static_contract=22`
- `missing=0`

Runtime-capable CLI and route features should not stay `static_contract` unless they are explicitly documentation-only or no-op surfaces.
