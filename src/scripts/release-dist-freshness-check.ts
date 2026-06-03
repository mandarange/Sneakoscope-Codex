#!/usr/bin/env node
// @ts-nocheck
import { ensureDistFresh } from './lib/ensure-dist-fresh.js';

const report = ensureDistFresh({ rebuild: process.env.SKS_RELEASE_DIST_FRESHNESS_NO_REBUILD !== '1' });
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
