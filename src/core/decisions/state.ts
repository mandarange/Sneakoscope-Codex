import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcess, sha256 } from '../fsx.js';
import { inspectConfinedPath } from '../managed-path-safety.js';
import { redactSecrets } from '../secret-redaction.js';
import type { BoundedTriwikiAttention, BoundedTriwikiAttentionAnchor } from '../subagents/triwiki-attention.js';
import { DESIGN_DEFAULTS, POLICY_REVISION, type ContextCandidate, type DecisionBinding } from './types.js';

export const MAX_EXCERPT_CHARS = 800;

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\bhf_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g
];

export function redactDecisionText(text: string, maxChars = 2_000): string {
  let out = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  out = String(redactSecrets(out));
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]');
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 12).trimEnd()} [truncated]`;
  return out;
}

export function stableDigest(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export async function sourceSnapshotDigest(root: string): Promise<string> {
  const cwd = path.resolve(root);
  const head = await gitText(cwd, ['rev-parse', 'HEAD']);
  const porcelain = await gitText(cwd, ['status', '--porcelain']);
  const dirty = porcelain.split('\n').map((line) => line.trim()).filter(Boolean);
  const dirtyHashes: string[] = [];
  for (const line of dirty.slice(0, 64)) {
    const relative = line.replace(/^[ MADRCU?!]{1,2}\s+/, '').split(' -> ').pop() || '';
    if (!relative || relative.includes('..')) continue;
    const file = path.join(cwd, relative);
    const inspected = await inspectConfinedPath(cwd, file).catch(() => null);
    if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) {
      dirtyHashes.push(`${relative}:unreadable`);
      continue;
    }
    const bytes = await fsp.readFile(file).catch(() => Buffer.alloc(0));
    dirtyHashes.push(`${relative}:${sha256(bytes)}`);
  }
  return stableDigest({ head, dirty, dirtyHashes });
}

export async function graphFileDigest(root: string): Promise<string | null> {
  const file = path.join(path.resolve(root), '.sneakoscope', 'wiki', 'context-graph.json');
  const inspected = await inspectConfinedPath(path.resolve(root), file).catch(() => null);
  if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return null;
  const bytes = await fsp.readFile(file);
  return sha256(bytes);
}

export function buildDecisionBinding(input: {
  projectId: string;
  workflowRunId: string;
  workflowRevision: string;
  sourceDigest: string;
  graphDigest: string | null;
  candidates: unknown;
  questions: unknown;
  requestedModel?: string;
}): DecisionBinding {
  return {
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    workflowRevision: input.workflowRevision,
    sourceDigest: input.sourceDigest,
    graphDigest: input.graphDigest,
    candidateDigest: stableDigest(input.candidates),
    questionDigest: stableDigest(input.questions),
    policyRevision: POLICY_REVISION,
    requestedModel: input.requestedModel || DESIGN_DEFAULTS.model
  };
}

export async function hydrateContextCandidates(
  root: string,
  attention: BoundedTriwikiAttention | null | undefined,
  changedPaths: readonly string[] = []
): Promise<ContextCandidate[]> {
  if (!attention?.available) return [];
  const pinnedPaths = new Set(changedPaths.map((entry) => normalizeRel(entry)));
  const out: ContextCandidate[] = [];
  for (const anchor of attention.anchors) {
    const candidate = await hydrateAnchor(root, anchor, pinnedPaths);
    if (candidate) out.push(candidate);
  }
  return out;
}

export function applyOptionalContextSelection(
  attention: BoundedTriwikiAttention,
  candidates: readonly ContextCandidate[],
  keepIds: readonly string[]
): BoundedTriwikiAttention {
  const keep = new Set(keepIds);
  for (const candidate of candidates) {
    if (candidate.pinned) keep.add(candidate.id);
  }
  const selected = attention.anchors.filter((anchor) => {
    const candidate = candidates.find((row) => row.id === anchor.id);
    if (!candidate) return true;
    return keep.has(anchor.id);
  }).map((anchor) => attachExcerpt(anchor, candidates.find((row) => row.id === anchor.id)));
  return {
    ...attention,
    anchors: selected,
    token_cost: selected.reduce((sum, anchor) => sum + anchor.token_cost, 0)
  };
}

async function hydrateAnchor(
  root: string,
  anchor: BoundedTriwikiAttentionAnchor,
  pinnedPaths: Set<string>
): Promise<ContextCandidate | null> {
  const provenance = anchor.provenance[0];
  if (!provenance?.path || !provenance.hash) {
    return {
      id: anchor.id,
      sourcePath: '',
      sourceHash: anchor.source_hash || '',
      excerpt: '',
      pinned: true,
      fresh: false,
      reproducible: false
    };
  }
  const relative = normalizeRel(provenance.path);
  const excerpt = await readExcerpt(root, relative, provenance.line);
  const named = pinnedPaths.has(relative);
  const fresh = anchor.freshness === 'fresh';
  const reproducible = Boolean(excerpt && provenance.hash);
  const optional = !named && fresh && reproducible && Boolean(excerpt);
  return {
    id: anchor.id,
    sourcePath: relative,
    sourceHash: provenance.hash,
    excerpt,
    pinned: !optional,
    fresh,
    reproducible
  };
}

async function readExcerpt(root: string, relative: string, line?: number): Promise<string> {
  const cwd = path.resolve(root);
  const file = path.join(cwd, relative);
  const inspected = await inspectConfinedPath(cwd, file).catch(() => null);
  if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return '';
  if (inspected.stat.size > 256 * 1024) return '';
  const raw = await fsp.readFile(file, 'utf8').catch(() => '');
  if (!raw) return '';
  const lines = raw.split('\n');
  const focus = Number.isInteger(line) && (line || 0) > 0 ? Math.min(lines.length, line || 1) : 1;
  const start = Math.max(0, focus - 8);
  const slice = lines.slice(start, start + 24).join('\n');
  return redactDecisionText(slice, MAX_EXCERPT_CHARS);
}

function attachExcerpt(
  anchor: BoundedTriwikiAttentionAnchor,
  candidate: ContextCandidate | undefined
): BoundedTriwikiAttentionAnchor {
  if (!candidate?.excerpt) return anchor;
  return {
    ...anchor,
    excerpt: candidate.excerpt,
    source_path: candidate.sourcePath,
    optional: !candidate.pinned
  };
}

function normalizeRel(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  const result = await runProcess('git', args, { cwd, timeoutMs: 2_000, envMode: 'merge' }).catch(() => null);
  if (!result || result.code !== 0) return '';
  return String(result.stdout || '').trim();
}
