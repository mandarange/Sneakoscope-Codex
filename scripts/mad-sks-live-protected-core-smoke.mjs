#!/usr/bin/env node
import { runMadSksExecutorCheck } from './lib/mad-sks-actual-executor-check-lib.mjs';

await runMadSksExecutorCheck('live-protected-core-smoke');
