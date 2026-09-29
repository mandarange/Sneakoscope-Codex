/**
 * Packed tarball ceiling; slight headroom above the measured Context Graph surface.
 *
 * The compiled Context Graph engine — extractors, compiler, store, lint, query,
 * projections — is required at runtime: `sks search context`,
 * `sks align run`, TriWiki attention and the Naruto advisory all read
 * it from an installed package. Its benchmark corpus, fixtures and tuning
 * optimizer are development instruments and are excluded from the packlist
 * instead of being paid for here.
 *
 * 8.0.4 architecture-hardening re-measure: native Tests, UITests and
 * QAFixtures are excluded, while the provider/session contracts, evidence
 * keys, progress recovery, intent safety, reference registry and three native
 * runtime sources remain required by installed flows. Relative to the clean
 * 8.0.4 baseline, those 24 runtime files account for the package growth. The
 * measured package is 2,920,497 packed / 13,151,730 unpacked across 1,648
 * files; the ceilings below retain narrow regression headroom.
 *
 * 10.3.9 re-measure: user-level Codex hook activation (global hook install,
 * project hook reconcile, Codex `hooks/list` client, hook layer) replaced the
 * managed-hooks install Codex never loaded, and the same release removed code
 * nothing reached. The measured package is 2,887,352 packed / 12,573,513
 * unpacked across 1,749 files, so the packed ceiling is back at 2870 KiB.
 */
export const DEFAULT_MAX_PACK_BYTES = 2870 * 1024
/** ~12.59 MiB; narrow headroom above the measured installed runtime surface. */
export const DEFAULT_MAX_UNPACKED_BYTES = 13_200_000
