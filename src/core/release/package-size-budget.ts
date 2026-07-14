// 6.2.0 dry-runs measure about 2.48 MB packed after the MCP manager, hook gate,
// expanded custom-agent catalog, bounded TriWiki routing, and freshness guard.
// Keep only the following 4 KiB boundary as the shared narrow packed ceiling.
export const DEFAULT_MAX_PACK_BYTES = 2424 * 1024
// The same package measures about 11.12 MB unpacked. Keep only the following
// 16 KiB boundary so every package-size gate has one explicit measured budget.
export const DEFAULT_MAX_UNPACKED_BYTES = 11_124_736
