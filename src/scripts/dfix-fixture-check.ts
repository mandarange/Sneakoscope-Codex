#!/usr/bin/env node
// @ts-nocheck
import { emitGate, runDfixFixture } from './sks-1-11-gate-lib.js';

const result = runDfixFixture();
emitGate('dfix:fixture', { mission_id: result.mission_id, fixture_root: result.fixture_root });
