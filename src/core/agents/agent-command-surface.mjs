import { DEFAULT_AGENT_COUNT } from './agent-schema.mjs';
export function parseAgentCommandArgs(command, args = []) {
    const first = args[0] && !String(args[0]).startsWith('--') ? String(args[0]) : '';
    const actions = new Set(['run', 'status', 'plan', 'spawn', 'watch', 'lane', 'board', 'ledger', 'collect', 'consensus', 'close', 'cleanup', 'proof', 'explain']);
    const action = actions.has(first) ? first : 'run';
    const rest = action === first ? args.slice(1) : args;
    const json = hasFlag(args, '--json');
    const agents = Number(readOption(args, '--agents', DEFAULT_AGENT_COUNT));
    const concurrency = Number(readOption(args, '--concurrency', Math.min(agents, 5)));
    const backend = String(readOption(args, '--backend', hasFlag(args, '--mock') ? 'fake' : 'codex-exec'));
    const route = String(readOption(args, '--route', '$Agent'));
    const mock = hasFlag(args, '--mock') || backend === 'fake';
    const real = hasFlag(args, '--real');
    const readonly = hasFlag(args, '--readonly') || hasFlag(args, '--read-only');
    const missionDefault = action === 'run' || action === 'spawn' || action === 'plan' ? '' : 'latest';
    const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', missionDefault)));
    const lane = String(readOption(args, '--agent', readOption(args, '--lane', '')));
    const prompt = positionalArgs(rest, new Set(['--agents', '--concurrency', '--backend', '--route', '--mission', '--mission-id', '--agent', '--lane'])).join(' ').trim() || 'Native agent run';
    return { command, action, prompt, route, agents, concurrency, backend, mock, real, readonly, json, missionId, lane };
}
function hasFlag(args, flag) {
    return args.includes(flag);
}
function readOption(args, name, fallback) {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--'))
        return args[index + 1];
    const prefixed = args.find((arg) => String(arg).startsWith(name + '='));
    return prefixed ? prefixed.slice(name.length + 1) : fallback;
}
function positionalArgs(args, valueFlags) {
    const out = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = String(args[i]);
        if (arg.startsWith('--')) {
            if (valueFlags.has(arg) && args[i + 1] && !String(args[i + 1]).startsWith('--'))
                i += 1;
            continue;
        }
        out.push(arg);
    }
    return out;
}
//# sourceMappingURL=agent-command-surface.js.map