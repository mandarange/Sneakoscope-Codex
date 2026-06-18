import fsp from 'node:fs/promises';
import path from 'node:path';

const SECRET_PATTERN = /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+|sk-(?:or-)?[A-Za-z0-9_-]{12,}|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)\b/;
const SECRET_KEY_PATTERN = /^(authorization|api_key|apiKey|access_token|token|secret|password|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)$/i;
const REDACTED_MARKERS = new Set(['[REDACTED]', '<redacted>', 'sk-or-[REDACTED]', 'Bearer [REDACTED]']);

export interface GlmNarutoSecretAuditResult {
  readonly schema: 'sks.glm-naruto-secret-audit.v1';
  readonly ok: boolean;
  readonly root: string;
  readonly scanned_files: number;
  readonly findings: readonly string[];
}

export async function auditGlmNarutoArtifactsForSecrets(root: string): Promise<GlmNarutoSecretAuditResult> {
  const findings: string[] = [];
  let scanned = 0;
  await scan(root, async (file) => {
    if (!/\.(json|jsonl|md|txt)$/i.test(file)) return;
    scanned++;
    const content = await fsp.readFile(file, 'utf8').catch(() => '');
    const fileFindings = auditContentForSecrets(content);
    if (fileFindings.length) findings.push(`${path.relative(root, file)}:${fileFindings.join(',')}`);
  });
  return {
    schema: 'sks.glm-naruto-secret-audit.v1',
    ok: findings.length === 0,
    root,
    scanned_files: scanned,
    findings
  };
}

export function auditContentForSecrets(content: string): readonly string[] {
  const findings: string[] = [];
  if (SECRET_PATTERN.test(content)) findings.push('secret_like_content');
  for (const parsed of parseJsonLike(content)) {
    collectJsonSecretFindings(parsed, findings);
  }
  return [...new Set(findings)];
}

function parseJsonLike(content: string): unknown[] {
  const parsed: unknown[] = [];
  try {
    parsed.push(JSON.parse(content));
    return parsed;
  } catch {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    try {
      parsed.push(JSON.parse(trimmed));
    } catch {}
  }
  return parsed;
}

function collectJsonSecretFindings(value: unknown, findings: string[], key = ''): void {
  if (!value || typeof value !== 'object') {
    if (SECRET_KEY_PATTERN.test(key) && typeof value === 'string' && value.trim() && !REDACTED_MARKERS.has(value.trim())) {
      findings.push(`secret_key:${key}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonSecretFindings(item, findings, key);
    return;
  }
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(entryKey)) {
      if (typeof entryValue === 'string' && entryValue.trim() && !REDACTED_MARKERS.has(entryValue.trim())) findings.push(`secret_key:${entryKey}`);
      else if (entryValue && typeof entryValue === 'object') findings.push(`secret_key:${entryKey}`);
    }
    collectJsonSecretFindings(entryValue, findings, entryKey);
  }
}

async function scan(dir: string, visit: (file: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(dir, String(entry.name));
    if (entry.isDirectory()) await scan(p, visit);
    else if (entry.isFile()) await visit(p);
  }
}
