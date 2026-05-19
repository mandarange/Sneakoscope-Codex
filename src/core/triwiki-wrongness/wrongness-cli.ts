import { projectRoot } from '../fsx.js';
import { flag, positionalArgs, readOption } from '../commands/command-utils.js';
import {
  addWrongnessRecord,
  findWrongnessRecord,
  readCombinedWrongnessRecords,
  readWrongnessLedger,
  resolveWrongnessMissionId,
  resolveWrongnessRecord,
  summarizeWrongness,
  validateWrongnessScope,
  writeWrongnessSummaries
} from './wrongness-ledger.js';
import { wrongnessContextForRoute } from './wrongness-retrieval.js';
import { renderAvoidanceRules } from './avoidance-rules.js';
import { normalizeWrongnessKind } from './wrongness-schema.js';
import { publishSharedMemory } from '../git-hygiene/shared-memory-publish.js';

export async function wrongnessCommand(args: string[] = []) {
  const root = await projectRoot();
  const [actionRaw = 'list', ...rest] = args;
  const action = actionRaw === 'ls' ? 'list' : actionRaw;
  if (action === 'list') return listWrongness(root, rest);
  if (action === 'show') return showWrongness(root, rest);
  if (action === 'add') return addWrongness(root, rest);
  if (action === 'resolve') return resolveWrongness(root, rest);
  if (action === 'summarize' || action === 'summary') return summarizeWrongnessCommand(root, rest);
  if (action === 'validate') return validateWrongnessCommand(root, rest);
  if (action === 'context') return contextWrongness(root, rest);
  if (action === 'rules') return avoidanceRules(root, rest);
  if (action === 'publish') return publishWrongness(root, rest);
  console.error('Usage: sks wrongness list|show|add|resolve|summarize|validate|context|rules|publish [latest|mission-id|project] [--json]');
  process.exitCode = 2;
}

export async function wikiWrongnessCommand(args: string[] = []) {
  const root = await projectRoot();
  const [actionRaw = 'list', ...rest] = args;
  const action = actionRaw === 'pack' ? 'summarize' : actionRaw;
  if (action === 'list') return listWrongness(root, rest);
  if (action === 'validate') return validateWrongnessCommand(root, rest);
  if (action === 'summarize' || action === 'summary') return summarizeWrongnessCommand(root, rest);
  if (action === 'context') return contextWrongness(root, rest);
  if (action === 'publish') return publishWrongness(root, rest);
  console.error('Usage: sks wiki wrongness list|validate|pack|summarize|context|publish [latest|mission-id|project] [--json]');
  process.exitCode = 2;
}

async function listWrongness(root: string, args: string[]) {
  const target = positionalArgs(args)[0] || 'project';
  const missionId = await resolveWrongnessMissionId(root, target);
  const ledger = await readWrongnessLedger(root, missionId);
  const output = {
    schema: 'sks.wrongness-list.v1',
    target,
    mission_id: missionId,
    records: ledger.records
  };
  if (flag(args, '--json')) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`Wrongness records: ${ledger.records.length}`);
    for (const record of ledger.records) console.log(`- ${record.id} ${record.status} ${record.severity}/${record.wrongness_kind}: ${record.claim.text}`);
  }
  return output;
}

async function showWrongness(root: string, args: string[]) {
  const id = positionalArgs(args)[0];
  if (!id) throw new Error('Usage: sks wrongness show <id>');
  const record = await findWrongnessRecord(root, id);
  if (!record) {
    const output = { schema: 'sks.wrongness-show.v1', ok: false, id, issue: 'wrongness_record_missing' };
    if (flag(args, '--json')) console.log(JSON.stringify(output, null, 2));
    else console.log(`Wrongness record missing: ${id}`);
    process.exitCode = 1;
    return output;
  }
  if (flag(args, '--json')) console.log(JSON.stringify(record, null, 2));
  else {
    console.log(`${record.id} ${record.status} ${record.severity}/${record.wrongness_kind}`);
    console.log(record.claim.text);
    console.log(`Avoid: ${record.avoidance_rule.text}`);
  }
  return record;
}

