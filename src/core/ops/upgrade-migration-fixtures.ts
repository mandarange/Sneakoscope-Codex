import fs from 'node:fs/promises';
import path from 'node:path';

export interface UpgradeFixtureSpec {
  id: string;
  label: string;
  version: string;
  mode: string;
  legacy?: boolean;
  corruptIndex?: boolean;
}

export const UPGRADE_MIGRATION_FIXTURES: UpgradeFixtureSpec[] = [
  { id: 'M-20260708-058000-super-search', label: '5.8.0 super-search mission', version: '5.8.0', mode: 'super-search' },
  { id: 'M-20260708-059000-quantum', label: '5.9.0 quantum reports', version: '5.9.0', mode: 'quantum' },
  { id: 'M-20260708-051000-dominance', label: '5.10.0 dominance reports', version: '5.10.0', mode: 'dominance' },
  { id: 'M-20260708-051100-marketing', label: '5.11.0 marketing research/strategy mission', version: '5.11.0', mode: 'seo' },
  { id: 'M-20260708-051101-team', label: 'legacy Team route state', version: 'legacy', mode: 'team', legacy: true },
  { id: 'M-20260708-051102-maddb', label: 'legacy MadDB route state', version: 'legacy', mode: 'mad-db', legacy: true },
  { id: 'M-20260708-051103-retention', label: 'large retention state', version: 'legacy', mode: 'naruto' },
  { id: 'M-20260708-051104-corrupt-index', label: 'corrupted mission index', version: 'legacy', mode: 'super-search', corruptIndex: true }
];

export async function seedUpgradeMigrationFixture(root: string): Promise<UpgradeFixtureSpec[]> {
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions'), { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"upgrade-migration-fixture","private":true}\n', 'utf8');
  for (const fixture of UPGRADE_MIGRATION_FIXTURES) {
    const dir = path.join(root, '.sneakoscope', 'missions', fixture.id);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(path.join(dir, 'mission.json'), {
      id: fixture.id,
      mode: fixture.mode,
      prompt: fixture.label,
      created_at: createdAtFor(fixture.id),
      phase: fixture.legacy ? 'LEGACY_DONE' : 'DONE',
      package_version: fixture.version
    });
    await writeJson(path.join(dir, 'completion-proof.json'), {
      schema: 'sks.completion-proof.v1',
      status: fixture.legacy ? 'verified_partial' : 'verified',
      route: routeForMode(fixture.mode),
      mission_id: fixture.id,
      blockers: [],
      unverified: fixture.legacy ? ['legacy_state_requires_migration_or_explicit_block'] : []
    });
    if (fixture.mode === 'super-search') await seedSuperSearch(dir, fixture.id);
    if (fixture.mode === 'seo') await seedSeo(dir, fixture.id);
    if (fixture.mode === 'naruto') await fs.writeFile(path.join(dir, 'events.jsonl'), `${'x'.repeat(8192)}\n`, 'utf8');
  }
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), {
    mission_id: UPGRADE_MIGRATION_FIXTURES[0]?.id,
    mode: 'SUPER_SEARCH',
    route: '$Super-Search',
    route_command: '$Super-Search',
    phase: 'DONE',
    route_closed: true
  });
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'index.json'), '{"schema":"corrupted"}\n', 'utf8');
  return UPGRADE_MIGRATION_FIXTURES;
}

async function seedSuperSearch(dir: string, missionId: string): Promise<void> {
  const artifactDir = path.join(dir, 'super-search');
  await fs.mkdir(artifactDir, { recursive: true });
  const sources = [
    { source_id: `${missionId}-source-a`, title: 'Fixture source A', canonical_url: 'https://example.com/a', authority_tier: 'A1', blockers: [] },
    { source_id: `${missionId}-source-b`, title: 'Fixture source B', canonical_url: 'https://example.com/b', authority_tier: 'A1', blockers: [] }
  ];
  await writeJson(path.join(artifactDir, 'source-ledger.json'), { schema: 'sks.super-search-source-ledger.v1', ok: true, sources, blockers: [] });
  await writeJson(path.join(artifactDir, 'claim-ledger.json'), { schema: 'sks.super-search-claim-ledger.v1', ok: true, claims: [], blockers: [] });
  await writeJson(path.join(artifactDir, 'super-search-proof.json'), { schema: 'sks.super-search-proof.v1', ok: true, verified_source_count: sources.length, blockers: [] });
  await writeJson(path.join(artifactDir, 'super-search-gate.json'), { schema: 'sks.super-search-gate.v1', ok: true, mission_id: missionId, blockers: [] });
}

async function seedSeo(dir: string, missionId: string): Promise<void> {
  const artifactDir = path.join(dir, 'search-visibility');
  await fs.mkdir(artifactDir, { recursive: true });
  await writeJson(path.join(artifactDir, 'intake.json'), { schema: 'sks.search-visibility.intake.v1', ok: true, mission_id: missionId, route: '$SEO-GEO-OPTIMIZER', blockers: [] });
  await writeJson(path.join(artifactDir, 'verification-report.json'), { schema: 'sks.search-visibility.verification.v1', ok: true, status: 'verified_partial', blockers: [] });
  await writeJson(path.join(dir, 'seo-gate.json'), { schema: 'sks.search-visibility.gate.v1', ok: true, passed: true, mission_id: missionId, blockers: [] });
}

function routeForMode(mode: string): string {
  if (mode === 'super-search') return '$Super-Search';
  if (mode === 'seo') return '$SEO-GEO-OPTIMIZER';
  if (mode === 'mad-db') return '$MAD-DB';
  return '$Naruto';
}

function createdAtFor(id: string): string {
  const match = /M-(\d{8})-(\d{6})/.exec(id);
  if (!match) return new Date(0).toISOString();
  return `${match[1]?.slice(0, 4)}-${match[1]?.slice(4, 6)}-${match[1]?.slice(6, 8)}T${match[2]?.slice(0, 2)}:${match[2]?.slice(2, 4)}:${match[2]?.slice(4, 6)}.000Z`;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
