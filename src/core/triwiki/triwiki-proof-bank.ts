import fs from 'node:fs';
import path from 'node:path';
import type { TriWikiProofCard } from './triwiki-proof-card.js';
import { TRIWIKI_PROOF_CARD_SCHEMA, isReusableTriWikiProofCard } from './triwiki-proof-card.js';

export const TRIWIKI_PROOF_BANK_SCHEMA = 'sks.triwiki-proof-bank.v1';

export interface TriWikiProofBankLookup {
  root: string;
  subjectType?: 'gates' | 'gate-packs' | 'modules' | 'pipelines';
  subjectId: string;
  cacheKey: string;
}

export interface TriWikiProofBankStatus {
  schema: typeof TRIWIKI_PROOF_BANK_SCHEMA;
  ok: boolean;
  root: string;
  proof_count: number;
  reusable_count: number;
  invalidated_count: number;
  corrupt_backups: number;
}

export function triWikiProofBankDir(root: string): string {
  return path.join(root, '.sneakoscope', 'triwiki', 'proof-bank');
}

export function writeTriWikiProofCard(root: string, card: TriWikiProofCard, subjectType = pluralSubject(card.subject_type)): string {
  const dir = path.join(triWikiProofBankDir(root), subjectType, safeId(card.subject_id));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safeId(card.proof_id)}.json`);
  fs.writeFileSync(file, `${JSON.stringify(card, null, 2)}\n`);
  return file;
}

export function readReusableTriWikiProofCard(input: TriWikiProofBankLookup): { hit: boolean; card: TriWikiProofCard | null; path: string | null; invalidation_reasons: string[] } {
  const dir = path.join(triWikiProofBankDir(input.root), input.subjectType || 'gates', safeId(input.subjectId));
  if (!fs.existsSync(dir)) return { hit: false, card: null, path: null, invalidation_reasons: ['proof_dir_missing'] };
  const reasons: string[] = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    const absolute = path.join(dir, file);
    const card = readProofCard(absolute);
    if (!card) {
      backupCorruptProof(absolute);
      reasons.push(`corrupt:${file}`);
      continue;
    }
    if (card.cache_key !== input.cacheKey) {
      reasons.push(`cache_key_mismatch:${file}`);
      continue;
    }
    if (isReusableTriWikiProofCard(card)) return { hit: true, card, path: absolute, invalidation_reasons: [] };
    reasons.push(`not_reusable:${file}`);
  }
  return { hit: false, card: null, path: null, invalidation_reasons: reasons.length ? reasons : ['proof_not_found'] };
}

export function markTriWikiProofInvalidated(root: string, subjectId: string, proofId: string, reason: string, subjectType = 'gates'): boolean {
  const file = path.join(triWikiProofBankDir(root), subjectType, safeId(subjectId), `${safeId(proofId)}.json`);
  const card = readProofCard(file);
  if (!card) return false;
  const next: TriWikiProofCard = {
    ...card,
    reusable: false,
    invalidation_reasons: [...new Set([...(card.invalidation_reasons || []), reason])]
  };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}

export function summarizeTriWikiProofBank(root: string): TriWikiProofBankStatus {
  const base = triWikiProofBankDir(root);
  let proofCount = 0;
  let reusableCount = 0;
  let invalidatedCount = 0;
  let corruptBackups = 0;
  if (fs.existsSync(base)) {
    for (const file of walkJson(base)) {
      if (file.includes('.corrupt-')) {
        corruptBackups += 1;
        continue;
      }
      const card = readProofCard(file);
      if (!card) {
        backupCorruptProof(file);
        corruptBackups += 1;
        continue;
      }
      proofCount += 1;
      if (isReusableTriWikiProofCard(card)) reusableCount += 1;
      if (card.reusable !== true || (card.invalidation_reasons || []).length > 0) invalidatedCount += 1;
    }
  }
  return {
    schema: TRIWIKI_PROOF_BANK_SCHEMA,
    ok: true,
    root,
    proof_count: proofCount,
    reusable_count: reusableCount,
    invalidated_count: invalidatedCount,
    corrupt_backups: corruptBackups
  };
}

function readProofCard(file: string): TriWikiProofCard | null {
  try {
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as TriWikiProofCard;
    return json.schema === TRIWIKI_PROOF_CARD_SCHEMA ? json : null;
  } catch {
    return null;
  }
}

function backupCorruptProof(file: string): void {
  if (!fs.existsSync(file)) return;
  const backup = `${file}.corrupt-${Date.now()}.bak`;
  fs.renameSync(file, backup);
}

function walkJson(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(absolute);
    }
  }
  return out.sort();
}

function pluralSubject(value: string): string {
  if (value === 'gate') return 'gates';
  if (value === 'gate-pack') return 'gate-packs';
  if (value === 'module') return 'modules';
  return 'pipelines';
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}
