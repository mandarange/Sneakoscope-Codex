import fs from 'node:fs';
import path from 'node:path';

export const GATE_PACK_FIXTURE_SCHEMA = 'sks.gate-pack-fixture.v1';

export interface GatePackFixture {
  schema: typeof GATE_PACK_FIXTURE_SCHEMA;
  root: string;
  pack_id: string;
  fixture_version: string;
  base_path: string;
  run_path: string;
  reused_base: boolean;
  setup_count: number;
}

export async function prepareGatePackFixture(input: {
  root: string;
  packId: string;
  fixtureVersion: string;
}): Promise<GatePackFixture> {
  const base = path.join(input.root, '.sneakoscope', 'fixture-cache', 'gate-packs', safe(input.packId), safe(input.fixtureVersion));
  const reusedBase = fs.existsSync(path.join(base, 'fixture.json'));
  fs.mkdirSync(base, { recursive: true });
  if (!reusedBase) {
    fs.writeFileSync(path.join(base, 'fixture.json'), `${JSON.stringify({ schema: GATE_PACK_FIXTURE_SCHEMA, pack_id: input.packId, fixture_version: input.fixtureVersion, created_at: new Date().toISOString() }, null, 2)}\n`);
  }
  const runPath = path.join(input.root, '.sneakoscope', 'fixture-cache', 'runs', `${safe(input.packId)}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(path.dirname(runPath), { recursive: true });
  copyDir(base, runPath);
  return {
    schema: GATE_PACK_FIXTURE_SCHEMA,
    root: input.root,
    pack_id: input.packId,
    fixture_version: input.fixtureVersion,
    base_path: base,
    run_path: runPath,
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
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}
