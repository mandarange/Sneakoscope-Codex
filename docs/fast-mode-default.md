# Fast Mode Default

SKS 6.1.0 defaults agent runs to Fast mode. A user can explicitly pass `--no-fast` or `--service-tier standard` for one run, or use the project-local commands to toggle the default:

```bash
sks fast-mode on
sks fast-mode off
sks fast-mode status
sks fast-mode clear
```

Codex App aliases:

```text
$Fast-On
$Fast-Off
$Fast-Mode
```

The toggle writes `.sneakoscope/state/fast-mode.json` in the active project. Per-run flags still take precedence over the saved preference.

Default policy artifact:

```json
{
  "schema": "sks.fast-mode-policy.v1",
  "fast_mode": true,
  "service_tier": "fast",
  "default_fast_mode": true
}
```

Propagation env:

```text
SKS_FAST_MODE=1
SKS_SERVICE_TIER=fast
SKS_CODEX_DESKTOP_SERVICE_TIER=priority
SKS_REASONING_PROFILE_SUFFIX=fast
```

SKS keeps its canonical service tiers as `fast` and `standard`. Codex Desktop
may surface the same choice as `priority` and `default`; SKS normalizes
`priority -> fast` and `default -> standard` at the command boundary so agent
reports and CLI overrides stay consistent.

The policy is attached to the roster, concurrency policy, backend report, native worker process reports, `fast-mode-propagation-proof.json`, and runtime truth matrix row `fast_mode_default`.

Explicit one-run opt-out:

```bash
sks agent run "fixture" --no-fast
sks agent run "fixture" --service-tier standard
```

The `agent:fast-mode-policy` release gate runs the default-policy and worker-propagation checks. Execute it through the canonical release preset:

```bash
npm run release:check:full
```
