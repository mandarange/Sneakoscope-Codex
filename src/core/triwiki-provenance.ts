import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_VERSION, nowIso, sha256 } from './fsx.js';

export const TRIWIKI_CONTEXT_PACK_PROVENANCE_SCHEMA = 'sks.triwiki-context-pack-provenance.v1';
export const TRIWIKI_SOURCE_MANIFEST_SCHEMA = 'sks.triwiki-source-manifest.v1';
const SOURCE_MANIFEST_MAX_FILES = 512;
const SOURCE_MANIFEST_MAX_BYTES = 8 * 1024 * 1024;
const DYNAMIC_SOURCE_PREFIXES = Object.freeze([
  '.git',
  'node_modules',
  'dist',
  '.sneakoscope/missions',
  '.sneakoscope/reports',
  '.sneakoscope/wiki',
  '.sneakoscope/cache',
  '.sneakoscope/tmp',
  '.sneakoscope/locks',
  '.sneakoscope/agents'
]);

export interface TriWikiSourceManifest {
  schema: typeof TRIWIKI_SOURCE_MANIFEST_SCHEMA;
  scope: 'authoritative_citation_bytes';
  root_binding: 'project_relative';
  limits: { max_files: number; max_total_bytes: number };
  excluded_dynamic_prefixes: string[];
  citations: string[];
  excluded_dynamic_citations: string[];
  roots: Array<{ path: string; kind: 'file' | 'directory' }>;
  links: Array<{ path: string; target: string }>;
  entries: Array<{ path: string; bytes: number; sha256: string }>;
  file_count: number;
  total_bytes: number;
  complete: boolean;
  blockers: string[];
}

export interface TriWikiContextPackProvenance {
  schema: typeof TRIWIKI_CONTEXT_PACK_PROVENANCE_SCHEMA;
  generated_at: string;
  package_snapshot_id: string;
  source_snapshot_id: string;
  source_manifest: TriWikiSourceManifest;
  payload_sha256: string;
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (typeof (value as any).toJSON === 'function') return canonicalJson((value as any).toJSON());
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined && typeof record[key] !== 'function' && typeof record[key] !== 'symbol')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function normalizedRelativePath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/$/, '') || '.';
}

function pathIsInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isDynamicSourcePath(relativePath: string): boolean {
  const normalized = normalizedRelativePath(relativePath);
  return DYNAMIC_SOURCE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function authoritativeCitations(pack: any): string[] {
  const anchorValues = Array.isArray(pack?.wiki?.a)
    ? pack.wiki.a.map((row: any) => row?.[8])
    : (Array.isArray(pack?.wiki?.anchors) ? pack.wiki.anchors.map((anchor: any) => anchor?.p) : []);
  const claimValues = (Array.isArray(pack?.claims) ? pack.claims : [])
    .flatMap((claim: any) => Array.isArray(claim?.source_paths) ? claim.source_paths : []);
  const values = [...anchorValues, ...claimValues];
  const normalized = values
    .filter((value: any) => typeof value === 'string' && value.trim())
    .map((value: string) => value.trim()) as string[];
  return [...new Set<string>(normalized)].sort((a, b) => a.localeCompare(b));
}

/**
 * Bounded byte manifest for the exact local hydration citations carried by a
 * context pack. Runtime/generated state is intentionally excluded so ordinary
 * mission/report churn cannot invalidate otherwise-current source memory.
 */
export function buildTriWikiSourceManifest(pack: any, root: string | null | undefined): TriWikiSourceManifest {
  const citations = authoritativeCitations(pack);
  const includedCitations: string[] = [];
  const excludedDynamicCitations: string[] = [];
  const roots: TriWikiSourceManifest['roots'] = [];
  const links: TriWikiSourceManifest['links'] = [];
  const entries: TriWikiSourceManifest['entries'] = [];
  const blockers: string[] = [];
  const resolvedRoot = root ? path.resolve(root) : '';
  let realRoot = '';
  try { realRoot = resolvedRoot ? fs.realpathSync(resolvedRoot) : ''; } catch {}
  let totalBytes = 0;
  const seenRealDirectories = new Set<string>();
  const seenEntryPaths = new Set<string>();

  const addBlocker = (value: string) => {
    if (!blockers.includes(value)) blockers.push(value);
  };
  const walk = (absolute: string, displayPath: string) => {
    let lstat: fs.Stats;
    let real: string;
    try {
      lstat = fs.lstatSync(absolute);
      real = fs.realpathSync(absolute);
    } catch {
      addBlocker(`source_manifest_path_unreadable:${displayPath}`);
      return;
    }
    if (!pathIsInside(realRoot, real)) {
      addBlocker(`source_manifest_path_outside_root:${displayPath}`);
      return;
    }
    let stat = lstat;
    if (lstat.isSymbolicLink()) {
      links.push({ path: displayPath, target: normalizedRelativePath(path.relative(realRoot, real)) });
      try { stat = fs.statSync(absolute); } catch {
        addBlocker(`source_manifest_path_unreadable:${displayPath}`);
        return;
      }
    }
    if (stat.isDirectory()) {
      if (seenRealDirectories.has(real)) return;
      seenRealDirectories.add(real);
      let children: fs.Dirent[];
      try { children = fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch {
        addBlocker(`source_manifest_path_unreadable:${displayPath}`);
        return;
      }
      for (const child of children) {
        const childDisplay = normalizedRelativePath(path.posix.join(displayPath, child.name));
        if (isDynamicSourcePath(childDisplay)) continue;
        walk(path.join(absolute, child.name), childDisplay);
        if (blockers.includes('source_manifest_file_limit_exceeded') || blockers.includes('source_manifest_byte_limit_exceeded')) return;
      }
      return;
    }
    if (!stat.isFile()) return;
    if (seenEntryPaths.has(displayPath)) return;
    if (entries.length >= SOURCE_MANIFEST_MAX_FILES) {
      addBlocker('source_manifest_file_limit_exceeded');
      return;
    }
    if (totalBytes + stat.size > SOURCE_MANIFEST_MAX_BYTES) {
      addBlocker('source_manifest_byte_limit_exceeded');
      return;
    }
    let bytes: Buffer;
    try { bytes = fs.readFileSync(absolute); } catch {
      addBlocker(`source_manifest_path_unreadable:${displayPath}`);
      return;
    }
    totalBytes += bytes.length;
    seenEntryPaths.add(displayPath);
    entries.push({ path: displayPath, bytes: bytes.length, sha256: sha256(bytes) });
  };

  if (!realRoot) addBlocker('source_manifest_root_missing');
  for (const citation of citations) {
    if (!realRoot) break;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(citation)) {
      addBlocker(`source_manifest_remote_citation_unbound:${citation}`);
      continue;
    }
    const absolute = path.isAbsolute(citation) ? path.resolve(citation) : path.resolve(resolvedRoot, citation);
    const relative = normalizedRelativePath(path.relative(resolvedRoot, absolute));
    if (!pathIsInside(resolvedRoot, absolute)) {
      addBlocker(`source_manifest_path_outside_root:${citation}`);
      continue;
    }
    if (isDynamicSourcePath(relative)) {
      excludedDynamicCitations.push(relative);
      continue;
    }
    includedCitations.push(relative);
    let stat: fs.Stats;
    try { stat = fs.statSync(absolute); } catch {
      addBlocker(`source_manifest_path_unreadable:${relative}`);
      continue;
    }
    roots.push({ path: relative, kind: stat.isDirectory() ? 'directory' : 'file' });
    walk(absolute, relative);
  }
  roots.sort((a, b) => a.path.localeCompare(b.path));
  links.sort((a, b) => a.path.localeCompare(b.path));
  entries.sort((a, b) => a.path.localeCompare(b.path));
  blockers.sort((a, b) => a.localeCompare(b));
  return {
    schema: TRIWIKI_SOURCE_MANIFEST_SCHEMA,
    scope: 'authoritative_citation_bytes',
    root_binding: 'project_relative',
    limits: { max_files: SOURCE_MANIFEST_MAX_FILES, max_total_bytes: SOURCE_MANIFEST_MAX_BYTES },
    excluded_dynamic_prefixes: [...DYNAMIC_SOURCE_PREFIXES],
    citations: includedCitations.sort((a, b) => a.localeCompare(b)),
    excluded_dynamic_citations: excludedDynamicCitations.sort((a, b) => a.localeCompare(b)),
    roots,
    links,
    entries,
    file_count: entries.length,
    total_bytes: totalBytes,
    complete: blockers.length === 0,
    blockers
  };
}

export function triWikiSourceSnapshotId(sourceManifest: TriWikiSourceManifest): string {
  return sha256(canonicalJson(sourceManifest));
}

export function triWikiPayloadSha256(pack: any): string {
  const provenance = pack?.provenance && typeof pack.provenance === 'object'
    ? { ...pack.provenance }
    : {};
  delete provenance.payload_sha256;
  return sha256(canonicalJson({ ...pack, provenance }));
}

export function sealTriWikiContextPack(
  pack: any,
  options: { generatedAt?: string; packageVersion?: string; root?: string | null } = {}
) {
  const { provenance: _priorProvenance, ...payload } = pack || {};
  const sourceManifest = buildTriWikiSourceManifest(payload, options.root);
  const provenance: Omit<TriWikiContextPackProvenance, 'payload_sha256'> & { payload_sha256?: string } = {
    schema: TRIWIKI_CONTEXT_PACK_PROVENANCE_SCHEMA,
    generated_at: options.generatedAt || nowIso(),
    package_snapshot_id: `sneakoscope@${options.packageVersion || PACKAGE_VERSION}`,
    source_snapshot_id: triWikiSourceSnapshotId(sourceManifest),
    source_manifest: sourceManifest
  };
  const sealed = { ...payload, provenance };
  provenance.payload_sha256 = triWikiPayloadSha256(sealed);
  return sealed as typeof payload & { provenance: TriWikiContextPackProvenance };
}

export function validateTriWikiContextPackProvenance(
  pack: any,
  options: { packageVersion?: string; root?: string | null } = {}
) {
  const issues: any[] = [];
  const provenance = pack?.provenance;
  if (!provenance || typeof provenance !== 'object') {
    issues.push({ id: 'context_pack_provenance_missing', severity: 'error' });
    return { ok: false, issues };
  }
  if (provenance.schema !== TRIWIKI_CONTEXT_PACK_PROVENANCE_SCHEMA) {
    issues.push({ id: 'context_pack_provenance_schema', severity: 'error' });
  }
  const generatedAt = String(provenance.generated_at || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(generatedAt) || !Number.isFinite(Date.parse(generatedAt))) {
    issues.push({ id: 'context_pack_generated_at', severity: 'error' });
  }
  const expectedPackage = `sneakoscope@${options.packageVersion || PACKAGE_VERSION}`;
  if (provenance.package_snapshot_id !== expectedPackage) {
    issues.push({ id: 'context_pack_package_snapshot_mismatch', severity: 'error' });
  }
  const sourceManifest = provenance.source_manifest;
  if (!sourceManifest || sourceManifest.schema !== TRIWIKI_SOURCE_MANIFEST_SCHEMA || sourceManifest.scope !== 'authoritative_citation_bytes') {
    issues.push({ id: 'context_pack_source_manifest_missing', severity: 'error' });
  }
  if (sourceManifest?.complete !== true || !Array.isArray(sourceManifest?.blockers) || sourceManifest.blockers.length) {
    issues.push({ id: 'context_pack_source_manifest_incomplete', severity: 'error' });
  }
  const storedSource = sourceManifest ? triWikiSourceSnapshotId(sourceManifest) : '';
  if (!/^[0-9a-f]{64}$/.test(String(provenance.source_snapshot_id || '')) || provenance.source_snapshot_id !== storedSource) {
    issues.push({ id: 'context_pack_source_snapshot_mismatch', severity: 'error' });
  }
  const currentSourceManifest = buildTriWikiSourceManifest(pack, options.root);
  if (!currentSourceManifest.complete) issues.push({ id: 'context_pack_current_source_manifest_incomplete', severity: 'error' });
  if (provenance.source_snapshot_id !== triWikiSourceSnapshotId(currentSourceManifest)) {
    issues.push({ id: 'context_pack_source_bytes_mismatch', severity: 'error' });
  }
  const expectedPayload = triWikiPayloadSha256(pack);
  if (!/^[0-9a-f]{64}$/.test(String(provenance.payload_sha256 || '')) || provenance.payload_sha256 !== expectedPayload) {
    issues.push({ id: 'context_pack_payload_sha256_mismatch', severity: 'error' });
  }
  return { ok: issues.length === 0, issues };
}
