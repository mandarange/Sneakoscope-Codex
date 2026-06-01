#!/usr/bin/env node
// Generic release metadata gate entrypoint. The implementation remains in the
// historical 1-19 gate file until that larger release surface is split.
await import('./release-metadata-1-19-check.mjs');
