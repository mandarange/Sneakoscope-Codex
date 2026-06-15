#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { syncCodexSksSkills } from '../core/codex-app/codex-skill-sync.js';
import { buildSkillRegistryLedger } from '../core/codex-native/skill-registry-ledger.js';

const root = await makeTempRoot('sks-skill-atomic-');
process.env.CODEX_HOME = path.join(root, 'codex-home');
const skillsRoot = path.join(process.env.CODEX_HOME, 'skills');
await Promise.all(Array.from({ length: 20 }, () => syncCodexSksSkills({ root, apply: true, skillsRoot })));
const ledger = await buildSkillRegistryLedger({ root });
assertGate(!ledger.duplicate_canonical_names.length, 'concurrent sync must not create duplicate active skill names', ledger);
emitGate('skill:sync-atomic', { entries: ledger.entries.length });
