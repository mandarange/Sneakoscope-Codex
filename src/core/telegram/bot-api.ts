import { redactString } from '../secret-redaction.js';
import type { TelegramBotApiResponse, TelegramBotApiTransport, TelegramUpdate } from './types.js';

export class TelegramBotApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number,
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(redactString(message));
    this.name = 'TelegramBotApiError';
  }
}

export interface TelegramBotApiClientOptions {
  fetch?: typeof fetch;
  apiOrigin?: string;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class TelegramBotApiClient implements TelegramBotApiTransport {
  private readonly request: typeof fetch;
  private readonly apiOrigin: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly token: string, options: TelegramBotApiClientOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.apiOrigin = (options.apiOrigin ?? 'https://api.telegram.org').replace(/\/$/, '');
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? 20_000);
    this.maxRetries = Math.max(0, Math.min(4, options.maxRetries ?? 2));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
    if (!/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(method)) throw new Error('telegram_method_invalid');
    return this.perform<T>(method, () => ({
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  }

  async uploadDocument(input: {
    chat_id: string;
    message_thread_id?: number;
    filename: string;
    content: Uint8Array;
    caption?: string;
    protect_content?: boolean;
    disable_notification?: boolean;
  }): Promise<{ message_id: number }> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.filename)) throw new Error('telegram_document_filename_invalid');
    if (input.content.byteLength < 1 || input.content.byteLength > 64 * 1024) throw new Error('telegram_document_size_invalid');
    return this.perform('sendDocument', () => {
      const form = new FormData();
      form.set('chat_id', input.chat_id);
      if (input.message_thread_id && input.message_thread_id > 0) form.set('message_thread_id', String(input.message_thread_id));
      if (input.caption) form.set('caption', input.caption);
      if (input.protect_content !== undefined) form.set('protect_content', String(input.protect_content));
      if (input.disable_notification !== undefined) form.set('disable_notification', String(input.disable_notification));
      form.set('document', new Blob([Uint8Array.from(input.content)], { type: 'application/json' }), input.filename);
      return { body: form };
    });
  }

  private async perform<T>(method: string, init: () => Pick<RequestInit, 'headers' | 'body'>): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.request(`${this.apiOrigin}/bot${this.token}/${method}`, {
          method: 'POST',
          ...init(),
          signal: controller.signal
        });
        const body = await response.json() as TelegramBotApiResponse<T>;
        if (response.ok && body.ok) return body.result as T;
        const retryAfter = body.parameters?.retry_after ?? null;
        if ((response.status === 429 || body.error_code === 429) && retryAfter && attempt < this.maxRetries) {
          await this.sleep(Math.min(60_000, Math.max(1_000, retryAfter * 1_000)));
          continue;
        }
        throw new TelegramBotApiError(
          method,
          body.error_code ?? response.status,
          safeTelegramError(body.description ?? 'Telegram API request failed', this.token),
          retryAfter
        );
      } catch (error: unknown) {
        if (error instanceof TelegramBotApiError) throw error;
        const message = error instanceof Error && error.name === 'AbortError' ? 'telegram_api_timeout' : 'telegram_api_transport_failed';
        throw new TelegramBotApiError(method, 0, message);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new TelegramBotApiError(method, 0, 'telegram_api_retry_exhausted');
  }

  async getUpdates(input: { offset?: number; timeout?: number; allowed_updates?: string[] } = {}): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      ...(input.offset === undefined ? {} : { offset: input.offset }),
      timeout: Math.max(0, Math.min(50, input.timeout ?? 25)),
      allowed_updates: input.allowed_updates ?? ['message', 'callback_query']
    });
  }
}

function safeTelegramError(message: string, token: string): string {
  return redactString(message).split(token).join('[redacted]');
}
