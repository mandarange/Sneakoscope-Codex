import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../fsx.js';

const DEDUPE_EVENTS = new Set([
  'user-prompt-submit',
  'post-tool',
  'stop',
  'session-start',
  'pre-compact',
  'post-compact',
  'subagent-start',
  'subagent-stop'
]);
const DEFAULT_WINDOW_MS = 3_000;
const DEFAULT_MAX_MARKERS = 64;

export async function claimHookInvocation(root: string, name: unknown, payload: any = {}) {
  const event = String(name || '').trim();
  if (!DEDUPE_EVENTS.has(event)) return { duplicate: false, claimed: false, reason: 'event_not_deduped' };
  const identity = hookInvocationIdentity(event, payload);
  if (!identity) return { duplicate: false, claimed: false, reason: 'stable_host_identity_missing' };

  const windowMs = hookDedupeWindowMs();
  const dir = await prepareDedupeDir(root);
  const digest = sha256(JSON.stringify(identity)).slice(0, 32);
  const marker = path.join(dir, `${digest}.json`);

  const claimed = await createMarker(marker, windowMs);
  await pruneMarkers(dir, windowMs).catch(() => null);
  return {
    duplicate: !claimed,
    claimed,
    reason: claimed ? 'invocation_claimed' : 'duplicate_host_invocation',
    digest
  };
}

function hookInvocationIdentity(event: string, payload: any) {
  const turnId = firstText(payload.turn_id, payload.turnId, payload.request_id, payload.requestId);
  const toolUseId = firstText(payload.tool_use_id, payload.toolUseId, payload.item_id, payload.itemId);
  const agentId = firstText(payload.agent_id, payload.agentId);
  if (!turnId && !toolUseId && !agentId) return null;
  const sessionId = firstText(payload.session_id, payload.sessionId, payload.conversation_id, payload.thread_id, payload.threadId, payload.chat_id);
  const content = event === 'user-prompt-submit'
    ? firstText(payload.prompt, payload.user_prompt, payload.userPrompt, payload.message, payload.input?.prompt, payload.input?.message)
    : event === 'stop'
      ? firstText(payload.last_assistant_message, payload.assistant_message, payload.message, payload.response)
      : '';
  return {
    event,
    session_id: sessionId || null,
    turn_id: turnId || null,
    tool_use_id: toolUseId || null,
    agent_id: agentId || null,
    content_hash: content ? sha256(content).slice(0, 16) : null
  };
}

async function createMarker(marker: string, windowMs: number) {
  try {
    const handle = await fsp.open(marker, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ created_at_ms: Date.now() }));
    } finally {
      await handle.close();
    }
    return true;
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const stat = await fsp.stat(marker).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs <= windowMs) return false;
  await fsp.rm(marker, { force: true }).catch(() => null);
  try {
    const handle = await fsp.open(marker, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ created_at_ms: Date.now() }));
    } finally {
      await handle.close();
    }
    return true;
  } catch (error: any) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}

async function pruneMarkers(dir: string, windowMs: number) {
  const directoryNames = await fsp.readdir(dir).catch(() => [] as string[]);
  const names = directoryNames.filter((name) => /^[0-9a-f]{32}\.json$/.test(name));
  if (names.length <= DEFAULT_MAX_MARKERS) return;
  const cutoff = Date.now() - Math.max(windowMs * 4, 12_000);
  const rows = await Promise.all(names.map(async (name) => {
    const file = path.join(dir, name);
    const stat = await fsp.lstat(file).catch(() => null);
    return { file, mtimeMs: stat?.isFile() && !stat.isSymbolicLink() ? stat.mtimeMs : 0, removable: Boolean(stat?.isFile() && !stat.isSymbolicLink()) };
  }));
  const stale = rows
    .filter((row) => row.removable && row.mtimeMs < cutoff && path.dirname(row.file) === dir)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  const overflow = Math.max(0, rows.length - DEFAULT_MAX_MARKERS);
  for (const row of stale.slice(0, Math.max(overflow, stale.length))) {
    await fsp.rm(row.file, { force: true }).catch(() => null);
  }
}

async function prepareDedupeDir(root: string) {
  const sksDir = path.resolve(root, '.sneakoscope');
  const stateDir = path.join(sksDir, 'state');
  const dir = path.join(stateDir, 'hook-invocation-dedupe');
  await fsp.mkdir(sksDir, { recursive: true });
  await assertRealDirectoryWithin(root, sksDir, path.resolve(root));
  await fsp.mkdir(stateDir, { recursive: true });
  await assertRealDirectoryWithin(root, stateDir, sksDir);
  await fsp.mkdir(dir, { recursive: true });
  await assertRealDirectoryWithin(root, dir, stateDir);
  return dir;
}

async function assertRealDirectoryWithin(root: string, candidate: string, parent: string) {
  const stat = await fsp.lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe_hook_dedupe_directory:${path.relative(root, candidate)}`);
  const [realCandidate, realParent] = await Promise.all([fsp.realpath(candidate), fsp.realpath(parent)]);
  const relative = path.relative(realParent, realCandidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`hook_dedupe_directory_outside_root:${path.relative(root, candidate)}`);
}

function hookDedupeWindowMs() {
  const configured = Number(process.env.SKS_HOOK_DEDUPE_WINDOW_MS || DEFAULT_WINDOW_MS);
  if (!Number.isFinite(configured)) return DEFAULT_WINDOW_MS;
  return Math.max(250, Math.min(30_000, Math.floor(configured)));
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}
