# Fast Mode Official Service Tier

Fast mode is release-valid only when Codex-facing config or command arguments carry the official service tier.

SKS 1.20.5 writes `service_tier = "fast"` in profile config, adds `-c service_tier=fast` to MAD launch args and codex-exec child args, and records `service_tier_cli_override_present` in process reports.
