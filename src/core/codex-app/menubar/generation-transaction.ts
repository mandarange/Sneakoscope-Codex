import fs from 'node:fs/promises';
import {
  errorMessage,
  existsNoFollow,
  JOURNAL_SCHEMA,
  loadJournal,
  outcomeFromJournal,
  outcomeFromPlans,
  outcomeFromUnknownJournal,
  persistJournal
} from './generation-transaction-journal.js';
import type {
  GenerationJournal,
  GenerationJournalPair,
  PairStep
} from './generation-transaction-journal.js';
import type { sksMenuBarPaths } from './paths.js';
import type {
  SksMenuBarGenerationArtifact,
  SksMenuBarGenerationPurpose,
  SksMenuBarGenerationTransactionOutcome
} from './types.js';

type PairMode = 'activate_staged' | 'swap';

interface GenerationPairPlan {
  kind: SksMenuBarGenerationArtifact;
  mode: PairMode;
  active: string;
  backup: string;
  staged: string | null;
}

export class MenuBarGenerationTransactionError extends Error {
  constructor(readonly outcome: SksMenuBarGenerationTransactionOutcome) {
    super(outcome.error || 'menubar_generation_transaction_failed');
  }
}

export function installGenerationPairs(paths: ReturnType<typeof sksMenuBarPaths>): GenerationPairPlan[] {
  return [
    { kind: 'app', mode: 'activate_staged', active: paths.app_path, backup: paths.backup_app_path, staged: paths.staging_app_path },
    { kind: 'build_stamp', mode: 'activate_staged', active: paths.build_stamp_path, backup: paths.previous_build_stamp_path, staged: paths.staging_build_stamp_path },
    { kind: 'action_script', mode: 'activate_staged', active: paths.action_script_path, backup: paths.previous_action_script_path, staged: paths.staging_action_script_path },
    { kind: 'launch_agent', mode: 'activate_staged', active: paths.launch_agent_path, backup: paths.previous_launch_agent_path, staged: paths.staging_launch_agent_path }
  ];
}

export function rollbackGenerationPairs(paths: ReturnType<typeof sksMenuBarPaths>): GenerationPairPlan[] {
  return [
    { kind: 'app', mode: 'swap', active: paths.app_path, backup: paths.backup_app_path, staged: null },
    { kind: 'build_stamp', mode: 'swap', active: paths.build_stamp_path, backup: paths.previous_build_stamp_path, staged: null },
    { kind: 'action_script', mode: 'swap', active: paths.action_script_path, backup: paths.previous_action_script_path, staged: null },
    { kind: 'launch_agent', mode: 'swap', active: paths.launch_agent_path, backup: paths.previous_launch_agent_path, staged: null }
  ];
}

export async function applyMenuBarGenerationTransaction(input: {
  purpose: SksMenuBarGenerationPurpose;
  journalPath: string;
  pairs: GenerationPairPlan[];
  env?: NodeJS.ProcessEnv;
}): Promise<SksMenuBarGenerationTransactionOutcome> {
  if (await existsNoFollow(input.journalPath)) {
    throw new MenuBarGenerationTransactionError(await outcomeFromUnknownJournal(
      input.purpose,
      input.journalPath,
      'terminal_uncertain',
      'generation_transaction_journal_already_exists'
    ));
  }
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const journal: GenerationJournal = {
    schema: JOURNAL_SCHEMA,
    id,
    purpose: input.purpose,
    phase: 'prepared',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    failure_point: null,
    failure_pair: null,
    origin_failure_point: null,
    origin_failure_pair: null,
    error: null,
    pairs: []
  };
  for (const plan of input.pairs) {
    if (plan.mode === 'activate_staged' && (!plan.staged || !(await existsNoFollow(plan.staged)))) {
      throw new MenuBarGenerationTransactionError(await outcomeFromJournal(journal, input.journalPath, false, 'terminal_uncertain', `generation_staged_artifact_missing:${plan.kind}`));
    }
    journal.pairs.push({
      ...plan,
      temporary: `${plan.active}.generation-${id}.temporary`,
      displaced: plan.mode === 'activate_staged' ? `${plan.backup}.generation-${id}.displaced` : null,
      active_initially_present: await existsNoFollow(plan.active),
      backup_initially_present: await existsNoFollow(plan.backup),
      step: 'pending'
    });
  }
  await persistJournal(input.journalPath, journal);
  try {
    journal.phase = 'applying';
    await persistJournal(input.journalPath, journal);
    for (const pair of journal.pairs) await applyPair(journal, pair, input.journalPath, input.env);
    journal.phase = 'applied';
    await persistJournal(input.journalPath, journal);
    return outcomeFromJournal(journal, input.journalPath, true, 'applied', null);
  } catch (error) {
    journal.origin_failure_point ||= journal.failure_point;
    journal.origin_failure_pair ||= journal.failure_pair;
    journal.error = errorMessage(error);
    await persistJournal(input.journalPath, journal).catch(() => undefined);
    throw new MenuBarGenerationTransactionError(await outcomeFromJournal(journal, input.journalPath, false, 'terminal_uncertain', journal.error));
  }
}

