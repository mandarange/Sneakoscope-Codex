import fs from 'node:fs';
import path from 'node:path';
import { markTriWikiProofInvalidated, triWikiProofBankDir } from './triwiki-proof-bank.js';

export const TRIWIKI_PROOF_INVALIDATION_SCHEMA = 'sks.triwiki-proof-invalidation.v1';

export interface TriWikiProofInvalidationReport {
  schema: typeof TRIWIKI_PROOF_INVALIDATION_SCHEMA;
  root: string;
  reason: string;
  broad: boolean;
  affected_gates: string[];
  affected_packs: string[];
  invalidated_proofs: string[];
  unaffected_proofs: number;
}

export async function invalidateTriWikiProofsForChange(input: {
  root: string;
  changedFiles: string[];
  affectedModules: string[];
  affectedGates: string[];
  reason: string;
}): Promise<TriWikiProofInvalidationReport> {
  const broad = input.changedFiles.some((file) => ['package.json', 'package-lock.json', 'release-gates.v2.json'].includes(file));
  const affectedGates = new Set(input.affectedGates);
  const affectedPacks = new Set<string>();
  const invalidated: string[] = [];
  let unaffected = 0;
  for (const file of walkProofs(input.root)) {
    const parsed = readProofIdentity(file);
    if (!parsed) continue;
    const hit = broad || affectedGates.has(parsed.subject_id) || input.affectedModules.includes(parsed.subject_id);
    if (!hit) {
      unaffected += 1;
      continue;
    }
    if (parsed.subject_type === 'gate-pack') affectedPacks.add(parsed.subject_id);
    if (markTriWikiProofInvalidated(input.root, parsed.subject_id, parsed.proof_id, input.reason, pluralSubject(parsed.subject_type))) {
      invalidated.push(parsed.proof_id);
    }
  }
  const report: TriWikiProofInvalidationReport = {
    schema: TRIWIKI_PROOF_INVALIDATION_SCHEMA,
    root: input.root,
    reason: input.reason,
    broad,
    affected_gates: [...affectedGates].sort(),
    affected_packs: [...affectedPacks].sort(),
    invalidated_proofs: invalidated.sort(),
    unaffected_proofs: unaffected
  };
  const out = path.join(input.root, '.sneakoscope', 'reports', 'triwiki-proof-invalidation.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function walkProofs(root: string): string[] {
  const base = triWikiProofBankDir(root);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(absolute);
    }
  }
  return out;
}

function readProofIdentity(file: string): { subject_type: string; subject_id: string; proof_id: string } | null {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { subject_type?: string; subject_id?: string; proof_id?: string };
    if (!json.subject_type || !json.subject_id || !json.proof_id) return null;
    return { subject_type: json.subject_type, subject_id: json.subject_id, proof_id: json.proof_id };
  } catch {
    return null;
  }
}

function pluralSubject(value: string): string {
  if (value === 'gate') return 'gates';
  if (value === 'gate-pack') return 'gate-packs';
  if (value === 'module') return 'modules';
  return 'pipelines';
}
