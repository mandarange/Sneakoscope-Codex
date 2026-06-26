import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonl, ensureDir, exists, readJson, readText, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import type { EntityFacts, Finding, MutationJournalEvent, MutationOperation, MutationPlan, RollbackManifest, SearchVisibilityCliOptions, SearchVisibilityMode, SiteInventory } from './types.js';
import { routeForMode } from './mission.js';

export async function buildMutationPlan(
  mode: SearchVisibilityMode,
  missionId: string,
  artifactDir: string,
  inventory: SiteInventory,
  findings: Finding[],
  options: SearchVisibilityCliOptions,
  entityFacts: EntityFacts | null
): Promise<MutationPlan> {
  const operations: MutationOperation[] = [];
  const blockers: string[] = [];
  if (inventory.detected_adapter.confidence < 0.6) blockers.push('adapter_detection_confidence_too_low_for_mutation');
  if (inventory.detected_adapter.adapterId === 'unsupported') blockers.push('unsupported_framework_mutation_blocked');
  if (!blockers.length && mode === 'seo') {
    operations.push(...await seoOperations(inventory, findings, options));
  }
  if (!blockers.length && mode === 'geo') {
    operations.push(...await geoOperations(inventory, findings, options, entityFacts));
  }
  const plan: MutationPlan = {
    schema: 'sks.search-visibility.mutation-plan.v1',
    generated_at: new Date().toISOString(),
    mission_id: missionId,
    route: routeForMode(mode),
    mode,
    adapter: inventory.detected_adapter.adapterId,
    detection_confidence: inventory.detected_adapter.confidence,
    status: blockers.length ? 'blocked' : 'planned',
    operations: operations.filter((op) => scopeAllowed(op, options.scope)),
    blockers,
    unverified: ['production deployment and measured outcomes are outside mutation apply'],
  };
  await writeJsonAtomic(path.join(artifactDir, 'mutation-plan.json'), plan);
  return plan;
}

export async function applyMutationPlan(
  root: string,
  missionId: string,
  artifactDir: string,
  plan: MutationPlan,
  options: SearchVisibilityCliOptions
): Promise<{ ok: boolean; status: 'applied' | 'blocked'; applied: number; rollback: RollbackManifest; blockers: string[] }> {
  const blockers = [...plan.blockers];
  if (!options.apply) blockers.push('apply_requires_explicit_--apply');
  const previousRollback = await readJson<RollbackManifest | null>(path.join(artifactDir, 'rollback-manifest.json'), null);
  const rollback: RollbackManifest = {
    schema: 'sks.search-visibility.rollback-manifest.v1',
    generated_at: new Date().toISOString(),
    mission_id: missionId,
    route: plan.route,
    operations: previousRollback?.operations || [],
    blockers,
  };
  if (blockers.length) {
    await writeJsonAtomic(path.join(artifactDir, 'rollback-manifest.json'), rollback);
    await appendJournal(artifactDir, blockedEvent(plan.operations[0] || null, 'mutation preconditions failed'));
    return { ok: false, status: 'blocked', applied: 0, rollback, blockers };
  }
  await ensureDir(path.join(artifactDir, 'backups'));
  let applied = 0;
  let idempotent = 0;
  for (const op of plan.operations) {
    const full = path.resolve(root, op.path);
    if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) {
      blockers.push(`path_outside_root:${op.path}`);
      await appendJournal(artifactDir, blockedEvent(op, 'path outside root'));
      continue;
    }
    const beforeExists = await exists(full);
    const before = beforeExists ? await readText(full, '') : null;
    const beforeSha = before == null ? null : sha256(before);
    if (op.baseSha256 !== beforeSha) {
      if (op.kind === 'create' && beforeExists && beforeSha === op.proposedSha256) {
        idempotent += 1;
        await appendJournal(artifactDir, {
          schema: 'sks.search-visibility.mutation-journal-event.v1',
          ts: new Date().toISOString(),
          operation_id: op.id,
          event: 'applied',
          path: op.path,
          before_sha256: beforeSha,
          after_sha256: beforeSha,
          message: 'operation already applied; idempotent no-op preserved existing rollback manifest',
        });
        continue;
      }
      blockers.push(`base_hash_mismatch:${op.path}`);
      await appendJournal(artifactDir, blockedEvent(op, 'base hash mismatch'));
      continue;
    }
    const dirty = await gitDirtyStatus(root, op.path);
    if (dirty && !options.allowDirtyTouched) {
      blockers.push(`dirty_touched_path:${op.path}`);
      await appendJournal(artifactDir, blockedEvent(op, `dirty touched path blocked: ${dirty}`));
      continue;
    }
    if (op.kind === 'create' && beforeExists) {
      blockers.push(`create_would_overwrite_existing:${op.path}`);
      await appendJournal(artifactDir, blockedEvent(op, 'existing user-authored path'));
      continue;
    }
    const backupPath = before == null ? null : path.join('backups', `${op.id}-${path.basename(op.path)}.bak`);
    if (backupPath && before != null) await writeTextAtomic(path.join(artifactDir, backupPath), before);
    if (op.content == null) {
      blockers.push(`operation_content_missing:${op.id}`);
      await appendJournal(artifactDir, blockedEvent(op, 'operation content missing'));
      continue;
    }
    await writeTextAtomic(full, op.content);
    const after = await readText(full, '');
    const afterSha = sha256(after);
    rollback.operations.push({
      operation_id: op.id,
      path: op.path,
      inverse: before == null ? 'delete-created' : 'restore-content',
      before_sha256: beforeSha,
      after_sha256: afterSha,
      backup_path: backupPath,
    });
    applied += 1;
    await appendJournal(artifactDir, {
      schema: 'sks.search-visibility.mutation-journal-event.v1',
      ts: new Date().toISOString(),
      operation_id: op.id,
      event: 'applied',
      path: op.path,
      before_sha256: beforeSha,
      after_sha256: afterSha,
      message: 'operation applied with base hash verification',
    });
  }
  rollback.blockers = blockers;
  await writeJsonAtomic(path.join(artifactDir, 'rollback-manifest.json'), rollback);
  const completed = applied + idempotent;
  return { ok: blockers.length === 0 && completed === plan.operations.length, status: blockers.length ? 'blocked' : 'applied', applied, rollback, blockers };
}

