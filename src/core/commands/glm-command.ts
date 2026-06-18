import { flag, positionalArgs } from '../../cli/args.js';
import { runGlmBenchmark } from '../providers/glm/bench/glm-benchmark-runner.js';
import { printJson } from '../../cli/output.js';
import { runGlmDirectSpeedRun } from '../providers/glm/glm-direct-run.js';
import { runGlmReadinessAndExit } from '../providers/glm/glm-readiness.js';
import { runGlmInteractiveLaunch } from '../providers/glm/glm-interactive-launch.js';
import { glmNarutoCommand } from '../providers/glm/naruto/glm-naruto-command.js';

export async function glmCommand(args: string[] = []) {
  if (flag(args, '--naruto') || positionalArgs(args)[0] === 'naruto') {
    const narutoArgs = args.filter((a) => a !== '--naruto' && a !== 'naruto');
    return glmNarutoCommand(narutoArgs);
  }
  if (flag(args, '--bench') && !flag(args, '--naruto')) {
    const result = await runGlmBenchmark(process.cwd(), args);
    if (result.status === 'blocked') process.exitCode = 1;
    if (flag(args, '--json')) printJson(result);
    else if (result.status === 'blocked') console.error(`GLM benchmark blocked: ${result.warnings.join(', ')}`);
    else if (result.status === 'dry_run') console.log(`GLM benchmark: dry-run (use --live for real measurement)`);
    else {
      const direct = result.cases.find((c) => c.implementation_path === 'direct-glm');
      if (direct) console.log(`  Direct GLM: ${direct.wall_clock_ms}ms`);
      console.log(`  Recommendation: ${result.comparison.recommendation}`);
    }
    return result;
  }
  const task = extractGlmTask(args);
  const interactive = flag(args, '--interactive') || flag(args, '--open') || flag(args, '--zellij') || positionalArgs(args)[0] === 'session';
  if (interactive) {
    const readiness = await runGlmReadinessAndExit(args);
    if (!readiness.ok) return readiness;
    return runGlmInteractiveLaunch(args, readiness);
  }
  if (!task || flag(args, '--repair') || flag(args, '--status')) {
    return runGlmReadinessAndExit(args);
  }
  const result = await runGlmDirectSpeedRun({
    cwd: process.cwd(),
    task,
    args,
    dryRun: flag(args, '--dry-run')
  });
  if (flag(args, '--json')) printJson(result);
  else if (result.ok) console.log(`GLM direct run completed: ${result.termination_reason}`);
  else console.error(`GLM direct run ${result.status}: ${result.blockers.join(', ') || result.termination_reason}`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function extractGlmTask(args: readonly string[]): string | null {
  const positional = positionalArgs(args).map(String);
  if (positional[0] === 'run') return positional.slice(1).join(' ').trim() || null;
  if (positional[0] === 'session') return null;
  if (positional[0] === 'naruto') return null;
  return positional.join(' ').trim() || null;
}
