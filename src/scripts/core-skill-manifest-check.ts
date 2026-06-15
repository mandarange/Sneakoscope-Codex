#!/usr/bin/env node
import { assertGate, emitGate } from './sks-3-1-8-check-lib.js';
import { CORE_SKILL_TEMPLATE_VERSION, buildSksCoreSkillManifest, renderCoreSkillTemplate } from '../core/codex-native/core-skill-manifest.js';
import { sha256 } from '../core/fsx.js';

const manifest = buildSksCoreSkillManifest('1970-01-01T00:00:00.000Z');
assertGate(manifest.schema === 'sks.core-skill-manifest.v1', 'manifest schema mismatch', manifest);
assertGate(manifest.skills.length === 8, 'manifest must list eight immutable core skills', manifest.skills.map((skill) => skill.canonical_name));
assertGate(CORE_SKILL_TEMPLATE_VERSION === 'sks-core-skill-template.v1', 'core skill template version must be content-schema based, not package-version based', { CORE_SKILL_TEMPLATE_VERSION });
for (const skill of manifest.skills) {
  const content = renderCoreSkillTemplate(skill.canonical_name);
  assertGate(sha256(content) === skill.content_sha256, `content hash mismatch for ${skill.canonical_name}`, skill);
  assertGate(skill.mutable_by_doctor === false && skill.mutable_by_setup === false && skill.mutable_by_update === false, 'core skill mutability flags must be false', skill);
}
emitGate('core-skill:manifest', { skills: manifest.skills.length });
