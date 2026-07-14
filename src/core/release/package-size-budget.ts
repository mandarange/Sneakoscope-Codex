// 6.2.0 dry-runs measure about 2.48 MB packed after the MCP manager, hook gate,
// expanded custom-agent catalog, bounded TriWiki routing, and freshness guard.
// Keep only the next 4 KiB boundary as the shared narrow packed ceiling.
export const DEFAULT_MAX_PACK_BYTES = 2428 * 1024
// The same package measures about 11.14 MB unpacked after the four-profile
// agent policy. Keep only the next 16 KiB boundary as the shared measured limit.
export const DEFAULT_MAX_UNPACKED_BYTES = 11_141_120
