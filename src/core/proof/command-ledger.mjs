import path from 'node:path';
import { appendJsonl, nowIso, packageRoot, readText } from '../fsx.mjs';
import { redactSecrets } from '../secret-redaction.mjs';
import { proofDir } from './proof-writer.mjs';

export async function appendProofCommand(root = packageRoot(), command = {}) {
  const record = redactSecrets({ ts: nowIso(), ...command });
  await appendJsonl(path.join(proofDir(root), 'commands.jsonl'), record);
  return record;
}

export async function readProofCommands(root = packageRoot()) {
  const text = await readText(path.join(proofDir(root), 'commands.jsonl'), '');
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}
