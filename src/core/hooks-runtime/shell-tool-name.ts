/**
 * The shell-class tool names a Codex hook payload carries: `shell`,
 * `shell_command`, `exec_command`, `local_shell`, `bash` in any case, with an
 * optional `functions.` prefix, and `container.exec`. A hook guard that asks
 * "did this call execute a shell command" must use this one definition, so the
 * parent orchestration gate and the harness guard cannot drift apart.
 */
export const SHELL_TOOL_RE = /^(?:functions\.)?(?:shell|shell_command|exec_command|local_shell|bash|container\.exec)$/i;
