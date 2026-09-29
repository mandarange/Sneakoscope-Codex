import os from 'node:os';
import path from 'node:path';
import {
  codexHomePath
} from './codex-model-catalog.js';
import { uniqueStrings } from '../text/strings.js';

export { uniqueStrings };

export function resolveCatalogPath(value: string, input: {
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly configPath?: string;
}): string {
  const env = input.env || process.env;
  const home = input.home || env.HOME || os.homedir();
  const trimmed = String(value || '').trim();
  if (trimmed === '~') return path.resolve(home);
  if (trimmed.startsWith('~/')) return path.resolve(home, trimmed.slice(2));
  if (!path.isAbsolute(trimmed)) {
    return path.resolve(
      input.configPath ? path.dirname(input.configPath) : codexHomePath({ home, env }),
      trimmed
    );
  }
  return path.resolve(trimmed);
}

export function isLoopbackHostname(value: string): boolean {
  const hostname = String(value || '').trim().toLowerCase();
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

