#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeManagedCoreSkill } from './sks-3-1-8-check-lib.js';
import { dedupeProjectSkills } from '../core/codex-native/project-skill-dedupe.js';

const root = await makeTempRoot('sks-skill-dedupe-');
process.env.CODEX_HOME = path.join(root, 'codex-home');
await writeManagedCoreSkill(root, '.agents/skills', 'loop');
await writeManagedCoreSkill(root, '.codex/skills', 'loop');
const report = await dedupeProjectSkills({ root, fix: true, yes: true });
const agentsSkill = await fs.stat(path.join(root, '.agents', 'skills', 'loop', 'SKILL.md')).then(() => true, () => false);
const codexSkill = await fs.stat(path.join(root, '.codex', 'skills', 'loop', 'SKILL.md')).then(() => true, () => false);
assertGate(report.actions.some((action) => action.action === 'quarantined'), 'managed duplicate skill must be quarantined under --fix', report);
assertGate([agentsSkill, codexSkill].filter(Boolean).length === 1, 'exactly one managed duplicate should remain active', { agentsSkill, codexSkill });
emitGate('skill:dedupe', { actions: report.actions.length });
