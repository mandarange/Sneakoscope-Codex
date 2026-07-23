/** Packed tarball ceiling; slight headroom for quarantine + OpenRouter unification. */
export const DEFAULT_MAX_PACK_BYTES = 2510 * 1024
/** ~10.74 MiB; bounded headroom for provider controls and terminal-proof audit recovery. */
export const DEFAULT_MAX_UNPACKED_BYTES = 11_260_000
