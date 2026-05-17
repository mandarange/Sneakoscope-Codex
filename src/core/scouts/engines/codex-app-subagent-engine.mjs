export async function runCodexAppSubagentEngine() {
  return {
    engine: 'codex-app-subagents',
    ok: false,
    status: 'blocked',
    blockers: ['Codex App subagent execution requires a runtime capability/event surface that is not exposed to this CLI process.'],
    unverified: ['No Codex App subagent schema or event payload is fabricated.']
  };
}
