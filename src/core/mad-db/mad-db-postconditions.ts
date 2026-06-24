import path from 'node:path';
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js';
import { missionDir } from '../mission.js';
import type { MadDbMcpExecutor } from './mad-db-executor.js';

export interface MadDbReadBackProof {
  schema: 'sks.mad-db-read-back-proof.v1';
  generated_at: string;
  ok: boolean;
  checks: Array<{
    id: string;
    query_sha256: string;
    ok: boolean;
    result_digest: string | null;
    row_count: number | null;
  }>;
  raw_rows_recorded: false;
  proof_path?: string;
}

export async function runReadBackChecks(input: {
  root: string;
  missionId: string;
  executor: MadDbMcpExecutor;
  checks: Array<{ id: string; query: string; expectOk?: boolean }>;
}): Promise<MadDbReadBackProof> {
  const rows = [];
  for (const check of input.checks) {
    const result = await input.executor.executeSql(check.query);
    rows.push({
      id: check.id,
      query_sha256: sha256(check.query),
      ok: result.ok === (check.expectOk ?? true),
      result_digest: result.result_digest,
      row_count: result.row_count
    });
  }
  const proof: MadDbReadBackProof = {
    schema: 'sks.mad-db-read-back-proof.v1',
    generated_at: nowIso(),
    ok: rows.every((row) => row.ok),
    checks: rows,
    raw_rows_recorded: false
  };
  const proofPath = path.join(missionDir(input.root, input.missionId), 'mad-db', 'read-back-proof.json');
  await writeJsonAtomic(proofPath, proof);
  return { ...proof, proof_path: path.relative(input.root, proofPath).split(path.sep).join('/') };
}

export function readBackCheck(id: string, query: string): { id: string; query: string; expectOk: true } {
  return { id, query, expectOk: true };
}
