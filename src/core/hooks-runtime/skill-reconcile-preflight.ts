import path from 'node:path';
import fsp from 'node:fs/promises';
import { PACKAGE_VERSION, readJson, readText } from '../fsx.js';
import { loadSkillsManifest, reconcileSkills, REMOVED_SKS_SKILL_NAMES } from '../init/skills.js';

export async function maybeReconcileProjectSkillsPreflight(root: string) {
  const manifestPath = path.join(root, '.agents', 'skills', '.sks-generated.json');
  const manifest = await readJson(manifestPath, null);
  const needsByManifest = manifest?.version && manifest.version !== PACKAGE_VERSION;
  const needsByResidue = await hasProjectOfficialResidue(root);
  if (!needsByManifest && !needsByResidue) return null;
  return reconcileSkills({
    targetDir: path.join(root, '.agents', 'skills'),
    scope: 'project',
    fix: true
  });
}

async function hasProjectOfficialResidue(root: string) {
  const manifest = await loadSkillsManifest().catch(() => null);
  const official = new Set<string>([
    ...(manifest?.skills || []).map((skill: any) => canonical(skill.canonical_name)),
    ...(manifest?.skills || []).flatMap((skill: any) => (skill.deprecated_aliases || []).map((name: any) => canonical(name))),
    ...REMOVED_SKS_SKILL_NAMES.map((name) => canonical(name))
  ]);
  for (const dir of [path.join(root, '.agents', 'skills'), path.join(root, '.codex', 'skills')]) {
    const rows = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const row of rows) {
      if (!row.isDirectory()) continue;
      const text = await readText(path.join(dir, row.name, 'SKILL.md'), null);
      if (typeof text !== 'string') continue;
      const display = /^name:\s*(.+)\s*$/m.exec(text)?.[1] || row.name;
      if (official.has(canonical(display))) return true;
    }
  }
  return false;
}

function canonical(value: any) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
