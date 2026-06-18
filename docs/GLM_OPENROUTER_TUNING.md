# GLM OpenRouter Tuning

The GLM 5.2 speed path follows OpenRouter routing and usage fields confirmed from current OpenRouter documentation.

## Provider Routing

Speed mode uses a single `model` field and never a `models` fallback array. Provider preferences keep `allow_fallbacks: false`, prefer `sort: "throughput"`, and leave `require_parameters: false` so speed mode does not exclude providers solely because strict/structured parameters are unavailable.

Deep and strict profiles may use `require_parameters: true` because those profiles intentionally trade routing breadth for stronger parameter guarantees.

## Reasoning And Usage

Speed mode may send `reasoning: { exclude: true }` or a low/minimal/none effort when model metadata supports it. It must not send high or xhigh reasoning effort. Traces can capture `prompt_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens`, `prompt_tokens_details.cached_tokens`, and `prompt_tokens_details.cache_write_tokens`.