async function addWrongness(root: string, args: string[]) {
  const missionId = await resolveWrongnessMissionId(root, readOption(args, '--mission-id', null));
  const kind = normalizeWrongnessKind(readOption(args, '--kind', 'incorrect_claim'));
  const claimText = readOption(args, '--claim', null) || positionalArgs(args).join(' ').trim() || 'Manual wrongness memory entry';
  const result = await addWrongnessRecord(root, {
    mission_id: missionId,
    route: readOption(args, '--route', null),
    wrongness_kind: kind,
    severity: readOption(args, '--severity', null),
    claim: { text: claimText, prior_status: readOption(args, '--prior-status', null) },
    detected_by: {
      source: readOption(args, '--source', 'manual'),
      artifact: readOption(args, '--artifact', null),
      command: readOption(args, '--command', null),
      detail: readOption(args, '--reason', null)
    },
    root_cause: {
      category: readOption(args, '--root-cause', 'unknown'),
      explanation: readOption(args, '--reason', 'Manual wrongness record')
    },
    corrective_action: {
      summary: readOption(args, '--corrective-action', 'Correct the claim or attach current evidence before reuse.'),
      required_evidence: splitCsv(readOption(args, '--required-evidence', '')),
      patch_status: readOption(args, '--patch-status', 'pending')
    },
    avoidance_rule: {
      text: readOption(args, '--avoid', null) || 'Do not reuse this claim without source-backed correction evidence.',
      applies_to: splitCsv(readOption(args, '--applies-to', '')),
      severity: readOption(args, '--severity', null)
    },
    links: {
      files: splitCsv(readOption(args, '--files', '')),
      tests: splitCsv(readOption(args, '--tests', '')),
      artifacts: splitCsv(readOption(args, '--artifacts', ''))
    }
  }, { missionId });
  if (flag(args, '--json')) console.log(JSON.stringify({ schema: 'sks.wrongness-add.v1', ok: true, record: result.record }, null, 2));
  else console.log(`Wrongness recorded: ${result.record.id}`);
  return result;
}

async function resolveWrongness(root: string, args: string[]) {
  const id = positionalArgs(args)[0];
  if (!id) throw new Error('Usage: sks wrongness resolve <id> [--reason "..."]');
  const falseAlarm = flag(args, '--false-alarm');
  const result = await resolveWrongnessRecord(root, id, falseAlarm ? 'False alarm; does not block trust.' : readOption(args, '--reason', 'Resolved'), falseAlarm ? 'false_alarm' : 'resolved');
  if (flag(args, '--json')) console.log(JSON.stringify({ schema: 'sks.wrongness-resolve.v1', ok: result.updated > 0, ...result }, null, 2));
  else console.log(result.updated > 0 ? `Wrongness resolved: ${id}` : `Wrongness record not found: ${id}`);
  process.exitCode = result.updated > 0 ? 0 : 1;
  return result;
}

async function summarizeWrongnessCommand(root: string, args: string[]) {
  const target = positionalArgs(args)[0] || 'project';
  const missionId = await resolveWrongnessMissionId(root, target);
  await writeWrongnessSummaries(root, missionId);
  const summary = await summarizeWrongness(root, missionId);
  if (flag(args, '--json')) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Wrongness summary: active=${summary.active} total=${summary.total} high=${summary.high_severity_active}`);
  }
  return summary;
}

async function validateWrongnessCommand(root: string, args: string[]) {
  const target = positionalArgs(args)[0] || 'project';
  const result = await validateWrongnessScope(root, target);
  if (flag(args, '--json')) console.log(JSON.stringify({ schema: 'sks.wrongness-validation.v1', target, ...result }, null, 2));
  else {
    console.log(`Wrongness validation: ${result.ok ? 'ok' : 'failed'} (${result.checked} record(s))`);
    for (const issue of result.issues) console.log(`- ${issue}`);
  }
  process.exitCode = result.ok ? 0 : 2;
  return result;
}

async function contextWrongness(root: string, args: string[]) {
  const missionId = await resolveWrongnessMissionId(root, readOption(args, '--mission-id', positionalArgs(args)[0] || null));
  const context = await wrongnessContextForRoute(root, {
    missionId,
    route: readOption(args, '--route', null)
  });
  if (flag(args, '--json')) console.log(JSON.stringify(context, null, 2));
  else {
    console.log(`Active wrongness: ${context.active_records.length}`);
    console.log(renderAvoidanceRules(context.active_avoidance_rules));
  }
  return context;
}

async function avoidanceRules(root: string, args: string[]) {
  const missionId = await resolveWrongnessMissionId(root, readOption(args, '--mission-id', positionalArgs(args)[0] || null));
  const context = await wrongnessContextForRoute(root, {
    missionId,
    route: readOption(args, '--route', null)
  });
  const output = { schema: 'sks.wrongness-rules.v1', rules: context.active_avoidance_rules };
  if (flag(args, '--json')) console.log(JSON.stringify(output, null, 2));
  else console.log(renderAvoidanceRules(context.active_avoidance_rules));
  return output;
}

async function publishWrongness(root: string, args: string[]) {
  if (!flag(args, '--shared')) throw new Error('Usage: sks wrongness publish latest --shared [--redact] [--json]');
  const target = positionalArgs(args)[0] || 'latest';
  if (target !== 'latest') throw new Error('Usage: sks wrongness publish latest --shared [--redact] [--json]');
  const result = await publishSharedMemory(root, { target: 'wrongness', redact: flag(args, '--redact') });
  process.exitCode = result.ok ? 0 : 2;
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Shared wrongness publish: ${result.ok ? 'ok' : 'blocked'}`);
    console.log(`Written: ${result.written.length}`);
    for (const blocker of result.blockers) console.log(`- ${blocker}`);
  }
  return result;
}

function splitCsv(value: unknown): string[] {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}
