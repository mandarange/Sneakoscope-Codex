import path from 'node:path';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { DEFAULT_CODEX_REASONING_EFFORT } from '../codex-model-guard.js';
import { ALLOWED_REASONING_EFFORTS } from '../routes.js';

export async function profileCommand(sub: any, args: any = []) {
  const root = await sksRoot();
  if (sub === 'show') return console.log(JSON.stringify(await readJson(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: null, model_policy: 'inherit_codex_selection', reasoning_effort: DEFAULT_CODEX_REASONING_EFFORT }), null, 2));
  if (sub === 'set') {
    const effort = args[0] || DEFAULT_CODEX_REASONING_EFFORT;
    if (!ALLOWED_REASONING_EFFORTS.has(effort)) throw new Error(`unsupported reasoning effort: ${effort}; use ${[...ALLOWED_REASONING_EFFORTS].join(', ')}`);
    const modelIndex = args.indexOf('--model');
    const model = modelIndex >= 0 ? String(args[modelIndex + 1] || '').trim() : '';
    if (modelIndex >= 0 && !model) throw new Error('--model requires a Codex model identifier');
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'model', 'current.json'), {
      model: model || null,
      model_policy: model ? 'explicit' : 'inherit_codex_selection',
      reasoning_effort: effort,
      set_at: new Date().toISOString()
    });
    return console.log(`Model profile set: ${model || 'Codex-selected model'} ${effort}`);
  }
  console.error(`Usage: sks profile show|set <${[...ALLOWED_REASONING_EFFORTS].join('|')}> [--model <codex-model-id>]`);
}
