import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js';
import { buildSksCoreSkillManifest } from '../codex-native/core-skill-manifest.js';
import { syncCoreSkillsIntegrity } from '../codex-native/core-skill-integrity.js';
import { dedupeProjectSkills } from '../codex-native/project-skill-dedupe.js';

interface CodexSkillSyncReport {
  schema: 'sks.codex-skill-sync.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  skills_root: string;
  desired_skills: string[];
  existing_skills: string[];
  created: string[];
  skipped: string[];
  external_route_names_preserved: string[];
  integrity_report: string;
  dedupe_report: string;
  interop: {
    mode: 'coexist';
    clobbered_external_routes: false;
    clobbered_user_skills: false;
    skipped_user_skills: string[];
    managed_skills: string[];
  };
  blockers: string[];
}

const EXTERNAL_ROUTE_RESERVED = new Set(['ulw-loop', 'ulw-plan', 'start-work']);

export async function syncCodexSksSkills(input: {
  root: string;
  apply?: boolean;
  skillsRoot?: string;
}): Promise<CodexSkillSyncReport> {
  const root = path.resolve(input.root);
  const skillsRoot = input.skillsRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills');
  return withSkillSyncLock(root, async () => {
    const beforeExisting = await listSkillNames(skillsRoot);
    const reserved = beforeExisting.filter((name) => EXTERNAL_ROUTE_RESERVED.has(name));
    const manifest = buildSksCoreSkillManifest();
    const desired = manifest.skills.map((skill) => skill.canonical_name);
    const integrity = await syncCoreSkillsIntegrity({
      root,
      apply: input.apply === true,
      skillsRoot,
      reportPath: path.join(root, '.sneakoscope', 'reports', 'core-skill-integrity.json')
    });
    const dedupe = await dedupeProjectSkills({
      root,
      fix: input.apply === true,
      yes: true,
      quarantineUserDuplicates: false,
      reportPath: path.join(root, '.sneakoscope', 'reports', 'project-skill-dedupe.json')
    }).catch((err: unknown) => ({
      ok: false,
      blockers: [err instanceof Error ? err.message : String(err)],
      unresolved_user_duplicates: [],
      actions: []
    }));
    const report: CodexSkillSyncReport = {
      schema: 'sks.codex-skill-sync.v1',
      generated_at: nowIso(),
      ok: integrity.ok && dedupe.ok !== false,
      apply: input.apply === true,
      skills_root: skillsRoot,
      desired_skills: desired,
      existing_skills: beforeExisting,
      created: integrity.installed,
      skipped: integrity.skipped_user_authored,
      external_route_names_preserved: reserved,
      integrity_report: '.sneakoscope/reports/core-skill-integrity.json',
      dedupe_report: '.sneakoscope/reports/project-skill-dedupe.json',
      interop: {
        mode: 'coexist',
        clobbered_external_routes: false,
        clobbered_user_skills: false,
        skipped_user_skills: integrity.skipped_user_authored,
        managed_skills: desired
      },
      blockers: [...integrity.blockers, ...((dedupe as { blockers?: string[] }).blockers || [])]
    };
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-skill-sync.json'), report).catch(() => undefined);
    return report;
  });
}

export async function withSkillSyncLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(path.resolve(root), '.sneakoscope', 'locks', 'skill-sync.lock');
  await ensureDir(path.dirname(lockPath));
  const started = Date.now();
  while (true) {
    try {
      await fs.mkdir(lockPath);
      break;
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code !== 'EEXIST') throw err;
      if (Date.now() - started > 30000) throw new Error(`Timed out waiting for skill sync lock: ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    await writeJsonAtomic(path.join(lockPath, 'owner.json'), {
      schema: 'sks.skill-sync-lock.v1',
      pid: process.pid,
      acquired_at: nowIso()
    }).catch(() => undefined);
    return await fn();
  } finally {
    await fs.rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function listSkillNames(root: string): Promise<string[]> {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  return rows.filter((row) => row.isDirectory()).map((row) => row.name).sort();
}
