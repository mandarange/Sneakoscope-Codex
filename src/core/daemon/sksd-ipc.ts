import fs from 'node:fs';
import path from 'node:path';

export interface SksdIpcMessage {
  schema: 'sks.sksd-ipc-message.v1';
  action: 'status' | 'warm' | 'stop';
  created_at: string;
  pid: number;
}

export function writeSksdIpcMessage(root: string, action: SksdIpcMessage['action']): string {
  const file = path.join(root, '.sneakoscope', 'cache', 'sksd', 'last-message.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.sksd-ipc-message.v1', action, created_at: new Date().toISOString(), pid: process.pid }, null, 2)}\n`);
  return file;
}
