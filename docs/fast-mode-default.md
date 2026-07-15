# Fast Mode Default

SKS stores the project preference through the current Fast Mode commands:

```bash
sks fast-mode on
sks fast-mode off
sks fast-mode status
sks fast-mode clear
```

Codex App aliases are `$Fast-On`, `$Fast-Off`, and `$Fast-Mode`. The project
preference is written to `.sneakoscope/state/fast-mode.json`.

```json
{
  "schema": "sks.fast-mode-policy.v1",
  "fast_mode": true,
  "service_tier": "fast",
  "default_fast_mode": true
}
```

SKS normalizes its service-tier vocabulary to `fast` and `standard`. Codex
Desktop may describe the equivalent choices as `priority` and `default`.
Routes that support this preference record it in their current policy and
propagation evidence.

Naruto uses the fixed official model-routing policy described in
[`docs/naruto.md`](naruto.md). Its public controls are the official thread
budget, read-only mode, and JSON/status/proof surfaces; backend, scheduler,
worker-model, and service-tier controls are not part of that public contract.

Use the bounded current release checks after changing Fast Mode behavior:

```bash
npm run release:check:affected
npm run release:check:confidence
```
