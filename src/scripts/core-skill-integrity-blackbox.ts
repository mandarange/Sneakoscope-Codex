#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText, writeUserSkill } from './sks-3-1-8-check-lib.js';
import { syncCoreSkillsIntegrity } from '../core/codex-native/core-skill-integrity.js';
import { renderCoreSkillTemplate } from '../core/codex-native/core-skill-manifest.js';

const root = await makeTempRoot('sks-core-blackbox-');
const skillsRoot = path.join(root, '.agents', 'skills');
const first = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
const second = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
await writeText(path.join(skillsRoot, 'research', 'SKILL.md'), `${renderCoreSkillTemplate('research')}\nmutated\n`);
const third = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot });
const restoredText = await fs.readFile(path.join(skillsRoot, 'research', 'SKILL.md'), 'utf8');
const userRoot = path.join(root, 'user-skills');
await writeUserSkill(root, 'user-skills', 'research', 'research');
const user = await syncCoreSkillsIntegrity({ root, apply: true, skillsRoot: userRoot });
assertGate(first.installed.length === 8, 'blackbox A: first sync installs missing core skills', first);
assertGate(second.installed.length === 0 && second.restored.length === 0, 'blackbox B: second sync changes nothing', second);
assertGate(third.restored.length === 1 && restoredText === renderCoreSkillTemplate('research'), 'blackbox C: managed drift restored exactly', third);
assertGate(user.skipped_user_authored.length === 1, 'blackbox D: user skill is not overwritten', user);
emitGate('core-skill:integrity-blackbox');
