import path from 'node:path';
import { sksRoot } from '../fsx.mjs';
import { loadSkillDreamState, recordSkillDreamEvent, runSkillDream } from '../skill-forge.mjs';
import { flag, knownGeneratedSkillNames, positionalArgs, readFlagValue } from './command-utils.mjs';

export async function skillDreamCommand(sub, args = []) {
  const action = sub && !String(sub).startsWith('--') ? sub : 'status';
  const actionArgs = action === sub ? args : [sub, ...args].filter(Boolean);
  if (!['status', 'run', 'record', 'help', '--help'].includes(action)) {
    console.error('Usage: sks skill-dream status|run|record [--json]');
    process.exitCode = 1;
    return;
  }
  if (action === 'help' || action === '--help') {
    console.log('Usage: sks skill-dream status|run|record [--json]');
    return;
  }
  const root = await sksRoot();
  if (action === 'record') {
    const skills = readFlagValue(actionArgs, '--skills', '').split(',').map((x) => x.trim()).filter(Boolean);
    const result = await recordSkillDreamEvent(root, { route: readFlagValue(actionArgs, '--route', positionalArgs(actionArgs).join(' ') || 'manual'), command: readFlagValue(actionArgs, '--command', null), required_skills: skills, prompt_signature: readFlagValue(actionArgs, '--prompt-signature', null) }, { known_skill_names: knownGeneratedSkillNames() });
    if (flag(actionArgs, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Skill Dream Record');
    console.log(`Events since last run: ${result.state.counters.events_since_last_run}`);
    if (result.report) console.log(`Report: ${path.relative(root, result.report.report_path)}`);
    return;
  }
  if (action === 'run') {
    const report = await runSkillDream(root, { force: true, known_skill_names: knownGeneratedSkillNames() });
    if (flag(actionArgs, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('SKS Skill Dream');
    console.log(`Inventory: ${report.inventory.total} skills`);
    console.log(`Report: ${path.relative(root, report.report_path)}`);
    return;
  }
  const state = await loadSkillDreamState(root);
  if (flag(actionArgs, '--json')) return console.log(JSON.stringify(state, null, 2));
  console.log('SKS Skill Dream Status');
  console.log(`Events since last run: ${state.counters.events_since_last_run}/${state.policy.min_events_between_runs}`);
}
