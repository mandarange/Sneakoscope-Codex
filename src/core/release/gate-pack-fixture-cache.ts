import fs from 'node:fs';
import path from 'node:path';
import { hashJson } from '../triwiki/triwiki-cache-key.js';

export const GATE_PACK_FIXTURE_SCHEMA = 'sks.gate-pack-fixture.v1';

export interface GatePackFixture {
  schema: typeof GATE_PACK_FIXTURE_SCHEMA;
  root: string;
  pack_id: string;
  fixture_version: string;
  base_path: string;
  run_path: string;
  base_fixture_hash: string;
  reused_base: boolean;
  setup_count: number;
}

export async function prepareGatePackFixture(input: {
  root: string;
  packId: string;
  fixtureVersion: string;
}): Promise<GatePackFixture> {
  const base = path.join(input.root, '.sneakoscope', 'fixture-cache', 'gate-packs', safe(input.packId), safe(input.fixtureVersion));
  const expectedHash = hashJson({ schema: GATE_PACK_FIXTURE_SCHEMA, pack_id: input.packId, fixture_version: input.fixtureVersion });
  const reusedBase = validateBaseFixture(base, input.packId, input.fixtureVersion, expectedHash);
  if (!reusedBase) fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  if (!reusedBase) {
    fs.writeFileSync(path.join(base, 'fixture.json'), `${JSON.stringify({ schema: GATE_PACK_FIXTURE_SCHEMA, pack_id: input.packId, fixture_version: input.fixtureVersion, base_fixture_hash: expectedHash, created_at: new Date().toISOString() }, null, 2)}\n`);
  }
  const runPath = path.join(input.root, '.sneakoscope', 'fixture-cache', 'runs', `${safe(input.packId)}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(path.dirname(runPath), { recursive: true });
  cleanupOldRuns(path.dirname(runPath), 20);
  copyDir(base, runPath);
  return {
    schema: GATE_PACK_FIXTURE_SCHEMA,
    root: input.root,
    pack_id: input.packId,
    fixture_version: input.fixtureVersion,
    base_path: base,
    run_path: runPath,
    base_fixture_hash: expectedHash,
    reused_base: reusedBase,
    setup_count: reusedBase ? 0 : 1
  };
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(src);
      const resolved = path.resolve(path.dirname(src), target);
      if (!resolved.startsWith(path.resolve(from) + path.sep)) throw new Error(`gate_pack_fixture_symlink_outside_root:${src}`);
      fs.symlinkSync(target, dst);
    } else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function validateBaseFixture(base: string, packId: string, fixtureVersion: string, expectedHash: string): boolean {
  try {
    const file = path.join(base, 'fixture.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { schema?: string; pack_id?: string; fixture_version?: string; base_fixture_hash?: string };
    return json.schema === GATE_PACK_FIXTURE_SCHEMA && json.pack_id === packId && json.fixture_version === fixtureVersion && json.base_fixture_hash === expectedHash;
  } catch {
    return false;
  }
}

function cleanupOldRuns(runsDir: string, keep: number): void {
  if (!fs.existsSync(runsDir)) return;
  const runs = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(runsDir, entry.name);
      return { dir, mtimeMs: fs.statSync(dir).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const run of runs.slice(Math.max(0, keep))) fs.rmSync(run.dir, { recursive: true, force: true });
}
