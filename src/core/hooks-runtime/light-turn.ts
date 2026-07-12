import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';

export type LightTurnProfile = 'passthrough' | 'answer';

export interface LightTurnReceipt {
  schema: 'sks.light-turn.v1';
  session_key_hash: string;
  turn_id_hash: string;
  prompt_hash: string;
  profile: LightTurnProfile;
  created_at: string;
  expires_at: string;
  consumed: boolean;
}

export interface ArmLightTurnInput {
  sessionKey: unknown;
  turnId: unknown;
  prompt: unknown;
  profile: LightTurnProfile;
  ttlMs: number;
}

export interface ConsumeLightTurnInput {
  sessionKey: unknown;
  turnId: unknown;
}

export async function armLightTurnStopBypass(root: string, input: ArmLightTurnInput): Promise<LightTurnReceipt> {
  const sessionKeyHash = lightTurnSessionHash(input.sessionKey);
  const createdAt = nowIso();
  const ttlMs = Math.max(1_000, Math.min(10 * 60_000, Math.floor(Number(input.ttlMs) || 0)));
  const receipt: LightTurnReceipt = {
    schema: 'sks.light-turn.v1',
    session_key_hash: sessionKeyHash,
    turn_id_hash: sha256(String(input.turnId || '')).slice(0, 32),
    prompt_hash: sha256(String(input.prompt || '')).slice(0, 32),
    profile: input.profile,
    created_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
    consumed: false
  };
  await writeJsonAtomic(lightTurnReceiptPath(root, sessionKeyHash), receipt);
  return receipt;
}

export async function consumeLightTurnStopBypass(root: string, input: ConsumeLightTurnInput): Promise<{
  accepted: boolean;
  receipt: LightTurnReceipt | null;
  reason: string;
}> {
  const sessionKeyHash = lightTurnSessionHash(input.sessionKey);
  const file = lightTurnReceiptPath(root, sessionKeyHash);
  const receipt = await readJson<LightTurnReceipt | null>(file, null).catch(() => null);
  if (!receipt) return { accepted: false, receipt: null, reason: 'receipt_missing' };

  // A light receipt is single-use. Remove it before evaluating stale route
  // state so it can never become durable completion evidence or be replayed.
  await fsp.rm(file, { force: true }).catch(() => null);

  if (receipt.schema !== 'sks.light-turn.v1') return { accepted: false, receipt, reason: 'schema_mismatch' };
  if (receipt.session_key_hash !== sessionKeyHash) return { accepted: false, receipt, reason: 'session_mismatch' };
  if (receipt.turn_id_hash !== sha256(String(input.turnId || '')).slice(0, 32)) return { accepted: false, receipt, reason: 'turn_mismatch' };
  if (receipt.consumed === true) return { accepted: false, receipt, reason: 'already_consumed' };
  const expiresAt = Date.parse(receipt.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { accepted: false, receipt, reason: 'expired' };
  return { accepted: true, receipt: { ...receipt, consumed: true }, reason: 'accepted' };
}

export async function clearLightTurnStopBypass(root: string, input: { sessionKey: unknown }): Promise<void> {
  await fsp.rm(lightTurnReceiptPath(root, input.sessionKey), { force: true }).catch(() => undefined);
}

export function lightTurnReceiptPath(root: string, sessionKeyOrHash: unknown): string {
  const hash = /^[0-9a-f]{32}$/.test(String(sessionKeyOrHash || ''))
    ? String(sessionKeyOrHash)
    : lightTurnSessionHash(sessionKeyOrHash);
  return path.join(root, '.sneakoscope', 'state', 'light-turn', `${hash}.json`);
}

function lightTurnSessionHash(sessionKey: unknown): string {
  return sha256(String(sessionKey || 'default')).slice(0, 32);
}
