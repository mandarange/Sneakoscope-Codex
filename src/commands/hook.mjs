import { emitHook } from '../core/hooks-runtime.mjs';

export async function run(_command, args = []) {
  const [name = 'user-prompt-submit'] = args;
  return emitHook(name);
}
