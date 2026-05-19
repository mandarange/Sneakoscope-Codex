# Computer Use Evidence

Computer Use evidence is real-dependency evidence when Codex Computer Use is available and mock evidence when loaded from fixtures. Mock evidence must stay labeled `mock`, `fixture`, or `verified_partial`.

In SKS 1.0.4, Computer Use is a macOS Codex App capability check. It is independent from MAD-SKS, DB safety, and generic SKS safety policy. SKS must not describe Computer Use as blocked by MAD-SKS or by an SKS safety policy.

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

Expected ledgers:

- `computer-use-evidence-ledger.json`
- `screen-capture-ledger.json`
- `before-after-visual-diff.json`
- `image-voxel-ledger.json`
- `completion-proof.json`

UI verification claims require Computer Use evidence. Browser automation evidence can support ordinary browser checks, but it is not accepted as a substitute for UI-level Computer Use verification.
