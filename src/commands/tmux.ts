export async function run(_command: any, args: any = []) {
  const json = args.includes('--json');
  const result = {
    schema: 'sks.removed-runtime.v1',
    ok: false,
    runtime: 'tmux',
    status: 'removed_runtime',
    replacement: 'zellij',
    operator_actions: [
      'Use `sks --mad` for the supported SKS Zellij launcher.',
      'Use `sks zellij status` or `npm run zellij:capability` for runtime diagnostics.',
      'Use `sks naruto status|subagents|proof` for official subagent missions.'
    ]
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.error('tmux runtime has been removed from SKS. Use the Zellij runtime instead.');
    for (const action of result.operator_actions) console.error(`- ${action}`);
  }
  process.exitCode = 2;
  return result;
}
