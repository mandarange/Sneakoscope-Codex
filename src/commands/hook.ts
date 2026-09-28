import { emitHook } from '../core/hooks-runtime.js';
import { hookLayerFromArgs } from '../core/hooks-runtime/hook-layer.js';

export async function run(_command: any, args: any = []) {
  const [name = 'user-prompt-submit', ...rest] = args;
  return emitHook(name, { layer: hookLayerFromArgs(rest) });
}
