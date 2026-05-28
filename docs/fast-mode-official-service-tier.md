# Fast Mode Official Service Tier

Fast mode is release-valid only when Codex-facing config or command arguments carry the official service tier.

SKS 1.18.12 writes `service_tier = "fast"` in profile config, adds `-c service_tier=fast` to MAD launch args and codex-exec child args, and records `service_tier_passed_to_codex` in process reports.
