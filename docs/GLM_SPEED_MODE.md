# GLM Speed Mode

GLM speed mode is a `sks --mad --glm` profile only. It does not change ordinary `sks --mad`, Naruto/Team, OpenAI, Codex default model, or non-GLM provider behavior.

## Default Profile

The default GLM profile keeps reasoning at xhigh and recovers speed by reducing surrounding overhead:

- `model: z-ai/glm-5.2`
- `reasoning.effort: xhigh`
- `max_tokens: 4096`
- `temperature: 0.2`
- `top_p: 0.85`
- `stream: true`
- `tool_choice: none`
- `parallel_tool_calls: false`
- `provider.allow_fallbacks: false`
- `provider.require_parameters: true`
- `provider.sort: throughput`

## Optimization Surface

Speed work is GLM-local:

- compact context building with generated-artifact exclusions;
- encoded request and tool schema caches;
- model metadata cache for reasoning support;
- deterministic output envelope parser and patch gate;
- latency traces and synthetic bench artifacts under `.sneakoscope/glm/`.

## Opt-In Depth

Use `--deep`, `--xhigh`, or `--strict` when the GLM task needs broader context, automatic tools, or JSON schema proof output. These flags only affect the GLM route where they are passed.
