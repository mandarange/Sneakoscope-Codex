import path from 'node:path';
import { readJson } from '../fsx.mjs';

export async function readScoutTriWikiHint(root) {
  const pack = await readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null);
  if (!pack) return {
    available: false,
    status: 'missing',
    attention_use_first: [],
    attention_hydrate_first: []
  };
  return {
    available: true,
    status: 'present',
    schema: pack.schema || pack.schema_version || null,
    attention_use_first: (pack.attention?.use_first || []).slice(0, 5),
    attention_hydrate_first: (pack.attention?.hydrate_first || []).slice(0, 5)
  };
}
