import path from 'node:path';
import { HERMES_SKILL_NAME, buildHermesSkillFiles, defaultHermesSkillDir, installHermesSkill } from '../core/hermes.js';
import { exists } from '../core/fsx.js';

const flag = (args: any, name: any) => args.includes(name);

function readFlagValue(args: any, name: any, fallback: any) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function positionalArgs(args: any = []) {
  const out: any[] = [];
  const valueFlags = new Set(['--dir']);
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('--')) out.push(arg);
  }
  return out;
}

export async function hermesCommand(args: any = []) {
  const action = args[0] || 'help';
  const targetDir = readFlagValue(args, '--dir', defaultHermesSkillDir());
  const resultOptions = {
    targetDir,
    force: flag(args, '--force'),
    dryRun: flag(args, '--dry-run')
  };
  if (action === 'path') {
    const result = { skill: HERMES_SKILL_NAME, target_dir: path.resolve(targetDir) };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(result.target_dir);
    return;
  }
  if (action === 'status') {
    const files = buildHermesSkillFiles();
    const target = path.resolve(targetDir);
    const installed = await exists(path.join(target, 'SKILL.md'));
    const result = {
      schema: 'sks.hermes-skill-status.v1',
      ok: true,
      skill: HERMES_SKILL_NAME,
      target_dir: target,
      installed,
      expected_files: Object.keys(files),
      env_mode: 'SKS_HERMES=1',
      slash_command: `/${HERMES_SKILL_NAME}`
    };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Hermes skill: ${installed ? 'installed' : 'not installed'} ${target}`);
    return;
  }
  if (action === 'print') {
    const files = buildHermesSkillFiles();
    const file = (positionalArgs(args.slice(1))[0] || 'SKILL.md') as keyof typeof files;
    if (!files[file]) {
      console.error(`Unknown Hermes skill file: ${file}`);
      console.error(`Files: ${Object.keys(files).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(files[file]);
    return;
  }
  if (action === 'install') {
    const result = await installHermesSkill(resultOptions);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      console.error(`Hermes skill install blocked: ${result.reason}`);
      console.error(`Target: ${result.target_dir}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Hermes skill ${result.status}: ${result.target_dir}`);
    console.log(`Use it in Hermes as /${HERMES_SKILL_NAME} and run SKS shell commands with SKS_HERMES=1.`);
    return;
  }
  console.log(`Hermes

Usage:
  sks hermes install [--dir path] [--force] [--dry-run] [--json]
  sks hermes status [--dir path] [--json]
  sks hermes path [--dir path] [--json]
  sks hermes print [SKILL.md|README.md|hermes-config.example.yaml|skill-bundle.example.yaml]

Default skill: ${HERMES_SKILL_NAME}
Default path:  ${defaultHermesSkillDir()}

After install, open Hermes and invoke:

/${HERMES_SKILL_NAME} Use SKS in this repository.
`);
}
