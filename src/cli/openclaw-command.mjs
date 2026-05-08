import path from 'node:path';
import { OPENCLAW_SKILL_NAME, buildOpenClawSkillFiles, defaultOpenClawSkillDir, installOpenClawSkill } from '../core/openclaw.mjs';

const flag = (args, name) => args.includes(name);

function readFlagValue(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function positionalArgs(args = []) {
  const out = [];
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

export async function openClawCommand(args = []) {
  const action = args[0] || 'help';
  const targetDir = readFlagValue(args, '--dir', defaultOpenClawSkillDir());
  const resultOptions = {
    targetDir,
    force: flag(args, '--force'),
    dryRun: flag(args, '--dry-run')
  };
  if (action === 'path') {
    const result = { skill: OPENCLAW_SKILL_NAME, target_dir: path.resolve(targetDir) };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(result.target_dir);
    return;
  }
  if (action === 'print') {
    const file = positionalArgs(args.slice(1))[0] || 'SKILL.md';
    const files = buildOpenClawSkillFiles();
    if (!files[file]) {
      console.error(`Unknown OpenClaw skill file: ${file}`);
      console.error(`Files: ${Object.keys(files).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(files[file]);
    return;
  }
  if (action === 'install') {
    const result = await installOpenClawSkill(resultOptions);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      console.error(`OpenClaw skill install blocked: ${result.reason}`);
      console.error(`Target: ${result.target_dir}`);
      process.exitCode = 1;
      return;
    }
    console.log(`OpenClaw skill ${result.status}: ${result.target_dir}`);
    console.log(`Attach it to an agent with skills: [${OPENCLAW_SKILL_NAME}] and tools: [shell].`);
    return;
  }
  console.log(`OpenClaw

Usage:
  sks openclaw install [--dir path] [--force] [--dry-run] [--json]
  sks openclaw path [--dir path] [--json]
  sks openclaw print [SKILL.md|manifest.yaml|README.md|openclaw-agent-config.example.yaml]

Default skill: ${OPENCLAW_SKILL_NAME}
Default path:  ${defaultOpenClawSkillDir()}

After install, add this to an OpenClaw agent config:

agents:
  coding-agent:
    tools:
      - shell
    skills:
      - ${OPENCLAW_SKILL_NAME}
`);
}
