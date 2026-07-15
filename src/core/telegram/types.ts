export type TelegramRisk = 'R0' | 'R1' | 'R2' | 'R3';
export type TelegramActionKind = 'question' | 'approval' | 'cancel' | 'verify' | 'input' | 'read';

export interface TelegramSecretRef {
  type: 'keychain' | 'external_file';
  service?: string;
  account?: string;
  path?: string;
}

export interface TelegramHubConfigV1 {
  schema: 'sks.telegram-config.v1';
  bot_token_ref: TelegramSecretRef;
  paired_chat_ids: string[];
  paired_user_ids: string[];
  long_poll_timeout_sec?: number;
  owner_stale_ms?: number;
  protect_content?: boolean;
  silent_notifications?: boolean;
}

export interface TelegramOwnerV1 {
  schema: 'sks.telegram-owner.v1';
  pid: number;
  process_start_time: string;
  host: string;
  bot_token_fingerprint: string;
  owner_nonce: string;
  started_at: string;
  heartbeat_at: string;
}

export interface TelegramTopicRouteV1 {
  schema: 'sks.telegram-topic-route.v1';
  machine_id: string;
  project_id: string;
  session_id: string;
  chat_id: string;
  message_thread_id: number;
  pinned_message_id: number | null;
  created_at: string;
  updated_at: string;
  generation: number;
}

export interface RemoteActionV1 {
  schema: 'sks.remote-action.v1';
  action_id: string;
  machine_id: string;
  project_id: string;
  session_id: string;
  kind: TelegramActionKind;
  risk: TelegramRisk;
  prompt: string;
  options?: Array<{ id: string; label: string }>;
  exact_scope: string[];
  expires_at: string;
  revision: number;
  status: 'open' | 'claimed' | 'resolved' | 'expired' | 'cancelled';
}

export interface TelegramActionAliasV1 {
  alias: string;
  action_id: string;
  session_id: string;
  chat_id: string;
  message_thread_id: number;
  revision: number;
  expires_at: string;
  used_at: string | null;
}

export interface TelegramAuditEventV1 {
  schema: 'sks.telegram-audit.v1';
  at: string;
  update_id: number | null;
  chat_id_hash: string;
  topic_id: number | null;
  action_alias: string | null;
  command_kind: string;
  decision: 'accepted' | 'rejected';
  policy_reason: string;
  effect_receipt: string | null;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: string | number; type: string };
  from?: { id: string | number };
  message_thread_id?: number;
  text?: string;
  reply_to_message?: { message_id: number };
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: string | number };
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramBotApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export interface TelegramBotApiTransport {
  call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T>;
  uploadDocument?(input: {
    chat_id: string;
    message_thread_id?: number;
    filename: string;
    content: Uint8Array;
    caption?: string;
    protect_content?: boolean;
    disable_notification?: boolean;
  }): Promise<{ message_id: number }>;
}
