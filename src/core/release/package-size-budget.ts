// 6.2.0 measures 2,476,542 packed bytes after the MCP manager, hook gate,
// expanded custom-agent catalog, and query-aware TriWiki routing are included.
// Keep the next 4 KiB boundary as the shared narrow packed ceiling.
export const DEFAULT_MAX_PACK_BYTES = 2420 * 1024
// The same package measures 11,107,547 unpacked bytes. Keep the next 16 KiB
// boundary so every package-size gate has one explicit, measured budget.
export const DEFAULT_MAX_UNPACKED_BYTES = 11_108_352
