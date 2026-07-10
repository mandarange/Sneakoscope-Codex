import path from 'node:path';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { DEFAULT_CODEX_REASONING_EFFORT, REQUIRED_CODEX_MODEL } from '../codex-model-guard.js';
import { ALLOWED_REASONING_EFFORTS } from '../routes.js';

export async function profileCommand(sub: any, args: any = []) {
  const root = await sksRoot();
  if (sub === 'show') return console.log(JSON.stringify(await readJson(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: REQUIRED_CODEX_MODEL, reasoning_effort: DEFAULT_CODEX_REASONING_EFFORT }), null, 2));
  if (sub === 'set') {
    const effort = args[0] || DEFAULT_CODEX_REASONING_EFFORT;
    if (!ALLOWED_REASONING_EFFORTS.has(effort)) throw new Error(`unsupported reasoning effort: ${effort}; use ${[...ALLOWED_REASONING_EFFORTS].join(', ')}`);
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: REQUIRED_CODEX_MODEL, reasoning_effort: effort, set_at: new Date().toISOString() });
    return console.log(`Model profile set: ${REQUIRED_CODEX_MODEL} ${effort}`);
  }
  console.error(`Usage: sks profile show|set <${[...ALLOWED_REASONING_EFFORTS].join('|')}>`);
}
