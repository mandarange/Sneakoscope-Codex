# GLM Speed Mode

Sneakoscope-Codex 4.0.6 makes `sks --mad --glm` a bounded GLM-only speed surface.

## CLI behavior

- `sks --mad --glm` prints readiness/status and exits.
- `sks --mad --glm run "task"` or `sks --mad --glm "task"` enters the direct speed path.
- `sks --mad --glm --interactive`, `sks --mad --glm --zellij`, and `sks --mad --glm session` are the only GLM routes that may launch the long-lived MAD/Zellij path.

## Speed request policy

- Model is locked to `z-ai/glm-5.2`.
- Provider fallback and GPT fallback remain disabled.
- Speed mode uses `provider.sort: "throughput"` and `provider.require_parameters: false`.
- Speed mode does not send `reasoning.effort: "high"` or `reasoning.effort: "xhigh"`.
- GLM receives no write tools; it returns patch envelopes that SKS gates and applies.
