import path from 'node:path';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { ALLOWED_REASONING_EFFORTS } from '../routes.js';

export async function profileCommand(sub: any, args: any = []) {
  const root = await sksRoot();
  if (sub === 'show') return console.log(JSON.stringify(await readJson(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: 'gpt-5.5', reasoning_effort: 'medium' }), null, 2));
  if (sub === 'set') {
    const effort = args[0] || 'medium';
    if (!ALLOWED_REASONING_EFFORTS.has(effort)) throw new Error(`unsupported reasoning effort: ${effort}; use low, medium, high, or xhigh`);
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: 'gpt-5.5', reasoning_effort: effort, set_at: new Date().toISOString() });
    return console.log(`Model profile set: gpt-5.5 ${effort}`);
  }
  console.error('Usage: sks profile show|set <low|medium|high|xhigh>');
}
