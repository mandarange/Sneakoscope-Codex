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
    expected_row_count: number | null;
    expected_result_digest: string | null;
    row_count_matched: boolean | null;
    result_digest_matched: boolean | null;
  }>;
  raw_rows_recorded: false;
  proof_path?: string;
}

export async function runReadBackChecks(input: {
  root: string;
  missionId: string;
  executor: MadDbMcpExecutor;
  checks: Array<{ id: string; query: string; expectOk?: boolean; expectedRowCount?: number | null; expectedResultDigest?: string | null }>;
}): Promise<MadDbReadBackProof> {
  const rows = [];
  for (const check of input.checks) {
    const result = await input.executor.executeSql(check.query);
    const queryOk = result.ok === (check.expectOk ?? true);
    // Query success alone doesn't prove the write took effect — a verify SQL
    // can succeed while returning zero/unexpected rows. When the caller
    // supplied an expected row_count or result_digest, the check must match
    // it to pass (20차 P0-10); without one, this stays query-success-only.
    const rowCountMatched = check.expectedRowCount === undefined || check.expectedRowCount === null
      ? null
      : result.row_count === check.expectedRowCount;
    const resultDigestMatched = check.expectedResultDigest === undefined || check.expectedResultDigest === null
      ? null
      : result.result_digest === check.expectedResultDigest;
    rows.push({
      id: check.id,
      query_sha256: sha256(check.query),
      ok: queryOk && rowCountMatched !== false && resultDigestMatched !== false,
      result_digest: result.result_digest,
      row_count: result.row_count,
      expected_row_count: check.expectedRowCount ?? null,
      expected_result_digest: check.expectedResultDigest ?? null,
      row_count_matched: rowCountMatched,
      result_digest_matched: resultDigestMatched
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

export function readBackCheck(
  id: string,
  query: string,
  expected: { expectedRowCount?: number | null; expectedResultDigest?: string | null } = {}
): { id: string; query: string; expectOk: true; expectedRowCount?: number | null; expectedResultDigest?: string | null } {
  return { id, query, expectOk: true, ...expected };
}
