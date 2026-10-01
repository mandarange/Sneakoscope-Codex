# Fast Mode Official Service Tier

Fast mode is release-valid only when Codex-facing config or command arguments carry the official service tier.

SKS writes `service_tier = "fast"` in profile config, adds
`-c service_tier=fast` to MAD launch args and codex-exec child args, and records
`service_tier_cli_override_present` in process reports.

The switch belongs to Codex, not to an SKS-created model or reasoning preset.
Fast mode speed and credit cost are set by Codex and vary by model and sign-in
method, so SKS does not restate them. API-key Codex uses API token pricing
instead; API Priority processing is a separate billing path.

Codex Desktop can expose the same service-tier choice with `priority` and
`default`. SKS treats those as compatibility aliases only: `priority` normalizes
to canonical `fast`, and `default` normalizes to canonical `standard`.