export async function rollbackMutationPlan(
  root: string,
  artifactDir: string,
  apply: boolean
): Promise<{ ok: boolean; status: 'rolled_back' | 'blocked' | 'planned'; rolled_back: number; blockers: string[] }> {
  const manifest = await readJson<RollbackManifest>(path.join(artifactDir, 'rollback-manifest.json'), {
    schema: 'sks.search-visibility.rollback-manifest.v1',
    generated_at: new Date().toISOString(),
    mission_id: 'unknown',
    route: '$SEO-GEO-OPTIMIZER',
    operations: [],
    blockers: ['rollback_manifest_missing'],
  });
  const blockers = [...(manifest.blockers || [])].filter((blocker) => blocker !== 'apply_requires_explicit_--apply');
  if (!apply) return { ok: true, status: 'planned', rolled_back: 0, blockers: ['rollback_requires_explicit_--apply'] };
  let rolledBack = 0;
  for (const op of [...manifest.operations].reverse()) {
    const full = path.resolve(root, op.path);
    const current = await exists(full) ? await readText(full, '') : null;
    const currentSha = current == null ? null : sha256(current);
    if (op.after_sha256 !== currentSha) {
      blockers.push(`rollback_hash_mismatch:${op.path}`);
      await appendJournal(artifactDir, {
        schema: 'sks.search-visibility.mutation-journal-event.v1',
        ts: new Date().toISOString(),
        operation_id: op.operation_id,
        event: 'blocked',
        path: op.path,
        before_sha256: currentSha,
        after_sha256: null,
        message: 'rollback blocked because current hash differs from manifest',
      });
      continue;
    }
    if (op.inverse === 'delete-created') {
      await fs.rm(full, { force: true });
    } else if (op.inverse === 'restore-content' && op.backup_path) {
      const backup = await readText(path.join(artifactDir, op.backup_path), null);
      if (backup == null) {
        blockers.push(`rollback_backup_missing:${op.path}`);
        continue;
      }
      await writeTextAtomic(full, backup);
    }
    rolledBack += 1;
    await appendJournal(artifactDir, {
      schema: 'sks.search-visibility.mutation-journal-event.v1',
      ts: new Date().toISOString(),
      operation_id: op.operation_id,
      event: 'rolled_back',
      path: op.path,
      before_sha256: op.after_sha256,
      after_sha256: op.before_sha256,
      message: 'operation rolled back from manifest',
    });
  }
  return { ok: blockers.length === 0, status: blockers.length ? 'blocked' : 'rolled_back', rolled_back: rolledBack, blockers };
}

