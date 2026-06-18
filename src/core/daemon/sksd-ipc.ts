import fs from 'node:fs';
import path from 'node:path';

export type SksdRequest =
  | { type: 'status' }
  | { type: 'warm'; root: string }
  | { type: 'proof-bank-status'; root: string }
  | { type: 'triwiki-index'; root: string }
  | { type: 'build-once'; root: string; mode: 'incremental' | 'clean' }
  | { type: 'probe'; root: string; probe_id: string }
  | { type: 'stop' };

export interface SksdIpcMessage {
  schema: 'sks.sksd-ipc-message.v1';
  action: 'status' | 'warm' | 'stop' | 'start' | 'proof-bank-status' | 'triwiki-index' | 'build-once' | 'probe';
  created_at: string;
  pid: number;
  request?: SksdRequest;
  response_path?: string;
}

export function writeSksdIpcMessage(root: string, action: SksdIpcMessage['action'], request?: SksdRequest): string {
  const file = path.join(ipcDir(root), 'last-message.json');
  const responsePath = path.join(ipcDir(root), `response-${process.pid}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.sksd-ipc-message.v1', action, created_at: new Date().toISOString(), pid: process.pid, request, response_path: responsePath }, null, 2)}\n`);
  return file;
}

export function writeSksdIpcResponse(root: string, request: SksdRequest, response: unknown): string {
  const file = path.join(ipcDir(root), `response-${process.pid}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.sksd-ipc-response.v1', request, response, responded_at: new Date().toISOString() }, null, 2)}\n`);
  return file;
}

function ipcDir(root: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'sksd');
}
