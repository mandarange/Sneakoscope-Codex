#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith('-')) || 'install';
const autonomous = args.includes('--no-tui') || args.includes('--yes') || args.includes('-y');

function run(cmd: string, cmdArgs: string[]): number {
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
  return result.status ?? 1;
}

if (!['install', 'setup', 'bootstrap'].includes(command)) {
  console.error('Usage: npx sneakoscope install [--yes|--no-tui]');
  process.exit(2);
}

console.log('SKS installer - proof-first Codex harness');
const already = spawnSync('sks', ['--version'], { encoding: 'utf8' });
if (already.status !== 0) {
  console.log('> installing global package (npm i -g sneakoscope)...');
  if (run('npm', ['install', '-g', 'sneakoscope']) !== 0) {
    console.error('global install failed - check npm permissions');
    process.exit(1);
  }
}

console.log('> repairing/validating environment (sks doctor --fix)...');
if (run('sks', ['doctor', '--fix', ...(autonomous ? ['--yes'] : [])]) !== 0) {
  console.error('doctor reported blockers - see report above');
  process.exit(1);
}

console.log(`
SKS ready. 다음 3개만 기억하세요 (Codex 입력창에서):
   $sks-plan "무엇을 만들지" - 계획만 세움 (코드 안 건드림)
   $sks-work                 - 계획을 증거 기반으로 실행
   실시간 화면: sks ui  (웹 대시보드) / zellij 세션은 자동
`);
