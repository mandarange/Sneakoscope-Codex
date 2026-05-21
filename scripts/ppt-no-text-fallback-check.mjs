#!/usr/bin/env node
import { assertGate, emitGate, runPptReview } from './sks-1-11-gate-lib.mjs';

const result = runPptReview('callouts');
assertGate(result.artifacts.callouts?.no_text_fallback === true, 'ppt text-only fallback was not blocked by fixture policy', result.artifacts.callouts);
emitGate('ppt:no-text-fallback', { mission_id: result.mission_id });
