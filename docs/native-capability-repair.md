# Native Capability Repair

SKS 3.1.10 makes `sks doctor --fix` capability repair evidence-based and capability-specific.

The repair matrix covers:

- `image_generation`
- `image_followup_edit`
- `computer_use`
- `chrome_web_review`
- `codex_app_screenshot`
- `app_handoff`
- `image_path_exposure`
- `saved_artifact_path_contract`

Safe filesystem repairs create artifact directories and registries under `.sneakoscope/image-artifacts`, `.sneakoscope/app-screenshots`, and `.sneakoscope/reports/saved-artifact-path-contract.json`.

Manual-only surfaces are not marked verified. Chrome/web review requires the official Codex Chrome Extension readiness path, and Computer Use requires the Codex Computer Use capability plus OS permission readiness. If those are missing or unknown, doctor reports `manual_required` with the next action instead of counting unofficial browser automation or prose as evidence.

Saved artifact path repair is a fallback for handoff continuity. It can make follow-up edit path contracts usable, but it does not prove native `image_path_exposure`; that state is reported as `degraded` until real path exposure is verified.

Relevant gates:

```bash
npm run native-capability:repair-matrix
npm run native-capability:repair
npm run native-capability:postcheck
npm run doctor:native-capability-repair
npm run doctor:native-capability-repair-blackbox
```
