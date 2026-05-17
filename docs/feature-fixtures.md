# Feature Fixtures

`sks all-features selftest --mock --execute-fixtures --json` promotes the feature registry from metadata-only coverage into release-gated mock/static fixture validation.

The fixture gate checks:

- every feature has a fixture contract;
- mock/static fixtures have commands;
- deterministic safe allowlist commands execute successfully;
- expected artifacts are declared as arrays;
- fixture pass count is at least 45;
- mock fixture blocked count is zero.

External dependency routes remain honest: a mock fixture can pass while the real dependency path remains `blocked`, `not_verified`, or `verified_partial` until real evidence exists.