export async function commitMenuBarGenerationTransaction(input: {
  purpose: SksMenuBarGenerationPurpose;
  journalPath: string;
  pairs: GenerationPairPlan[];
  env?: NodeJS.ProcessEnv;
}): Promise<SksMenuBarGenerationTransactionOutcome> {
  const loaded = await loadJournal(input).catch(() => null);
  if (!loaded) return outcomeFromPlans(input.purpose, input.journalPath, input.pairs, false, 'terminal_uncertain', 'generation_transaction_journal_invalid');
  try {
    loaded.phase = 'committed';
    loaded.error = null;
    loaded.failure_pair = null;
    loaded.failure_point = null;
    await persistJournal(input.journalPath, loaded);
    await cleanupCommittedJournal(loaded, input.journalPath, input.env);
    return outcomeFromJournal(loaded, input.journalPath, true, 'committed', null);
  } catch (error) {
    loaded.error = errorMessage(error);
    await persistJournal(input.journalPath, loaded).catch(() => undefined);
    return outcomeFromJournal(loaded, input.journalPath, false, 'terminal_uncertain', loaded.error);
  }
}

export async function recoverMenuBarGenerationTransaction(input: {
  purpose: SksMenuBarGenerationPurpose;
  journalPath: string;
  pairs: GenerationPairPlan[];
  env?: NodeJS.ProcessEnv;
}): Promise<SksMenuBarGenerationTransactionOutcome> {
  if (!(await existsNoFollow(input.journalPath))) {
    return outcomeFromPlans(input.purpose, input.journalPath, input.pairs, true, 'none', null);
  }
  const journal = await loadJournal(input).catch(() => null);
  if (!journal) return outcomeFromPlans(input.purpose, input.journalPath, input.pairs, false, 'terminal_uncertain', 'generation_transaction_journal_invalid');
  if (journal.phase === 'committed') {
    try {
      await cleanupCommittedJournal(journal, input.journalPath, input.env);
      return outcomeFromJournal(journal, input.journalPath, true, 'completed_commit', null);
    } catch (error) {
      journal.error = errorMessage(error);
      await persistJournal(input.journalPath, journal).catch(() => undefined);
      return outcomeFromJournal(journal, input.journalPath, false, 'terminal_uncertain', journal.error);
    }
  }
  try {
    journal.phase = 'recovering';
    await persistJournal(input.journalPath, journal);
    for (const pair of [...journal.pairs].reverse()) await recoverPair(journal, pair, input.journalPath, input.env);
    await fs.rm(input.journalPath, { force: true });
    return outcomeFromJournal(journal, input.journalPath, true, 'rolled_back', null);
  } catch (error) {
    journal.error = errorMessage(error);
    await persistJournal(input.journalPath, journal).catch(() => undefined);
    return outcomeFromJournal(journal, input.journalPath, false, 'terminal_uncertain', journal.error);
  }
}

async function applyPair(journal: GenerationJournal, pair: GenerationJournalPair, journalPath: string, env?: NodeJS.ProcessEnv): Promise<void> {
  if (pair.mode === 'activate_staged') {
    if (pair.backup_initially_present) {
      await transactionRename(journal, pair, journalPath, 'backup_to_displaced', pair.backup, pair.displaced!, env);
    } else {
      pair.step = 'backup_to_displaced_done';
      await persistJournal(journalPath, journal);
    }
    await transactionRename(journal, pair, journalPath, 'staged_to_backup', pair.staged!, pair.backup, env);
  }
  if (pair.active_initially_present) {
    await transactionRename(journal, pair, journalPath, 'active_to_temp', pair.active, pair.temporary, env);
  } else {
    pair.step = 'active_to_temp_done';
    await persistJournal(journalPath, journal);
  }
  await transactionRename(journal, pair, journalPath, 'backup_to_active', pair.backup, pair.active, env);
  if (pair.active_initially_present) {
    await transactionRename(journal, pair, journalPath, 'temp_to_backup', pair.temporary, pair.backup, env);
  } else {
    pair.step = 'temp_to_backup_done';
    await persistJournal(journalPath, journal);
  }
}

