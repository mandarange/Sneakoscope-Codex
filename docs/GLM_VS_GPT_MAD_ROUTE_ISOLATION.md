# GLM vs GPT/MAD Route Isolation

`sks --mad` is the existing GPT/Codex/MAD route. It must not infer GLM mode from environment variables, saved OpenRouter keys, previous state, or benchmark settings.

Route rules:

- `sks --mad`: GPT/Codex/MAD, no GLM, no OpenRouter requirement.
- `sks --mad --glm`: GLM direct speed mode, `z-ai/glm-5.2` only.
- `sks --mad --glm --naruto`: GLM Naruto, `z-ai/glm-5.2` only.
- `sks naruto --glm`: GLM Naruto through the Naruto command-local flag.
- `sks naruto`: classic Naruto, no GLM unless `--glm` is present.

The model-mode router treats `--glm` as the only GLM activation signal. Non-GLM MAD assertions block GLM leakage before launch.
