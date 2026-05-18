// @ts-nocheck
import { emitHook } from '../core/hooks-runtime.js';

export async function run(_command, args = []) {
  const [name = 'user-prompt-submit'] = args;
  return emitHook(name);
}
