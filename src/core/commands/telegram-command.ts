import path from 'node:path';
import { globalSksRoot, projectRoot, readJson } from '../fsx.js';
import {
  loadRemoteMachineRegistry,
  loadRemoteSessionIndex,
  remoteMachineRegistryPath,
  remoteSessionIndexPath,
  validateRemoteMachineRegistry,
  validateRemoteSessionIndex
} from '../remote/index.js';
import {
  loadTelegramConfig,
  resolveTelegramBotToken,
  TelegramActionBroker,
  TelegramAuditLedger,
  TelegramBotApiClient,
  TelegramHubRouter,
  TelegramHubRuntime,
  TelegramIdempotencyLedger,
  TelegramOwnerLock,
  TelegramMessageProjector,
  TelegramPollingHub,
  TelegramTopicRegistry,
  telegramHubPaths,
  telegramTokenFingerprint,
  validateTelegramConfig,
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
    const controllingRoot = path.resolve(readOption(args, '--project-root') ?? await projectRoot());
    const machineRegistryRaw = await readJson<unknown>(readOption(args, '--machines') ?? remoteMachineRegistryPath(root), null);
    const machineValidation = validateRemoteMachineRegistry(machineRegistryRaw);
    const sessionIndexRaw = await readJson<unknown>(readOption(args, '--session-index') ?? remoteSessionIndexPath(controllingRoot), null);
    const sessionValidation = machineValidation.registry
      ? validateRemoteSessionIndex(sessionIndexRaw, machineValidation.registry)
      : { ok: false, issues: ['remote_machine_registry_invalid'], index: null };
    const result = {
      schema: 'sks.telegram-status.v1',
      ok: validation.ok && machineValidation.ok && sessionValidation.ok,
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
      machine_count: machineValidation.registry?.machines.length ?? 0,
      target_count: sessionValidation.index?.targets.length ?? 0,
      remote_config_issues: [...machineValidation.issues, ...sessionValidation.issues]
    };
    return print(result, json);
  }

  if (action === 'validate-config') {
    const validation = validateTelegramConfig(await readJson<unknown>(configPath, null));
    return print({ schema: 'sks.telegram-config-validation.v1', ...validation, config: validation.config ? redactConfig(validation.config) : null }, json);
  }

  if (action === 'hub') {
    const config = await loadTelegramConfig(configPath);
    const controllingRoot = path.resolve(readOption(args, '--project-root') ?? await projectRoot());
    const machineRegistry = await loadRemoteMachineRegistry(readOption(args, '--machines') ?? remoteMachineRegistryPath(root));
    const sessionIndex = await loadRemoteSessionIndex(readOption(args, '--session-index') ?? remoteSessionIndexPath(controllingRoot), machineRegistry);
    const token = await resolveTelegramBotToken(config.bot_token_ref);
    const fingerprint = telegramTokenFingerprint(token);
    const owner = new TelegramOwnerLock({
      lockPath: paths.owner,
      tokenFingerprint: fingerprint,
      ...(config.owner_stale_ms === undefined ? {} : { staleMs: config.owner_stale_ms })
    });
    await owner.acquire();
    const topics = new TelegramTopicRegistry(paths.topics);
    const actions = new TelegramActionBroker(paths.actions);
    const audit = new TelegramAuditLedger(paths.audit, fingerprint);
    const router = new TelegramHubRouter({
      config,
      topics,
      idempotency: new TelegramIdempotencyLedger(paths.idempotency),
      actions,
      audit
    });
    const api = new TelegramBotApiClient(token, { timeoutMs: (config.long_poll_timeout_sec ?? 25) * 1000 + 5_000 });
    const runtime = new TelegramHubRuntime({
      config,
      router,
      topics,
      actions,
      audit,
      projector: new TelegramMessageProjector(api, {
        rich_message: true,
        rich_draft: true,
        plain_draft: true,
        reactions: true
      }, {
        protectContent: config.protect_content !== false,
        silent: config.silent_notifications === true
      }),
      machineRegistry,
      sessionIndex,
      projectionStatePath: paths.projection
    });
    const polling = new TelegramPollingHub(
      api,
      runtime,
      owner,
      config.long_poll_timeout_sec ?? 25
    );
    try {
      await polling.ensureLongPollingAllowed();
      const sync = await runtime.initialize();
      if (args.includes('--once')) {
        const result = await polling.pollOnce();
        return print({ schema: 'sks.telegram-hub-run.v1', ...result, sync }, json);
      }
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try {
        const result = await polling.run(controller.signal);
        return print({ schema: 'sks.telegram-hub-run.v1', ...result, sync }, json);
      } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
      }
    } finally {
      await runtime.close();
      await owner.release();
    }
  }

  const result = {
    schema: 'sks.telegram-command.v1',
    ok: false,
    error: 'unknown_action',
    supported: ['status', 'validate-config', 'hub']
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