async function seoOperations(inventory: SiteInventory, findings: Finding[], options: SearchVisibilityCliOptions): Promise<MutationOperation[]> {
  const operations: MutationOperation[] = [];
  const robotsMissing = findings.some((finding) => finding.ruleId === 'seo-robots-missing');
  const sitemapMissing = findings.some((finding) => finding.ruleId === 'seo-sitemap-missing');
  if (robotsMissing && inventory.detected_adapter.capabilities.robotsMutation) {
    const rel = await preferredPolicyPath(options.root, 'robots.txt');
    const content = managedHeader('robots.txt') + [
      'User-agent: *',
      'Allow: /',
      '',
      inventory.origin ? `Sitemap: ${trimSlash(inventory.origin)}/sitemap.xml` : '# Sitemap: add verified origin before publishing sitemap directive',
      '',
    ].join('\n');
    operations.push(createOperation('seo-create-robots', rel, content, ['F-seo-robots-missing'], ['sks seo-geo-optimizer verify <mission> --mode seo --strict']));
  }
  if (sitemapMissing && inventory.detected_adapter.capabilities.sitemapMutation && inventory.origin) {
    const rel = await preferredPolicyPath(options.root, 'sitemap.xml');
    const urls = (inventory.routes.length ? inventory.routes : [{ path: '/', source: 'fallback', kind: 'static', locale: null }]).filter((route) => route.kind === 'static').slice(0, 500);
    const content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!-- sks-search-visibility managed sitemap; sitemap is discovery evidence, not an indexing guarantee. -->',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((route) => `  <url><loc>${xmlEscape(trimSlash(inventory.origin || '') + (route.path === '/' ? '/' : route.path))}</loc></url>`),
      '</urlset>',
      '',
    ].join('\n');
    operations.push(createOperation('seo-create-sitemap', rel, content, ['F-seo-sitemap-missing'], ['sks seo-geo-optimizer verify <mission> --mode seo --strict']));
  }
  return operations;
}

async function geoOperations(inventory: SiteInventory, findings: Finding[], options: SearchVisibilityCliOptions, entityFacts: EntityFacts | null): Promise<MutationOperation[]> {
  if (!options.includeLlmsTxt) return [];
  const existing = inventory.policy_files.find((file) => file.kind === 'llms' && file.exists);
  if (existing && !existing.managed) return [];
  if (existing) return [];
  const facts = entityFacts?.facts || [];
  const rel = await preferredRootPath(options.root, 'llms.txt');
  const factLines = facts.slice(0, 20).map((fact) => `- ${fact.key}: ${fact.value} (source: ${fact.source})`);
  const content = managedHeader('llms.txt') + [
    `# ${entityFacts?.canonical_name || inventory.package.name || 'Project'} llms.txt`,
    '',
    '> Optional experimental assistant surface generated from source-backed facts. It does not guarantee AI search visibility, citation, ranking, or traffic.',
    '',
    '## Official Sources',
    ...(inventory.package.repository ? [`- Repository: ${inventory.package.repository}`] : []),
    ...(inventory.package.homepage ? [`- Homepage: ${inventory.package.homepage}`] : []),
    '',
    '## Source-Backed Facts',
    ...(factLines.length ? factLines : ['- No publish-safe facts were available.']),
    '',
  ].join('\n');
  return [createOperation('geo-create-llms-txt', rel, content, findings.filter((finding) => finding.ruleId === 'geo-llms-txt-optional-missing').map((finding) => finding.id), ['sks seo-geo-optimizer verify <mission> --mode geo --strict'])];
}

function createOperation(id: string, rel: string, content: string, findingIds: string[], requiredVerification: string[]): MutationOperation {
  return {
    id,
    path: rel,
    baseSha256: null,
    proposedSha256: sha256(content),
    kind: 'create',
    owner: 'sks-search-visibility',
    findingIds,
    reversible: true,
    preview: `Create ${rel} with SKS managed search-visibility content.`,
    content,
    risk: 'low',
    requiredVerification,
    scopeAuthorization: [id, rel],
    ownershipStrategy: 'create-only; never overwrite user-authored files',
  };
}

async function preferredPolicyPath(root: string, file: string): Promise<string> {
  return await exists(path.join(root, 'public')) ? `public/${file}` : file;
}

async function preferredRootPath(_root: string, file: string): Promise<string> {
  return file;
}

function scopeAllowed(op: MutationOperation, scope: string[]): boolean {
  if (!scope.length) return true;
  return scope.some((item) => op.scopeAuthorization.includes(item) || op.path === item || op.id === item);
}

function managedHeader(label: string): string {
  return [
    `# sks-search-visibility managed ${label}`,
    '# owner: sks-search-visibility',
    '# edit policy: generated only after explicit --apply; safe to remove through sks seo-geo-optimizer rollback',
    '',
  ].join('\n');
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function appendJournal(artifactDir: string, event: MutationJournalEvent): Promise<void> {
  await appendJsonl(path.join(artifactDir, 'mutation-journal.jsonl'), event);
}

function blockedEvent(op: MutationOperation | null, message: string): MutationJournalEvent {
  return {
    schema: 'sks.search-visibility.mutation-journal-event.v1',
    ts: new Date().toISOString(),
    operation_id: op?.id || 'none',
    event: 'blocked',
    path: op?.path || '',
    before_sha256: null,
    after_sha256: null,
    message,
  };
}

async function gitDirtyStatus(root: string, rel: string): Promise<string> {
  if (!(await exists(path.join(root, '.git')))) return '';
  const result = spawnSync('git', ['status', '--porcelain', '--', rel], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}
