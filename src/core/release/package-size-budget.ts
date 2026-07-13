export const DEFAULT_MAX_PACK_BYTES = 2414 * 1024
// 6.1.2 measured 10,918,686 unpacked bytes after adding the official-subagent,
// Research adversarial-review, release-proof, and Codex CLI recovery surfaces.
// Keep a single narrow 10.43 MiB ceiling shared by every package-size gate.
export const DEFAULT_MAX_UNPACKED_BYTES = 10_936_648
