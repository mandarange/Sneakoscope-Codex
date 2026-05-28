# Fast Mode Default

SKS 1.18.11 defaults agent runs to Fast mode. A user must explicitly pass `--no-fast` or `--service-tier standard` to disable it.

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
SKS_REASONING_PROFILE_SUFFIX=fast
```

The policy is attached to the roster, concurrency policy, backend report, native worker process reports, `worker-fast-mode.json`, `fast-mode-propagation-proof.json`, and runtime truth matrix row `fast_mode_default`.

Explicit opt-out:

```bash
sks agent run "fixture" --no-fast
sks agent run "fixture" --service-tier standard
```

Release gates:

```bash
npm run agent:fast-mode-default
npm run agent:fast-mode-worker-propagation
npm run codex:fast-mode-profile-propagation
npm run mad-sks:fast-mode-propagation
```
