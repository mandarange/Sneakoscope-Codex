/** Packed tarball ceiling; slight headroom for quarantine + OpenRouter unification. */
export const DEFAULT_MAX_PACK_BYTES = 2510 * 1024
/** ~10.90 MiB; narrow headroom above the measured 7.1.1 proof-validation surface. */
export const DEFAULT_MAX_UNPACKED_BYTES = 11_425_000
