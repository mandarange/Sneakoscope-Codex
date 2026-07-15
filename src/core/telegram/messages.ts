import { sha256 } from '../fsx.js';
import { redactString } from '../secret-redaction.js';
import { TelegramBotApiError } from './bot-api.js';
import type { TelegramBotApiTransport, TelegramTopicRouteV1 } from './types.js';

export interface TelegramCapabilities {
  rich_message: boolean;
  rich_draft: boolean;
  plain_draft: boolean;
  reactions: boolean;
}

interface DraftState {
  digest: string;
  updated_at: number;
  expires_at: number;
}

export class TelegramMessageProjector {
  private readonly drafts = new Map<string, DraftState>();
  private readonly lastUpdateAt = new Map<string, number>();

  constructor(
    private readonly api: TelegramBotApiTransport,
    private readonly capabilities: TelegramCapabilities,
    private readonly options: {
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
      protectContent?: boolean;
      silent?: boolean;
    } = {}
  ) {}

  async streamDraft(input: {
    route: TelegramTopicRouteV1;
    publicPhase: string;
    text: string;
    existingMessageId?: number;
  }): Promise<{ method: string; skipped: boolean; draft_id: number; message_id?: number }> {
    const now = this.now();
    const key = `${input.route.session_id}:${input.route.generation}`;
    const draftId = stableDraftId(key);
    const text = publicSafeDraft(input.publicPhase, input.text);
    const digest = sha256(text);
    const previous = this.drafts.get(key);
    if (previous?.digest === digest) return { method: 'digest-skip', skipped: true, draft_id: draftId };
    if (previous && now > previous.expires_at) this.drafts.delete(key);
    await this.throttle(key);
    let method: string;
    let messageId: number | undefined;
    if (this.capabilities.rich_draft) {
      try {
        method = 'sendRichMessageDraft';
        await this.api.call(method, this.basePayload(input.route, { draft_id: draftId, rich_message: richMessage(text) }));
        this.drafts.set(key, { digest, updated_at: this.now(), expires_at: this.now() + 30_000 });
        return { method, skipped: false, draft_id: draftId };
      } catch (error: unknown) {
        if (!isUnsupportedMethod(error)) throw error;
      }
    }
    if (this.capabilities.plain_draft) {
      try {
        method = 'sendMessageDraft';
        await this.api.call(method, this.basePayload(input.route, { draft_id: draftId, text }));
        this.drafts.set(key, { digest, updated_at: this.now(), expires_at: this.now() + 30_000 });
        return { method, skipped: false, draft_id: draftId };
      } catch (error: unknown) {
        if (!isUnsupportedMethod(error)) throw error;
      }
    }
    if (input.existingMessageId) {
      method = 'editMessageText';
      messageId = input.existingMessageId;
      await this.api.call(method, this.basePayload(input.route, { message_id: messageId, text }));
    } else {
      method = 'sendMessage';
      const sent = await this.api.call<{ message_id: number }>(method, this.basePayload(input.route, { text }));
      if (!Number.isInteger(sent?.message_id)) throw new Error('telegram_draft_fallback_receipt_missing');
      messageId = sent.message_id;
    }
    this.drafts.set(key, { digest, updated_at: this.now(), expires_at: this.now() + 30_000 });
    return { method, skipped: false, draft_id: draftId, ...(messageId === undefined ? {} : { message_id: messageId }) };
  }

  async createSessionTopic(chatId: string, name: string): Promise<{ message_thread_id: number; name: string }> {
    const boundedName = publicSafeText(name).replace(/[\r\n]/g, ' ').slice(0, 128).trim();
    if (!boundedName) throw new Error('telegram_topic_name_required');
    const result = await this.api.call<{ message_thread_id: number; name?: string }>('createForumTopic', {
      chat_id: chatId,
      name: boundedName
    });
    if (!Number.isInteger(result?.message_thread_id)) throw new Error('telegram_topic_receipt_missing');
    return { message_thread_id: result.message_thread_id, name: result.name ?? boundedName };
  }

