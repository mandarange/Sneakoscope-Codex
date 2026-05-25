# Codex Official Goal Mode 1.18.0

SKS 1.18.0 keeps `$Goal` as a lightweight bridge to native Codex `/goal` continuation.

When official Goal support is detected from Codex help/config surfaces, SKS records `default_enabled: true` in `goal-mode-applied.json` and passes that context to the Goal workflow artifact. When official support is not detectable, SKS records `sks_goal_fallback` instead of blocking implementation routes.

Goal mode does not replace Team, QA, DB, or other route gates. It persists continuation context while the selected execution route still owns implementation and verification.
