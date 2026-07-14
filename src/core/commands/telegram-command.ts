import fsp from 'node:fs/promises';
import path from 'node:path';
import { globalSksRoot, readJson } from '../fsx.js';
import {
  evaluateMiniAppDefaultOnGate,
  loadTelegramConfig,
  resolveTelegramBotToken,
  TelegramActionBroker,
  TelegramAuditLedger,
  TelegramBotApiClient,
  TelegramHubRouter,
  TelegramIdempotencyLedger,
  TelegramOwnerLock,
  TelegramPollingHub,
  TelegramTopicRegistry,
  telegramHubPaths,
  telegramTokenFingerprint,
  validateTelegramConfig,
  type MiniAppDefaultOnEvidence,
  type TelegramOwnerV1
} from '../telegram/index.js';

export async function telegramCommand(args: string[] = []): Promise<unknown> {
  const action = args[0] ?? 'status';
  const root = globalSksRoot();
  const paths = telegramHubPaths(root);
  const configPath = readOption(args, '--config') ?? paths.config;
  const json = args.includes('--json');

  if (action === 'status') {
    const rawConfig = await readJson<unknown>(configPath, null);
    const validation = validateTelegramConfig(rawConfig);
    const owner = await readJson<TelegramOwnerV1 | null>(paths.owner, null);
    const topics = await new TelegramTopicRegistry(paths.topics).list();
    const result = {
      schema: 'sks.telegram-status.v1',
      ok: validation.ok,
      configured: rawConfig !== null,
      config_issues: validation.issues,
      owner: owner ? {
        pid: owner.pid,
        host: owner.host,
        process_start_time: owner.process_start_time,
        bot_token_fingerprint: owner.bot_token_fingerprint,
        heartbeat_at: owner.heartbeat_at
      } : null,
      topic_count: topics.length,
      mini_app: validation.config?.mini_app ?? { enabled: false, default_on: false }
    };
    return print(result, json);
  }

  if (action === 'validate-config') {
    const validation = validateTelegramConfig(await readJson<unknown>(configPath, null));
    return print({ schema: 'sks.telegram-config-validation.v1', ...validation, config: validation.config ? redactConfig(validation.config) : null }, json);
  }

  if (action === 'mini-app-gate') {
    const evidencePath = readOption(args, '--evidence');
    if (!evidencePath || !path.isAbsolute(evidencePath)) throw new Error('telegram_mini_app_evidence_absolute_path_required');
    const evidence = JSON.parse(await fsp.readFile(evidencePath, 'utf8')) as MiniAppDefaultOnEvidence;
    return print(evaluateMiniAppDefaultOnGate(evidence), json);
  }

  if (action === 'hub') {
    const config = await loadTelegramConfig(configPath);
    const token = await resolveTelegramBotToken(config.bot_token_ref);
    const fingerprint = telegramTokenFingerprint(token);
    const owner = new TelegramOwnerLock({
      lockPath: paths.owner,
      tokenFingerprint: fingerprint,
      ...(config.owner_stale_ms === undefined ? {} : { staleMs: config.owner_stale_ms })
    });
    await owner.acquire();
    const topics = new TelegramTopicRegistry(paths.topics);
    const router = new TelegramHubRouter({
      config,
      topics,
      idempotency: new TelegramIdempotencyLedger(paths.idempotency),
      actions: new TelegramActionBroker(paths.actions),
      audit: new TelegramAuditLedger(paths.audit, fingerprint)
    });
    const polling = new TelegramPollingHub(
      new TelegramBotApiClient(token, { timeoutMs: (config.long_poll_timeout_sec ?? 25) * 1000 + 5_000 }),
      router,
      owner,
      config.long_poll_timeout_sec ?? 25
    );
    try {
      await polling.ensureLongPollingAllowed();
      if (args.includes('--once')) {
        const result = await polling.pollOnce();
        return print({ schema: 'sks.telegram-hub-run.v1', ...result }, json);
      }
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try {
        const result = await polling.run(controller.signal);
        return print({ schema: 'sks.telegram-hub-run.v1', ...result }, json);
      } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
      }
    } finally {
      await owner.release();
    }
  }

  const result = {
    schema: 'sks.telegram-command.v1',
    ok: false,
    error: 'unknown_action',
    supported: ['status', 'validate-config', 'hub', 'mini-app-gate']
  };
  process.exitCode = 2;
  return print(result, json);
}

function readOption(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : null;
}

function redactConfig(config: object): Record<string, unknown> {
  const record = config as Record<string, unknown>;
  return {
    ...record,
    bot_token_ref: record.bot_token_ref && typeof record.bot_token_ref === 'object'
      ? { type: (record.bot_token_ref as { type?: string }).type }
      : null
  };
}

function print(value: unknown, json: boolean): unknown {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(JSON.stringify(value, null, 2));
  return value;
}
