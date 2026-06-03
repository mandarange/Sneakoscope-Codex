#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
assertGate(Boolean(scripts['ux-review:imagegen-blackbox']), 'UX review imagegen blackbox gate missing');
assertGate(Boolean(scripts['ppt:imagegen-blackbox']), 'PPT imagegen blackbox gate missing');
assertGate(Boolean(scripts['ux-ppt:structured-extraction']), 'UX/PPT structured extraction gate missing');
emitGate('codex-sdk:ux-ppt-review-pipeline', { gates: ['ux-review:imagegen-blackbox', 'ppt:imagegen-blackbox', 'ux-ppt:structured-extraction'] });
