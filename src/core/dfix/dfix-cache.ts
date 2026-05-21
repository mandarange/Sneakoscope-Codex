import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';

export const DFIX_CACHE_DIR = '.sneakoscope/cache/dfix';

export async function lookupDfixCache(root: string, dir: string, signature: any, opts: any = {}) {
  const cacheDir = path.join(root, DFIX_CACHE_DIR);
  const cachePath = path.join(cacheDir, `${signature.signature_hash}.json`);
  const record = await readJson(cachePath, null);
  const projectHash = await projectHashFor(root);
  const fileHash = signature.file ? await fileHashFor(root, signature.file) : null;
  if (record && record.project_hash === projectHash && (!signature.file || record.file_hash === fileHash)) {
    const hit = {
      schema: 'sks.dfix-cache-hit.v1',
      created_at: nowIso(),
      cache_path: path.relative(root, cachePath),
      signature_hash: signature.signature_hash,
      previous_fix_hint: record.successful_patch || null,
      avoidance_rule: record.failed_patch_wrongness || null,
      recurrence_count: Number(record.recurrence_count || 0) + 1
    };
    await writeJsonAtomic(path.join(dir, 'dfix-cache-hit.json'), hit);
    await writeJsonAtomic(cachePath, { ...record, recurrence_count: hit.recurrence_count, last_seen_at: nowIso() });
    return hit;
  }
  const miss = {
    schema: 'sks.dfix-cache-miss.v1',
    created_at: nowIso(),
    cache_path: path.relative(root, cachePath),
    signature_hash: signature.signature_hash,
    project_hash: projectHash,
    file_hash: fileHash,
    shared_cache_publish: false
  };
  await writeJsonAtomic(path.join(dir, 'dfix-cache-miss.json'), miss);
  return miss;
}

export async function recordDfixCache(root: string, signature: any, data: any = {}) {
  const cachePath = path.join(root, DFIX_CACHE_DIR, `${signature.signature_hash}.json`);
  await writeJsonAtomic(cachePath, {
    schema: 'sks.dfix-cache-record.v1',
    updated_at: nowIso(),
    signature_hash: signature.signature_hash,
    project_hash: await projectHashFor(root),
    file_hash: signature.file ? await fileHashFor(root, signature.file) : null,
    successful_patch: data.successful_patch || null,
    failed_patch_wrongness: data.failed_patch_wrongness || null,
    verification_command: data.verification_command || null,
    recurrence_count: Number(data.recurrence_count || 0),
    shared_cache_publish: false
  });
}

async function projectHashFor(root: string) {
  const pkg = await fsp.readFile(path.join(root, 'package.json'), 'utf8').catch(() => '');
  const cargo = await fsp.readFile(path.join(root, 'Cargo.toml'), 'utf8').catch(() => '');
  return sha256(`${pkg}\n${cargo}`).slice(0, 24);
}

async function fileHashFor(root: string, rel: string) {
  const absolute = path.resolve(root, rel);
  if (!(await exists(absolute))) return null;
  return sha256(await fsp.readFile(absolute)).slice(0, 24);
}
