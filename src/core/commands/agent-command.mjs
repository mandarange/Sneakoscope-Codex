export async function agentCommand(command, args = []) {
  const mod = await import('../../../dist/core/commands/agent-command.js');
  return mod.agentCommand(command, args);
}

export const run = agentCommand;
