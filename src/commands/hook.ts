import { emitHook } from '../core/hooks-runtime.js';

export async function run(_command: any, args: any = []) {
  const [name = 'user-prompt-submit'] = args;
  return emitHook(name);
}
