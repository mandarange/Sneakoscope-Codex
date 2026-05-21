import path from 'node:path';
import { sha256, nowIso, writeJsonAtomic } from '../fsx.js';
import { redactSecrets } from '../secret-redaction.js';

export type DfixErrorSignature = {
  schema: 'sks.dfix-error-signature.v1';
  created_at: string;
  command: string | null;
  cwd: string;
  file: string | null;
  line: number | null;
  error_code: string | null;
  error_kind: string;
  normalized_message: string;
  signature_hash: string;
  tags: string[];
  redacted: true;
};

export async function writeDfixErrorSignatureArtifact(dir: string, input: any = {}) {
  const signature = buildDfixErrorSignature(input);
  await writeJsonAtomic(path.join(dir, 'dfix-error-signature.json'), signature);
  return signature;
}

export function buildDfixErrorSignature(input: any = {}): DfixErrorSignature {
  const text = String(input.error || input.stderr || input.stdout || input.observed || input.prompt || '');
  const redactedText = String(redactSecrets(text));
  const fileLine = extractFileLine(redactedText);
  const errorCode = extractErrorCode(redactedText);
  const errorKind = classifyErrorKind(redactedText, errorCode);
  const normalizedMessage = normalizeMessage(redactedText);
  const signatureBody = {
    command: input.command || null,
    cwd: path.resolve(String(input.cwd || process.cwd())),
    file: input.file || fileLine.file || null,
    line: input.line || fileLine.line || null,
    error_code: errorCode,
    error_kind: errorKind,
    normalized_message: normalizedMessage
  };
  return {
    schema: 'sks.dfix-error-signature.v1',
    created_at: nowIso(),
    ...signatureBody,
    signature_hash: sha256(JSON.stringify(signatureBody)).slice(0, 24),
    tags: tagsForError(redactedText, errorKind),
    redacted: true
  };
}

function extractFileLine(text: string) {
  const patterns = [
    /\b((?:[./\w-]+\/)?[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|rs|py|md)):(\d+)(?::\d+)?/,
    /\bat\s+(?:[^(]+\()?((?:[./\w-]+\/)?[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs)):(\d+):\d+\)?/,
    /\bFile "([^"]+\.py)", line (\d+)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return { file: match[1], line: Number(match[2] || 0) || null };
  }
  return { file: null, line: null };
}

function extractErrorCode(text: string): string | null {
  const match = text.match(/\b(TS\d{4}|E[A-Z0-9_]+|ERR_[A-Z0-9_]+|E\d{4}|AssertionError|ValidationError|SyntaxError|TypeError|ReferenceError)\b/);
  return match?.[1] || null;
}

function classifyErrorKind(text: string, code: string | null): string {
  if (code?.startsWith('TS')) return 'typescript';
  if (/rustc|error\[E\d+\]|cargo/i.test(text)) return 'rust';
  if (/pytest|Traceback|File ".*", line \d+/i.test(text)) return 'python-pytest';
  if (/vitest|jest|AssertionError|expected .* to/i.test(text)) return 'test-assertion';
  if (/ENOENT|no such file|missing file/i.test(text)) return 'missing-file';
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|module not found|import error/i.test(text)) return 'module-not-found';
  if (/TypeError|undefined|null/i.test(text)) return 'nullish-typeerror';
  if (/schema|validation|required property|invalid json/i.test(text)) return 'schema-validation';
  if (/trust hook|trusu hook|untrusted hook|modified hook|unsupported.*hook|hook warning/i.test(text)) return 'hook-warning';
  if (/CODEX_LB|codex-lb|OPENAI_API_KEY|env/i.test(text)) return 'codex-lb-env';
  if (/UX|PPT|visual|screenshot|imagegen|artifact graph/i.test(text)) return 'visual-artifact-gate';
  return 'generic';
}

function normalizeMessage(text: string): string {
  return text
    .replace(/\b[0-9a-f]{7,64}\b/gi, '<hash>')
    .replace(/\b\d+:\d+\b/g, '<line:col>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function tagsForError(text: string, kind: string): string[] {
  const tags = new Set([kind]);
  if (/hook/i.test(text)) tags.add('hooks');
  if (/DFix|dfix/i.test(text)) tags.add('dfix');
  if (/UX|PPT|visual|image/i.test(text)) tags.add('visual');
  if (/package\.json|version/i.test(text)) tags.add('version');
  return [...tags];
}
