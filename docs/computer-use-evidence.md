# Computer Use Evidence

Computer Use evidence is real-dependency evidence when Codex Computer Use is available for a native macOS/non-web target and mock evidence when loaded from fixtures. Mock evidence must stay labeled `mock`, `fixture`, or `verified_partial`.

Computer Use is a macOS Codex App capability check with an optional live evidence surface. It is independent from MAD-SKS, DB safety, and generic SKS safety policy. SKS must not describe Computer Use as blocked by MAD-SKS or by an SKS safety policy. Web, browser, localhost, website, webapp, and web-based app verification must use the official Codex Chrome Extension path first: https://developers.openai.com/codex/app/chrome-extension. If the extension is not installed/enabled, SKS must halt the web QA/UX pipeline and ask the user to set it up before resuming. Computer Use is only for native Mac, desktop-app, OS-settings, and non-web visual targets.

Status commands:

```bash
sks computer-use status --json
sks computer-use doctor --json
sks computer-use enable --macos --json
sks codex-app chrome-extension --json
sks computer-use require --route '$Image-UX-Review' --json
sks computer-use smoke --json
SKS_TEST_REAL_COMPUTER_USE=1 sks computer-use smoke --real --json
sks computer-use smoke --real --capture-screenshot --json
sks computer-use smoke --real --require-real --json
sks computer-use smoke --route '$Image-UX-Review' --mission latest --real --json
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

Evidence modes:

- `probe_only`: the default `sks computer-use smoke --json`; no live capture is attempted.
- `live_capture_attempted`: `--real` was requested and the smoke path entered the official live evidence workflow.
- `live_capture_success`: an official local-only screenshot/action evidence artifact was captured and written.
- `live_capture_blocked`: Codex App, macOS permission, capture adapter, or external capability prevented live capture.

`sks computer-use smoke --json` is optional and returns a structured status without requiring real Computer Use. `--require-real` fails unless the real opt-in path captures live evidence successfully. Real smoke is opt-in through `--real` or `SKS_TEST_REAL_COMPUTER_USE=1`; screenshots are local-only evidence and are not published into shared TriWiki automatically. Use `sks computer-use smoke --json` again to recover to a probe-only status after a blocked real attempt.

Live evidence schema:

```json
{
  "schema": "sks.computer-use-live-evidence.v1",
  "mode": "probe_only",
  "mock": false,
  "capture": {
    "screenshot": { "attempted": false, "status": "not_attempted", "path": null, "sha256": null, "local_only": true },
    "action": { "attempted": false, "status": "not_attempted", "actions": [], "local_only": true }
  },
  "image_voxel": { "linked": false, "ledger_path": null, "anchor_ids": [], "reason": "probe_only_no_live_capture_attempted" },
  "privacy": { "shared_triwiki_publish_allowed": false, "contains_screen_content": false, "redaction_required": false }
}
```

When screenshot capture succeeds, the screenshot SHA-256 becomes the Image Voxel image asset id when a mission-local ledger can be updated. If linkage is not possible, `image_voxel.reason` records the blocker.

The status payload always includes:

- `mad_sks_independent: true`
- `safety_policy_blocked: false`
- `external_capability_blocked`
- `evidence.status`
- `evidence_mode`
- `live_evidence_path`
- `image_voxel_linked`
- an empty evidence skeleton when live screen/action evidence is unavailable

Expected ledgers:

- `computer-use-evidence-ledger.json`
- `screen-capture-ledger.json`
- `before-after-visual-diff.json`
- `image-voxel-ledger.json`
- `completion-proof.json`

Native non-web visual verification claims require Computer Use evidence. Web UI/browser verification claims require Codex Chrome Extension readiness/evidence and must not be satisfied by Computer Use, Playwright, Selenium, Puppeteer, Browser Use, Chrome MCP, fabricated screenshots, or prose-only checks.

Visual route fixtures call `sks computer-use require --route ... --json` for legacy native checks; web-oriented routes now return a structured `web_verification_uses_chrome_extension` blocker from that command and must use `sks codex-app chrome-extension --json` instead. If Computer Use is unavailable for a native target, Completion Proof records the status and visual claims remain `verified_partial` or lower unless explicit screenshot/image evidence covers the claim. `external_capability_blocked` cannot support a high-confidence visual claim by itself.

Generated gpt-image-2 callout images follow the same local-only default as Chrome Extension or native Computer Use screenshots: SKS may publish metadata, hashes, dimensions, bbox anchors, and Image Voxel relations, but it does not automatically publish screen-content binaries into shared TriWiki.
