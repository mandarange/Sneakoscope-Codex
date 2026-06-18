import { runMadGlmMode } from '../providers/glm/glm-mad-mode.js';
import { flag } from '../../cli/args.js';
import { madHighCommand } from './mad-sks-command.js';
import { runGlmBench } from '../providers/glm/glm-bench.js';
import { printJson } from '../../cli/output.js';

export async function glmCommand(args: string[] = []) {
  if (flag(args, '--bench')) {
    const result = await runGlmBench(process.cwd(), args);
    if (result.status === 'blocked') process.exitCode = 1;
    if (flag(args, '--json')) printJson(result);
    else if (result.status === 'blocked') console.error(`GLM bench blocked: ${result.warnings.join(', ')}`);
    else console.log(`GLM bench: dry-run p50=${result.summary.speed_p50_total_ms}ms ratio=${result.summary.speed_vs_deep_ratio}`);
    return result;
  }
  const result = await runMadGlmMode(args);
  if (!result.ok || flag(args, '--repair') || flag(args, '--json')) return result;
  return madHighCommand(['--glm', ...args], { glmReadiness: result, glmArgs: args });
}