async function recoverPair(journal: GenerationJournal, pair: GenerationJournalPair, journalPath: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const rank = stepRank(pair.step);
  if (pair.active_initially_present
      && rank >= stepRank('temp_to_backup_intent')
      && !(await existsNoFollow(pair.temporary))
      && await existsNoFollow(pair.backup)) {
    await recoveryRename(journal, pair, journalPath, 'temp_to_backup', pair.backup, pair.temporary, 'backup_to_active_done', env);
  }
  if (rank >= stepRank('backup_to_active_intent')
      && await existsNoFollow(pair.active)
      && !(await existsNoFollow(pair.backup))) {
    await recoveryRename(journal, pair, journalPath, 'backup_to_active', pair.active, pair.backup, 'active_to_temp_done', env);
  }
  if (pair.active_initially_present
      && rank >= stepRank('active_to_temp_intent')
      && await existsNoFollow(pair.temporary)
      && !(await existsNoFollow(pair.active))) {
    await recoveryRename(
      journal,
      pair,
      journalPath,
      'active_to_temp',
      pair.temporary,
      pair.active,
      pair.mode === 'activate_staged' ? 'staged_to_backup_done' : 'pending',
      env
    );
  }
  if (pair.mode === 'activate_staged') {
    if (rank >= stepRank('staged_to_backup_intent')
        && await existsNoFollow(pair.backup)
        && !(await existsNoFollow(pair.staged!))) {
      await recoveryRename(journal, pair, journalPath, 'staged_to_backup', pair.backup, pair.staged!, 'backup_to_displaced_done', env);
    }
    if (pair.backup_initially_present
        && rank >= stepRank('backup_to_displaced_intent')
        && await existsNoFollow(pair.displaced!)
        && !(await existsNoFollow(pair.backup))) {
      await recoveryRename(journal, pair, journalPath, 'backup_to_displaced', pair.displaced!, pair.backup, 'pending', env);
    }
  }
  await verifyRecoveredPair(pair);
  if (pair.mode === 'activate_staged' && pair.staged) await fs.rm(pair.staged, { recursive: true, force: true });
  await fs.rm(pair.temporary, { recursive: true, force: true });
  if (pair.displaced) await fs.rm(pair.displaced, { recursive: true, force: true });
}

async function verifyRecoveredPair(pair: GenerationJournalPair): Promise<void> {
  const activeExists = await existsNoFollow(pair.active);
  const backupExists = await existsNoFollow(pair.backup);
  if (activeExists !== pair.active_initially_present) throw new Error(`generation_recovery_active_state_mismatch:${pair.kind}`);
  if (backupExists !== pair.backup_initially_present) throw new Error(`generation_recovery_backup_state_mismatch:${pair.kind}`);
}

async function transactionRename(
  journal: GenerationJournal,
  pair: GenerationJournalPair,
  journalPath: string,
  operation: 'backup_to_displaced' | 'staged_to_backup' | 'active_to_temp' | 'backup_to_active' | 'temp_to_backup',
  from: string,
  to: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  journal.failure_pair = pair.kind;
  journal.failure_point = `${operation}:before`;
  pair.step = `${operation}_intent` as PairStep;
  await persistJournal(journalPath, journal);
  await fault(env, journal.purpose, pair.kind, operation, 'before');
  await fs.rename(from, to);
  journal.failure_point = `${operation}:after`;
  await persistJournal(journalPath, journal);
  await fault(env, journal.purpose, pair.kind, operation, 'after');
  pair.step = `${operation}_done` as PairStep;
  journal.failure_point = null;
  journal.failure_pair = null;
  await persistJournal(journalPath, journal);
}

async function recoveryRename(
  journal: GenerationJournal,
  pair: GenerationJournalPair,
  journalPath: string,
  operation: 'backup_to_displaced' | 'staged_to_backup' | 'active_to_temp' | 'backup_to_active' | 'temp_to_backup',
  from: string,
  to: string,
  nextStep: PairStep,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  const point = `recover_${operation}`;
  journal.failure_pair = pair.kind;
  journal.failure_point = `${point}:before`;
  await persistJournal(journalPath, journal);
  await fault(env, journal.purpose, pair.kind, point, 'before');
  await fs.rename(from, to);
  pair.step = nextStep;
  journal.failure_point = `${point}:after`;
  await persistJournal(journalPath, journal);
  await fault(env, journal.purpose, pair.kind, point, 'after');
  journal.failure_pair = null;
  journal.failure_point = null;
  await persistJournal(journalPath, journal);
}

async function cleanupCommittedJournal(journal: GenerationJournal, journalPath: string, env?: NodeJS.ProcessEnv): Promise<void> {
  for (const pair of journal.pairs) {
    await fault(env, journal.purpose, pair.kind, 'commit_cleanup', 'before');
    await fs.rm(pair.temporary, { recursive: true, force: true });
    if (pair.displaced) await fs.rm(pair.displaced, { recursive: true, force: true });
    if (pair.staged) await fs.rm(pair.staged, { recursive: true, force: true });
    await fault(env, journal.purpose, pair.kind, 'commit_cleanup', 'after');
  }
  await fs.rm(journalPath, { force: true });
}

async function fault(
  env: NodeJS.ProcessEnv | undefined,
  purpose: SksMenuBarGenerationPurpose,
  kind: SksMenuBarGenerationArtifact,
  operation: string,
  phase: 'before' | 'after'
): Promise<void> {
  const requested = new Set(String(env?.SKS_MENUBAR_TRANSACTION_FAULT_AT || '').split(',').map((value) => value.trim()).filter(Boolean));
  const point = `${purpose}:${kind}:${operation}:${phase}`;
  if (requested.has(point)) throw new Error(`injected_generation_transaction_fault:${point}`);
}

function stepRank(step: PairStep): number {
  return [
    'pending',
    'backup_to_displaced_intent', 'backup_to_displaced_done',
    'staged_to_backup_intent', 'staged_to_backup_done',
    'active_to_temp_intent', 'active_to_temp_done',
    'backup_to_active_intent', 'backup_to_active_done',
    'temp_to_backup_intent', 'temp_to_backup_done'
  ].indexOf(step);
}
