/**
 * The `[features]` keys SKS strips from user configs.
 *
 * SKS no longer seeds any `[features]` flag. `hooks`, `fast_mode`, `apps`,
 * `computer_use`, `browser_use`, `browser_use_external`, `image_generation`,
 * `in_app_browser`, `guardian_approval`, `tool_suggest` and `plugins` are
 * `stable true` in `codex features list` on 0.153.4 and 0.159.2, so a line saying
 * `= true` changes nothing and only freezes today's default into the user's file.
 * (A fresh sandbox CODEX_HOME with an empty config reports all eleven true on both.)
 *
 * Stripping is destructive in one direction only: deleting the line for a flag Codex
 * STILL supports restores Codex's own default, which is `true` for every stable flag, so
 * a user's explicit `= false` would be silently reverted. Only keys Codex does not read
 * at all belong in the strip lists, and `test/unit/codex-feature-flags.test.mjs` pins them
 * against the vendored Codex binary so they cannot rot again.
 */

/**
 * `[features]` keys the installed Codex does not know at all (measured on 0.153.4 and
 * 0.159.2: `codex exec` on 0.159 warns "`features.fast_mode_ui` is ignored" and
 * `--strict-config` rejects the field on both). Deleting them is inert cleanup at any
 * value. Every other key an older SKS pruned is either live (`multi_agent`) or a
 * `removed` flag Codex accepts silently (`remote_control`, `codex_git_commit`,
 * `plugin_hooks`, `js_repl`, `multi_agent_mode`), so it stays the user's.
 */
export const REMOVED_CODEX_FEATURE_FLAGS = Object.freeze(['fast_mode_ui'])

/**
 * `codex_hooks` is a deprecated LIVE alias of `hooks` (Codex warns "`[features].codex_hooks`
 * is deprecated. Use `[features].hooks` instead" on both versions, and `codex_hooks = false`
 * turns `hooks` off). Only `= true`, which equals the `hooks` default, is stripped;
 * `= false` is the user's opt-out and is left alone.
 */
export const DEPRECATED_CODEX_HOOKS_ALIAS_FLAG = 'codex_hooks'
