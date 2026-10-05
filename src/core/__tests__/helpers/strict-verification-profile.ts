// Import this module in a test file that asserts `strict`-profile behavior:
// managed-skill digest drift blocking, Stop-time rituals, request intake and
// engineering-sanity seeding. The suite itself runs under the product default
// (`essential`); a file that proves strict semantics says so explicitly, and
// each test file runs in its own process, so the pin stays local to it.
process.env.SKS_VERIFICATION_PROFILE = 'strict';

export const STRICT_VERIFICATION_PROFILE_PINNED = true;
