import fsp from 'node:fs/promises';
import path from 'node:path';

const SECRET_PATTERN = /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+|sk-(?:or-)?[A-Za-z0-9_-]{12,}|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)\b/;

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
    if (SECRET_PATTERN.test(content)) findings.push(path.relative(root, file));
  });
  return {
    schema: 'sks.glm-naruto-secret-audit.v1',
    ok: findings.length === 0,
    root,
    scanned_files: scanned,
    findings
  };
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
