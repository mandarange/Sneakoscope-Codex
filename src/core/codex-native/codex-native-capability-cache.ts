import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import type { CodexNativeFeatureMatrix } from './codex-native-feature-matrix.js';

const CACHE_RELATIVE_PATH = '.sneakoscope/reports/codex-native-feature-matrix.json';

export function codexNativeCapabilityCachePath(root: string): string {
  return path.join(root, CACHE_RELATIVE_PATH);
}

export async function readCodexNativeCapabilityCache(root: string): Promise<CodexNativeFeatureMatrix | null> {
  const file = codexNativeCapabilityCachePath(root);
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  if (!text) return null;
  const parsed = JSON.parse(text) as CodexNativeFeatureMatrix;
  return parsed?.schema === 'sks.codex-native-feature-matrix.v1' ? parsed : null;
}

export async function writeCodexNativeCapabilityCache(root: string, matrix: CodexNativeFeatureMatrix): Promise<string> {
  const file = codexNativeCapabilityCachePath(root);
  await writeJsonAtomic(file, matrix);
  return file;
}
