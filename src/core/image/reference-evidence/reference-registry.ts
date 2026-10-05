import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, writeJsonAtomic } from '../../fsx.js';

export type ImageReferenceConsent = 'local-only' | 'external-transfer-approved';
export type ImageReferenceStatus = 'valid' | 'expired_reference';

export interface ImageReferenceEvidence {
  readonly schema: 'sks.image-reference-evidence.v1';
  readonly id: string;
  readonly locator: { readonly kind: 'path' | 'uri'; readonly value: string };
  readonly sha256: string;
  readonly size_bytes: number;
  readonly media_type: string;
  readonly mtime_ms: number | null;
  readonly consent: ImageReferenceConsent;
  readonly scope: 'inside-root' | 'external-explicit' | 'remote-uri';
  readonly status: ImageReferenceStatus;
  readonly reason_code: string | null;
}

export async function registerPathImageReference(input: {
  id: string;
  filePath: string;
  allowedRoots: readonly string[];
  consent?: ImageReferenceConsent;
  allowOutOfRoot?: boolean;
}): Promise<ImageReferenceEvidence> {
  const id = safeId(input.id);
  const absolute = path.resolve(input.filePath);
  const lstat = await fsp.lstat(absolute).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error('image_reference_missing');
    throw error;
  });
  if (lstat.isSymbolicLink()) throw new Error('image_reference_symlink_forbidden');
  if (!lstat.isFile()) throw new Error('image_reference_not_file');
  const real = await fsp.realpath(absolute);
  const canonicalRoots = await Promise.all(input.allowedRoots.map(async (root) => {
    const resolved = path.resolve(root);
    return fsp.realpath(resolved).catch(() => resolved);
  }));
  const inside = canonicalRoots.some((root) => isInside(root, real));
  if (!inside && !input.allowOutOfRoot) throw new Error('image_reference_out_of_root');
  return {
    schema: 'sks.image-reference-evidence.v1', id,
    locator: { kind: 'path', value: absolute },
    sha256: await sha256File(absolute), size_bytes: lstat.size,
    media_type: mediaTypeForPath(absolute), mtime_ms: lstat.mtimeMs,
    consent: input.consent || 'local-only', scope: inside ? 'inside-root' : 'external-explicit',
    status: 'valid', reason_code: null
  };
}

export async function writeImageReferenceRegistry(file: string, references: readonly ImageReferenceEvidence[]): Promise<void> {
  const ids = new Set<string>();
  for (const reference of references) {
    if (ids.has(reference.id)) throw new Error('image_reference_duplicate_id');
    ids.add(reference.id);
  }
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeJsonAtomic(file, { schema: 'sks.image-reference-registry.v1', references });
}

export async function upsertImageReferenceRegistry(file: string, reference: ImageReferenceEvidence): Promise<void> {
  let existing: ImageReferenceEvidence[] = [];
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8')) as { schema?: unknown; references?: unknown };
    if (parsed.schema === 'sks.image-reference-registry.v1' && Array.isArray(parsed.references)) existing = parsed.references as ImageReferenceEvidence[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeImageReferenceRegistry(file, [...existing.filter((entry) => entry.id !== reference.id), reference]);
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(String(value || ''))) throw new Error('image_reference_id_invalid');
  return value;
}

function mediaTypeForPath(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  throw new Error('image_reference_media_type_unsupported');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function sha256File(file: string): Promise<string> {
  return sha256(await fsp.readFile(file));
}
