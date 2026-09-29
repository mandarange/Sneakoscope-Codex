#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from '../core/fsx.js';
import { assertGate, emitGate, importDist, root } from './gate-lib.js';

export function writeReport(name, report) {
  const out = path.join(root, '.sneakoscope', 'reports', `${name}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return out;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

