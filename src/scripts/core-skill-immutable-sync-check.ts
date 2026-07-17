#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { syncCoreSkillsIntegrity } from '../core/codex-native/core-skill-integrity.js';
import { buildSksCoreSkillManifest, renderCoreSkillTemplate } from '../core/codex-native/core-skill-manifest.js';

const root = await makeTempRoot('sks-core-immutable-');
const skillsRoot = path.join(root, '.agents', 'skills');
const expectedSkillCount = buildSksCoreSkillManifest('1970-01-01T00:00:00.000Z').skills.length;
const first = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
assertGate(first.installed.length === expectedSkillCount, 'first immutable sync must install missing managed core skills', first);
const second = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
assertGate(second.installed.length === 0 && second.restored.length === 0, 'second immutable sync must be idempotent', second);
await writeText(path.join(skillsRoot, 'sks-loop', 'SKILL.md'), `${renderCoreSkillTemplate('loop')}\ncorruption\n`);
const restored = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
const loopText = await fs.readFile(path.join(skillsRoot, 'sks-loop', 'SKILL.md'), 'utf8');
assertGate(restored.restored.length === 1 && loopText === renderCoreSkillTemplate('loop'), 'corrupted managed core skill must restore exactly', restored);
emitGate('core-skill:immutable-sync', { installed: first.installed.length, restored: restored.restored.length });
