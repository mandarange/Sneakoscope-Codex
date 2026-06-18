import crypto from 'node:crypto';
import path from 'node:path';
import { estimateGlmTokens, GLM_SPEED_CONTEXT_HARD_CAP_TOKENS, GLM_SPEED_CONTEXT_TARGET_TOKENS, trimToEstimatedTokens } from './glm-context-budget.js';

export interface GlmSpeedContext {
  readonly schema: 'sks.glm-speed-context.v1';
  readonly digest: string;
  readonly estimatedTokens: number;
  readonly sections: readonly GlmContextSection[];
  readonly omitted: readonly GlmContextOmission[];
}

export interface GlmContextSection {
  readonly kind: 'task' | 'git_status' | 'file_snippet' | 'error' | 'rules' | 'constraints';
  readonly path?: string;
  readonly content: string;
  readonly tokenEstimate: number;
}

export interface GlmContextOmission {
  readonly kind: string;
  readonly path?: string;
  readonly reason: string;
}

export interface BuildGlmSpeedContextInput {
  readonly task: string;
  readonly cwd: string;
  readonly gitStatus?: string;
  readonly mentionedPaths?: readonly string[];
  readonly lastError?: string;
  readonly readFile?: (absolutePath: string) => Promise<string | null>;
  readonly readFileSnippet?: (absolutePath: string, maxBytes: number) => Promise<string | null>;
  readonly maxFileBytes?: number;
  readonly maxTokens?: number;
}

const GENERATED_PATH = /(^|\/)(dist|node_modules|coverage|\.git)(\/|$)|(\.generated\.|\.map$)/;
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;

export async function buildGlmSpeedContext(input: BuildGlmSpeedContextInput): Promise<GlmSpeedContext> {
  const maxTokens = Math.min(input.maxTokens || GLM_SPEED_CONTEXT_TARGET_TOKENS, GLM_SPEED_CONTEXT_HARD_CAP_TOKENS);
  const maxFileBytes = Math.max(1024, input.maxFileBytes || DEFAULT_MAX_FILE_BYTES);
  const sections: GlmContextSection[] = [];
  const omitted: GlmContextOmission[] = [];
  addSection(sections, 'task', input.task);
  addSection(sections, 'constraints', 'GLM speed mode: compact context, one-shot patch, no GPT/OpenAI fallback, no full TriWiki/proof-bank/repo dump.');
  if (input.gitStatus) addSection(sections, 'git_status', input.gitStatus);
  if (input.lastError) addSection(sections, 'error', trimToEstimatedTokens(input.lastError, 2000));

  const readFile = input.readFile || (async () => null);
  for (const mentioned of input.mentionedPaths || []) {
    const normalized = mentioned.replace(/\\/g, '/');
    if (GENERATED_PATH.test(normalized)) {
      omitted.push({ kind: 'generated_or_large_path', path: mentioned, reason: 'speed_context_excludes_generated_or_vendor_paths' });
      continue;
    }
    const absolute = path.isAbsolute(mentioned) ? mentioned : path.join(input.cwd, mentioned);
    const rawText = input.readFileSnippet ? await input.readFileSnippet(absolute, maxFileBytes) : await readFile(absolute);
    const text = rawText === null ? null : trimToUtf8Bytes(rawText, maxFileBytes);
    if (text === null) {
      omitted.push({ kind: 'file_snippet', path: mentioned, reason: 'unreadable_or_missing' });
      continue;
    }
    if (Buffer.byteLength(rawText || '', 'utf8') > maxFileBytes) {
      omitted.push({ kind: 'file_snippet_tail', path: mentioned, reason: 'speed_context_file_byte_budget' });
    }
    addSection(sections, 'file_snippet', trimToEstimatedTokens(text, 2400), path.relative(input.cwd, absolute) || mentioned);
  }

  const compact = enforceBudget(sections, omitted, maxTokens);
  return {
    schema: 'sks.glm-speed-context.v1',
    digest: digestJson({ sections: compact.sections, omitted: compact.omitted }),
    estimatedTokens: compact.sections.reduce((sum, section) => sum + section.tokenEstimate, 0),
    sections: compact.sections,
    omitted: compact.omitted
  };
}

function addSection(
  sections: GlmContextSection[],
  kind: GlmContextSection['kind'],
  content: string,
  sectionPath?: string
): void {
  sections.push({
    kind,
    ...(sectionPath ? { path: sectionPath } : {}),
    content,
    tokenEstimate: estimateGlmTokens(content)
  });
}

function enforceBudget(
  sections: readonly GlmContextSection[],
  omitted: readonly GlmContextOmission[],
  maxTokens: number
): { sections: readonly GlmContextSection[]; omitted: readonly GlmContextOmission[] } {
  const kept: GlmContextSection[] = [];
  const nextOmitted = [...omitted];
  let total = 0;
  for (const section of sections) {
    if (total + section.tokenEstimate <= maxTokens) {
      kept.push(section);
      total += section.tokenEstimate;
      continue;
    }
    nextOmitted.push({
      kind: section.kind,
      ...(section.path ? { path: section.path } : {}),
      reason: 'speed_context_token_budget'
    });
  }
  return { sections: kept, omitted: nextOmitted };
}

function digestJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function trimToUtf8Bytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > maxBytes) end -= 1;
  return text.slice(0, end);
}
