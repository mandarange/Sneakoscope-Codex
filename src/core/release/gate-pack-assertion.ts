import fs from 'node:fs';
import path from 'node:path';
import type { GatePackDefinition } from './gate-pack-manifest.js';

export const GATE_PACK_SHARED_ARTIFACT_SCHEMA = 'sks.gate-pack-shared-artifact.v1';

export interface GatePackSharedArtifact {
  schema: typeof GATE_PACK_SHARED_ARTIFACT_SCHEMA;
  pack_id: string;
  fixture_path: string;
  setup_once: boolean;
  assertions: Record<string, unknown>;
}

export function writeGatePackSharedArtifact(input: {
  root: string;
  pack: GatePackDefinition;
  fixturePath: string;
  assertions?: Record<string, unknown>;
}): string {
  const artifact: GatePackSharedArtifact = {
    schema: GATE_PACK_SHARED_ARTIFACT_SCHEMA,
    pack_id: input.pack.id,
    fixture_path: input.fixturePath,
    setup_once: true,
    assertions: {
      gate_count: input.pack.gate_ids.length,
      resource_classes: input.pack.resource_classes,
      ...sharedAssertionsForPack(input.root, input.pack),
      ...(input.assertions || {})
    }
  };
  const file = path.join(input.fixturePath, 'gate-pack-shared-artifact.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
  return file;
}

function sharedAssertionsForPack(root: string, pack: GatePackDefinition): Record<string, unknown> {
  const packageJson = readJson(path.join(root, 'package.json'));
  return {
    gate_ids: pack.gate_ids,
    package_version: typeof packageJson?.version === 'string' ? packageJson.version : null,
    release_manifest_present: fs.existsSync(path.join(root, 'release-gates.v2.json')),
    proof_bank_present: fs.existsSync(path.join(root, '.sneakoscope', 'triwiki', 'proof-bank'))
  };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
