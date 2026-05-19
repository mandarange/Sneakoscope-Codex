import path from 'node:path';
import { appendJsonl, nowIso, packageRoot, readText } from '../fsx.js';
import { redactSecrets } from '../secret-redaction.js';
import { proofDir } from './proof-writer.js';

export async function appendProofCommand(root: any = packageRoot(), command: any = {}) {
  const record = redactSecrets({ ts: nowIso(), ...command });
  await appendJsonl(path.join(proofDir(root), 'commands.jsonl'), record);
  return record;
}

export async function readProofCommands(root: any = packageRoot()) {
  const text = await readText(path.join(proofDir(root), 'commands.jsonl'), '');
  return text.split(/\r?\n/).filter(Boolean).map((line: any) => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}
