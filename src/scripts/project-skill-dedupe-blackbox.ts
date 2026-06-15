#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeManagedCoreSkill, writeUserSkill } from './sks-3-1-8-check-lib.js';
import { dedupeProjectSkills } from '../core/codex-native/project-skill-dedupe.js';

const root = await makeTempRoot('sks-skill-dedupe-blackbox-');
process.env.CODEX_HOME = path.join(root, 'codex-home');
await writeManagedCoreSkill(root, '.agents/skills', 'loop');
await writeManagedCoreSkill(root, '.codex/skills', 'loop');
const scenarioA = await dedupeProjectSkills({ root, fix: true, yes: true });
await writeUserSkill(root, '.agents/skills', 'user-loop', 'loop');
await writeManagedCoreSkill(root, '.codex/skills', 'loop');
const scenarioB = await dedupeProjectSkills({ root, fix: true, yes: true });
await writeUserSkill(root, '.agents/skills', 'user-loop-a', 'Loop');
await writeUserSkill(root, '.codex/skills', 'user-loop-b', 'loop');
const scenarioC = await dedupeProjectSkills({ root, fix: true, yes: false });
assertGate(scenarioA.actions.some((action) => action.action === 'quarantined'), 'scenario A must quarantine SKS-managed duplicate', scenarioA);
assertGate(scenarioB.actions.some((action) => action.reason.includes('user-authored skill preserved')), 'scenario B must preserve user-authored skill', scenarioB);
assertGate(scenarioC.blockers.some((blocker) => blocker.includes('user_duplicate_requires_confirmation')), 'scenario C must not auto-delete user-authored duplicates', scenarioC);
emitGate('skill:dedupe-blackbox');
