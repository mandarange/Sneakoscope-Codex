# Computer Use Evidence

Computer Use evidence is real-dependency evidence when Codex Computer Use is available and mock evidence when loaded from fixtures. Mock evidence must stay labeled `mock`, `fixture`, or `verified_partial`.

In SKS 1.0.5, Computer Use is a macOS Codex App capability check. It is independent from MAD-SKS, DB safety, and generic SKS safety policy. SKS must not describe Computer Use as blocked by MAD-SKS or by an SKS safety policy.

Status commands:

```bash
sks computer-use status --json
sks computer-use doctor --json
sks computer-use enable --macos --json
sks computer-use require --route '$Image-UX-Review' --json
```

Status values:

- `available`
- `codex_app_missing`
- `macos_permission_missing`
- `codex_app_capability_missing`
- `external_capability_blocked`
- `not_macos`
- `unknown`

If Codex App or macOS denies access, SKS records `external_capability_blocked` or the closest capability status and does not fabricate UI evidence.

The status payload always includes:

- `mad_sks_independent: true`
- `safety_policy_blocked: false`
- `external_capability_blocked`
- `evidence.status`
- an empty evidence skeleton when live screen/action evidence is unavailable

Expected ledgers:

- `computer-use-evidence-ledger.json`
- `screen-capture-ledger.json`
- `before-after-visual-diff.json`
- `image-voxel-ledger.json`
- `completion-proof.json`

UI verification claims require Computer Use evidence. Browser automation evidence can support ordinary browser checks, but it is not accepted as a substitute for UI-level Computer Use verification.

Visual route fixtures call `sks computer-use require --route ... --json` for `$Image-UX-Review`, `$QA-LOOP`, `$PPT`, `$Computer-Use`, and `$From-Chat-IMG`. If Computer Use is unavailable, Completion Proof records the status and visual claims remain `verified_partial` or lower unless explicit screenshot/image evidence covers the claim.
