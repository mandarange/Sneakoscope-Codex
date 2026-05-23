#!/usr/bin/env node
import { runMadSksExecutorCheck } from './lib/mad-sks-actual-executor-check-lib.mjs';

await runMadSksExecutorCheck('rollback-apply');
