# Feature Fixtures

`sks all-features selftest --mock --execute-fixtures --strict-artifacts --json` promotes the feature registry from metadata-only coverage into release-gated mock/static fixture validation.

The fixture gate checks:

- every feature has a fixture contract;
- mock/static fixtures have commands;
- deterministic safe allowlist commands execute successfully;
- expected artifacts are declared as arrays;
- fixture pass count is at least 90;
- `not_required` count is at most 16;
- mock fixture blocked count is zero;
- expected artifacts exist in a temp root and expose declared schemas.

External dependency routes remain honest: a mock fixture can pass while the real dependency path remains `blocked`, `not_verified`, or `verified_partial` until real evidence exists.
