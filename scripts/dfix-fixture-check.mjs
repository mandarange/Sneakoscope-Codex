#!/usr/bin/env node
import { emitGate, runDfixFixture } from './sks-1-11-gate-lib.mjs';

const result = runDfixFixture();
emitGate('dfix:fixture', { mission_id: result.mission_id });
