import { hookMain } from '../core/hooks-runtime.mjs';
import { printJson } from '../cli/output.mjs';

export async function run(_command, args = []) {
  const [name = 'user-prompt-submit'] = args;
  const result = await hookMain(name);
  return printJson(result);
}
