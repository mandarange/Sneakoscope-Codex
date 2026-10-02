/**
 * The `[features]` keys SKS seeds, and the ones it strips.
 *
 * Stripping is destructive in one direction only: deleting the line for a flag
 * Codex STILL supports restores Codex's own default, which is `true` for every
 * stable flag. The previous hand-maintained list had drifted to include nine
 * live flags — `computer_use`, `browser_use`, `browser_use_external`,
 * `image_generation`, `in_app_browser`, `guardian_approval`, `tool_suggest`,
 * `plugins`, and `multi_agent` — so a user's explicit `= false` was deleted and
 * silently reverted to `true`.
 *
 * Only flags Codex reports as `removed`, or does not know at all, belong in
 * REMOVED_CODEX_FEATURE_FLAGS: Codex ignores those, so deleting them is inert
 * cleanup. `codex features list` is the authority, and
 * `test/unit/codex-feature-flags.test.mjs` pins both lists against the vendored
 * Codex binary so they cannot rot again.
 */
export const MANAGED_CODEX_FEATURE_FLAGS = Object.freeze(['hooks', 'fast_mode', 'apps'])

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
