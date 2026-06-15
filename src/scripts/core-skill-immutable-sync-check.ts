#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { syncCoreSkillsIntegrity } from '../core/codex-native/core-skill-integrity.js';
import { renderCoreSkillTemplate } from '../core/codex-native/core-skill-manifest.js';

const root = await makeTempRoot('sks-core-immutable-');
const skillsRoot = path.join(root, '.agents', 'skills');
const first = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
assertGate(first.installed.length === 8, 'first immutable sync must install missing managed core skills', first);
const second = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
assertGate(second.installed.length === 0 && second.restored.length === 0, 'second immutable sync must be idempotent', second);
await writeText(path.join(skillsRoot, 'loop', 'SKILL.md'), `${renderCoreSkillTemplate('loop')}\ncorruption\n`);
const restored = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
const loopText = await fs.readFile(path.join(skillsRoot, 'loop', 'SKILL.md'), 'utf8');
assertGate(restored.restored.length === 1 && loopText === renderCoreSkillTemplate('loop'), 'corrupted managed core skill must restore exactly', restored);
emitGate('core-skill:immutable-sync', { installed: first.installed.length, restored: restored.restored.length });