  async answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
    await this.api.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: publicSafeText(text).slice(0, 200),
      show_alert: showAlert
    });
  }

  async sendFinal(input: { route: TelegramTopicRouteV1; text: string; replyMarkup?: Record<string, unknown> }): Promise<{ method: string; message_id: number }> {
    const text = publicSafeText(input.text);
    let method = this.capabilities.rich_message ? 'sendRichMessage' : 'sendMessage';
    let result: { message_id: number };
    try {
      result = await this.api.call<{ message_id: number }>(method, this.basePayload(input.route, {
        ...(method === 'sendRichMessage' ? { rich_message: richMessage(text) } : { text }),
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {})
      }));
    } catch (error: unknown) {
      if (method !== 'sendRichMessage' || !isUnsupportedMethod(error)) throw error;
      method = 'sendMessage';
      result = await this.api.call<{ message_id: number }>(method, this.basePayload(input.route, {
        text,
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {})
      }));
    }
    if (!result || !Number.isInteger(result.message_id)) throw new Error('telegram_final_message_receipt_missing');
    return { method, message_id: result.message_id };
  }

  async sendFlat(input: { chatId: string; text: string; replyMarkup?: Record<string, unknown> }): Promise<number> {
    const result = await this.api.call<{ message_id: number }>('sendMessage', {
      chat_id: input.chatId,
      text: publicSafeText(input.text),
      protect_content: this.options.protectContent !== false,
      disable_notification: this.options.silent === true,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {})
    });
    if (!Number.isInteger(result?.message_id)) throw new Error('telegram_flat_message_receipt_missing');
    return result.message_id;
  }

  async sendArtifactManifest(input: {
    route: TelegramTopicRouteV1;
    artifacts: readonly unknown[];
  }): Promise<{ method: 'sendDocument' | 'sendMessage'; message_id: number }> {
    const artifacts = [...new Set(input.artifacts.map((value) => publicSafeText(String(value)).slice(0, 160)))]
      .filter((value) => value.length > 0)
      .slice(0, 128);
    const manifest = JSON.stringify({
      schema: 'sks.telegram-artifact-manifest.v1',
      session_id: input.route.session_id,
      generated_at: new Date(this.now()).toISOString(),
      artifacts
    }, null, 2);
    const uploader = this.api.uploadDocument?.bind(this.api);
    if (uploader) {
      try {
        const sent = await uploader({
          chat_id: input.route.chat_id,
          ...(input.route.message_thread_id > 0 ? { message_thread_id: input.route.message_thread_id } : {}),
          filename: `sks-artifacts-${safeFilenamePart(input.route.session_id)}.json`,
          content: Uint8Array.from(Buffer.from(manifest)),
          caption: `${artifacts.length} bounded public-safe artifact entries`,
          protect_content: this.options.protectContent !== false,
          disable_notification: this.options.silent === true
        });
        if (!Number.isInteger(sent?.message_id)) throw new Error('telegram_document_receipt_missing');
        return { method: 'sendDocument', message_id: sent.message_id };
      } catch (error: unknown) {
        if (!isUnsupportedMethod(error)) throw error;
      }
    }
    const sent = await this.sendFinal({
      route: input.route,
      text: artifacts.length ? `Artifacts:\n${artifacts.map((value) => `- ${value}`).join('\n')}` : 'No bounded artifacts are available.'
    });
    return { method: 'sendMessage', message_id: sent.message_id };
  }

  async sendApproval(route: TelegramTopicRouteV1, callbackData: string, text = 'Cancel this exact session?'): Promise<number> {
    const sent = await this.sendFinal({
      route,
      text,
      replyMarkup: {
        inline_keyboard: [[
          { text: 'Confirm cancel', callback_data: callbackData },
          { text: 'Keep running', callback_data: 'ui:status' }
        ]]
      }
    });
    return sent.message_id;
  }

  async upsertPinnedCard(input: {
    route: TelegramTopicRouteV1;
    card: TelegramSessionCard;
  }): Promise<{ method: string; message_id: number; pinned: boolean }> {
    const text = renderSessionCard(input.card);
    const replyMarkup = sessionCardKeyboard();
    if (input.route.pinned_message_id) {
      await this.api.call('editMessageText', this.basePayload(input.route, {
        message_id: input.route.pinned_message_id,
        text,
        reply_markup: replyMarkup
      }));
      return { method: 'editMessageText', message_id: input.route.pinned_message_id, pinned: true };
    }
    const sent = await this.sendFinal({ route: input.route, text, replyMarkup });
    await this.api.call('pinChatMessage', this.basePayload(input.route, {
      message_id: sent.message_id,
      disable_notification: true
    }));
    return { method: sent.method, message_id: sent.message_id, pinned: true };
  }

  async requestInput(input: { route: TelegramTopicRouteV1; prompt: string; placeholder?: string }): Promise<number> {
    const sent = await this.sendFinal({
      route: input.route,
      text: input.prompt,
      replyMarkup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: publicSafeText(input.placeholder ?? 'Reply to this message')
      }
    });
    return sent.message_id;
  }

  async setReaction(route: TelegramTopicRouteV1, messageId: number, state: keyof typeof REACTIONS): Promise<void> {
    if (!this.capabilities.reactions) return;
    await this.api.call('setMessageReaction', this.basePayload(route, {
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: REACTIONS[state] }]
    }));
  }

  private async throttle(key: string): Promise<void> {
    const previous = this.lastUpdateAt.get(key) ?? 0;
    const waitMs = Math.max(0, 500 - (this.now() - previous));
    if (waitMs > 0) await (this.options.sleep ?? sleep)(waitMs);
    this.lastUpdateAt.set(key, this.now());
  }

  private basePayload(route: TelegramTopicRouteV1, extra: Record<string, unknown>): Record<string, unknown> {
    return {
      chat_id: route.chat_id,
      ...(route.message_thread_id > 0 ? { message_thread_id: route.message_thread_id } : {}),
      protect_content: this.options.protectContent !== false,
      disable_notification: this.options.silent === true,
      ...extra
    };
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

export interface TelegramSessionCard {
  machine: string;
  project: string;
  branch: string;
  state: string;
  route: string;
  model: string;
  gate: string;
  trust: string;
  changed: string;
  last_event: string;
  checks: {
    build: boolean;
    focused_tests: boolean;
    full_release: boolean;
    npm_pack: boolean;
  };
  latest_public_activity: string;
}

export function renderSessionCard(card: TelegramSessionCard): string {
  const rows = [
    ['Machine', card.machine], ['Project', card.project], ['Branch', card.branch], ['State', card.state],
    ['Route', card.route], ['Model', card.model], ['Gate', card.gate], ['Trust', card.trust],
    ['Changed', card.changed], ['Last event', card.last_event]
  ].map(([key, value]) => `| ${key} | ${publicSafeText(value ?? '')} |`);
  const checkbox = (value: boolean) => value ? 'x' : ' ';
  return [
    '# Sneakoscope Session', '', '| Field | Value |', '|---|---|', ...rows, '',
    `- [${checkbox(card.checks.build)}] Build`,
    `- [${checkbox(card.checks.focused_tests)}] Focused tests`,
    `- [${checkbox(card.checks.full_release)}] Full release check`,
    `- [${checkbox(card.checks.npm_pack)}] npm pack proof`, '',
    '<details>', '<summary>Latest public-safe activity</summary>',
    publicSafeText(card.latest_public_activity), '</details>'
  ].join('\n');
}

export function sessionCardKeyboard(): Record<string, unknown> {
  return {
    inline_keyboard: [
      [button('Open Cockpit', 'open'), button('Diff', 'diff')],
      [button('Proof', 'proof'), button('Gates', 'gates'), button('Trust', 'trust')],
      [button('Send Input', 'input'), button('Verify', 'verify')],
      [button('Cancel', 'cancel')]
    ]
  };
}

export const REACTIONS = {
  observed: '👀',
  running: '⚙',
  needs_input: '❓',
  verified: '✅',
  blocked: '⚠'
} as const;

function button(text: string, action: string): Record<string, string> {
  return { text, callback_data: `ui:${action}` };
}

function stableDraftId(value: string): number {
  return Number.parseInt(sha256(value).slice(0, 8), 16) & 0x7fffffff;
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80) || 'session';
}

function publicSafeDraft(phase: string, text: string): string {
  return `<tg-thinking>${publicSafeText(phase).slice(0, 120)}</tg-thinking>\n${publicSafeText(text)}`;
}

function richMessage(text: string): Record<string, string> {
  return { markdown: text };
}

function isUnsupportedMethod(error: unknown): boolean {
  return error instanceof TelegramBotApiError && (error.errorCode === 400 || error.errorCode === 404);
}

export function publicSafeText(value: string): string {
  return redactString(value)
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .replace(/(?:\/Users|\/home|[A-Za-z]:\\)[^\s]+/g, '[path-redacted]')
    .replace(/<tg-thinking>[\s\S]*?<\/tg-thinking>/gi, '[public phase]')
    .replace(/\u0000/g, '')
    .slice(0, 16_000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
