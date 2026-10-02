# Fast Mode Official Service Tier

Fast mode is release-valid only when Codex-facing config or command arguments carry the official service tier.

SKS writes Codex's own tier id for Fast, `priority`: `sks fast-mode on` sets
`service_tier = "priority"` in the global Codex config, and MAD launch args and
codex-exec child args carry `-c service_tier=priority` (`default` when Fast is off).
SKS-generated per-file profile overlays still say `fast`, the legacy alias Codex maps
to `priority`. SKS records `service_tier_cli_override_present` in process reports.

The switch belongs to Codex, not to an SKS-created model or reasoning preset.
Fast mode speed and credit cost are set by Codex and vary by model and sign-in
method, so SKS does not restate them. API-key Codex uses API token pricing
instead; API Priority processing is a separate billing path.

Codex's tier ids are `default`, `priority` (the Fast tier in every model catalog) and
`flex`; `fast` is a documented legacy alias that sends `priority` (the same request on
Codex 0.153.4 and 0.159.2). SKS keeps `fast` and `standard` as its own words in policy
and reports and accepts all four spellings from existing settings, but what it writes
for Codex is `priority` or `default`.
