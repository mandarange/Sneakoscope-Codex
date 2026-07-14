import crypto from 'node:crypto';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';

export interface MiniAppChallenge {
  nonce: string;
  revision: number;
  csrf_token: string;
  exact_action_scope: string[];
  expires_at: string;
}

export interface MiniAppRequest {
  initData: string;
  initDataUnsafe?: unknown;
  nonce: string;
  revision: number;
  csrf_token: string;
  exact_action_scope: string[];
  biometric_user_presence?: boolean;
}

export interface MiniAppReplayStore {
  consume(key: string, expiresAt: string): Promise<boolean>;
}

export interface MiniAppValidationOptions {
  botToken: string;
  allowedUserIds: readonly string[];
  allowedChatIds: readonly string[];
  challenge: MiniAppChallenge;
  replayStore: MiniAppReplayStore;
  now?: number;
  maxAgeSeconds?: number;
}

export interface MiniAppValidationResult {
  ok: boolean;
  issues: string[];
  identity: { user_id: string | null; chat_id: string | null; query_id: string | null };
  biometric_user_presence: boolean;
}

export async function validateMiniAppRequest(
  request: MiniAppRequest,
  options: MiniAppValidationOptions
): Promise<MiniAppValidationResult> {
  const issues: string[] = [];
  if (!request.initData || typeof request.initData !== 'string') issues.push('init_data_required');
  if (request.initDataUnsafe !== undefined) issues.push('init_data_unsafe_ignored');
  const params = new URLSearchParams(request.initData || '');
  const hash = params.get('hash') || '';
  const authDate = Number(params.get('auth_date'));
  const queryId = params.get('query_id');
  const user = parseIdentity(params.get('user'));
  const chat = parseIdentity(params.get('chat'));

  if (!hash || !verifyTelegramInitData(params, options.botToken, hash)) issues.push('init_data_signature_invalid');
  const now = options.now ?? Date.now();
  const maxAge = Math.max(30, options.maxAgeSeconds ?? 300) * 1000;
  if (!Number.isFinite(authDate) || Math.abs(now - authDate * 1000) > maxAge) issues.push('auth_date_stale');
  if (!user.id || !options.allowedUserIds.includes(user.id)) issues.push('user_not_allowed');
  if (!chat.id || !options.allowedChatIds.includes(chat.id)) issues.push('chat_not_allowed');
  if (!queryId) issues.push('query_id_required');
  if (Date.parse(options.challenge.expires_at) <= now) issues.push('challenge_expired');
  if (!secureEqual(request.nonce, options.challenge.nonce)) issues.push('nonce_mismatch');
  if (request.revision !== options.challenge.revision) issues.push('revision_mismatch');
  if (!secureEqual(request.csrf_token, options.challenge.csrf_token)) issues.push('csrf_mismatch');
  if (!sameScope(request.exact_action_scope, options.challenge.exact_action_scope)) issues.push('action_scope_mismatch');

  if (issues.length === 0 && queryId) {
    const consumed = await options.replayStore.consume(`${queryId}:${request.nonce}:${request.revision}`, options.challenge.expires_at);
    if (!consumed) issues.push('query_id_replay');
  }

  return {
    ok: issues.length === 0,
    issues,
    identity: { user_id: user.id, chat_id: chat.id, query_id: queryId },
    biometric_user_presence: request.biometric_user_presence === true
  };
}

export function verifyTelegramInitData(params: URLSearchParams, botToken: string, expectedHash: string): boolean {
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const actual = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return secureEqual(actual, expectedHash.toLowerCase());
}

export interface MiniAppDefaultOnEvidence {
  init_data_validation_tests: boolean;
  replay_tests: boolean;
  r2_challenge_tests: boolean;
  mobile_safe_area_tests: boolean;
  ios_android_real_smoke: boolean;
  diff_virtualization_performance: boolean;
  no_raw_secret_path_leak: boolean;
  topic_ux_when_disabled: boolean;
}

export function evaluateMiniAppDefaultOnGate(evidence: MiniAppDefaultOnEvidence): {
  schema: 'sks.telegram-mini-app-gate.v1';
  ok: boolean;
  mode: 'default_on' | 'labs_default_off';
  blockers: string[];
  cookie_policy: 'no_cookie';
} {
  const blockers = Object.entries(evidence).filter(([, value]) => value !== true).map(([key]) => key);
  return {
    schema: 'sks.telegram-mini-app-gate.v1',
    ok: blockers.length === 0,
    mode: blockers.length === 0 ? 'default_on' : 'labs_default_off',
    blockers,
    cookie_policy: 'no_cookie'
  };
}

export class InMemoryMiniAppReplayStore implements MiniAppReplayStore {
  private readonly entries = new Map<string, number>();

  async consume(key: string, expiresAt: string): Promise<boolean> {
    const now = Date.now();
    for (const [entry, expiry] of this.entries) if (expiry <= now) this.entries.delete(entry);
    if (this.entries.has(key)) return false;
    this.entries.set(key, Date.parse(expiresAt));
    return true;
  }
}

export class FileMiniAppReplayStore implements MiniAppReplayStore {
  constructor(private readonly file: string, private readonly now: () => number = Date.now) {}

  async consume(key: string, expiresAt: string): Promise<boolean> {
    return withFileLock({ lockPath: `${this.file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const ledger = await readJson<{ schema: string; entries: Record<string, string> }>(this.file, {
        schema: 'sks.telegram-mini-app-replay.v1',
        entries: {}
      });
      const now = this.now();
      for (const [entry, expiry] of Object.entries(ledger.entries)) {
        if (Date.parse(expiry) <= now) delete ledger.entries[entry];
      }
      if (ledger.entries[key]) return false;
      ledger.entries[key] = expiresAt;
      await writeJsonAtomic(this.file, ledger);
      return true;
    });
  }
}

export const MINI_APP_SCREENS = [
  'Fleet', 'Machines', 'Projects', 'Sessions', 'Live Activity', 'Diff', 'Evidence',
  'Gates', 'Trust', 'Approval Inbox', 'Artifacts', 'Security'
] as const;

function parseIdentity(value: string | null): { id: string | null } {
  if (!value) return { id: null };
  try {
    const parsed = JSON.parse(value) as { id?: string | number };
    return { id: parsed.id === undefined ? null : String(parsed.id) };
  } catch {
    return { id: null };
  }
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
