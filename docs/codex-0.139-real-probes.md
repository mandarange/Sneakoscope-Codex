# Codex 0.139 Real Probes

SKS 3.0.4 keeps the hermetic Codex 0.139 fixture gates and adds explicit real probes for environments that have an external `codex-cli` 0.139.x installed.

## Commands

```bash
npm run codex:0139-real-probes
npm run codex:0139-real-probes:require-real
npm run codex:0139-code-mode-web-search-real
npm run codex:0139-rich-tool-schema-real
npm run codex:0139-doctor-env-real
npm run codex:0139-plugin-marketplace-real
npm run codex:0139-plugin-cache-real
npm run codex:0139-sandbox-profile-alias-real
npm run codex:0139-interrupt-agent-real
npm run codex:0139-image-path-real
npm run codex:0139-sandbox-proxy-real
npm run codex:0139-real-probe-summary
npm run doctor:codex-0139-real-probes
```

`codex:0139-real-probes` records unavailable high-value probes as skipped. `codex:0139-real-probes:require-real` fails if any high-value probe is skipped or failed.

## Artifacts

```text
.sneakoscope/codex-0139-real-probes.json
.sneakoscope/missions/<mission>/codex-0139-real-probes.json
dist/codex-0139-real-probes.json
.sneakoscope/codex-0139-real-probe-summary.json
dist/codex-0139-real-probe-summary.json
```

The GitHub release body helper and doctor readiness checks surface the latest real-probe status without running unsafe probes from `sks doctor --fix`.
