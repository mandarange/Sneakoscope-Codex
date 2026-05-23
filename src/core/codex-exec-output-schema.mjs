import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, packageRoot, readJson, runProcess, which } from './fsx.mjs';
import { codexVersionPolicy, compareSemverLike, parseCodexVersionText } from './codex-compat/codex-version-policy.mjs';
import { validateJsonSchemaRecursive } from './json-schema-validator.mjs';
export async function detectCodexExecResumeOutputSchema(opts = {}) {
    const codexBin = opts.codexBin || await which('codex').catch(() => null);
    if (!codexBin) {
        return {
            schema: 'sks.codex-exec-output-schema-availability.v1',
            ok: true,
            status: 'integration_optional',
            codex_bin: null,
            version: null,
            output_schema_supported: false,
            output_last_message_supported: false,
            warnings: ['codex binary not detected; output-schema resume path is integration_optional']
        };
    }
    const versionResult = opts.versionText
        ? { code: 0, stdout: String(opts.versionText), stderr: '' }
        : await runProcess(codexBin, ['--version'], { timeoutMs: opts.timeoutMs || 3000, maxOutputBytes: 16 * 1024 });
    const helpResult = opts.resumeHelpText
        ? { code: 0, stdout: String(opts.resumeHelpText), stderr: '' }
        : await runProcess(codexBin, ['exec', 'resume', '--help'], { timeoutMs: opts.timeoutMs || 5000, maxOutputBytes: 64 * 1024 });
    const rawVersion = `${versionResult.stdout || ''}\n${versionResult.stderr || ''}`;
    const version = parseCodexVersionText(rawVersion);
    const help = `${helpResult.stdout || ''}\n${helpResult.stderr || ''}`;
    const outputSchemaSupported = /--output-schema\b/.test(help) || Boolean(version && compareSemverLike(version, '0.132.0') >= 0);
    const outputLastMessageSupported = /--output-last-message\b|-o,/.test(help);
    const policy = codexVersionPolicy({ available: Boolean(version), version, source: 'codex --version' });
    const status = policy.status === 'integration_optional'
        ? 'integration_optional'
        : outputSchemaSupported ? 'available' : 'degraded_supported';
    const warnings = [
        ...policy.warnings,
        ...(outputSchemaSupported ? [] : ['codex exec resume --output-schema unavailable; fallback is capped at verified_partial'])
    ];
    return {
        schema: 'sks.codex-exec-output-schema-availability.v1',
        ok: true,
        status,
        codex_bin: codexBin,
        version,
        output_schema_supported: outputSchemaSupported,
        output_last_message_supported: outputLastMessageSupported,
        warnings
    };
}
export async function codexSchemaPath(name) {
    const clean = String(name || '').replace(/[^A-Za-z0-9_.-]+/g, '');
    const file = clean.endsWith('.json') ? clean : `${clean}.schema.json`;
    const candidate = path.join(packageRoot(), 'schemas', 'codex', file);
    if (!(await exists(candidate)))
        throw new Error(`Codex output schema missing: ${candidate}`);
    return candidate;
}
export async function assertCodexSchemaFile(schemaPath) {
    const absolute = path.resolve(schemaPath);
    const issues = [];
    if (!(await exists(absolute)))
        issues.push('schema_file_missing');
    const parsed = issues.length ? null : await readJson(absolute, null);
    if (!parsed || typeof parsed !== 'object')
        issues.push('schema_invalid_json');
    if (parsed && parsed.type !== 'object')
        issues.push('schema_root_type_not_object');
    return { ok: issues.length === 0, path: absolute, schema_id: parsed?.$id || parsed?.title || null, issues };
}
export async function buildCodexExecResumeOutputSchemaArgs(input) {
    const sessionId = sanitizeResumeId(input.sessionId);
    const schemaPath = path.resolve(input.outputSchemaPath);
    const schema = await assertCodexSchemaFile(schemaPath);
    if (!schema.ok)
        throw new Error(`Invalid output schema: ${schema.issues.join(', ')}`);
    const args = ['exec', 'resume'];
    if (input.json !== false)
        args.push('--json');
    args.push('--output-schema', schemaPath);
    if (input.outputFile)
        args.push('-o', path.resolve(input.outputFile));
    args.push(...Array.from(input.extraArgs || []));
    args.push(sessionId);
    if (input.prompt)
        args.push(String(input.prompt));
    return args;
}
export async function runCodexExecResumeWithOutputSchema(input, opts = {}) {
    const availability = await detectCodexExecResumeOutputSchema({ codexBin: opts.codexBin || undefined });
    if (!availability.codex_bin || availability.status !== 'available' || !availability.output_schema_supported) {
        const status = availability.status === 'available' ? 'degraded_supported' : availability.status;
        return {
            schema: 'sks.codex-exec-output-schema-run.v1',
            ok: false,
            status,
            args: [],
            codex_bin: availability.codex_bin,
            output_file: null,
            parsed_json: null,
            blocker: structuredOutputBlocker('output_schema_unavailable', availability.warnings.join('; ') || 'codex exec resume --output-schema unavailable'),
            validation: { ok: false, issues: ['output_schema_unavailable'] },
            stdout_tail: '',
            stderr_tail: '',
            timed_out: false,
            exit_code: null
        };
    }
    const outputFile = input.outputFile
        ? path.resolve(input.outputFile)
        : path.join(packageRoot(), '.sneakoscope', 'tmp', `codex-output-schema-${Date.now()}.json`);
    await ensureDir(path.dirname(outputFile));
    const args = await buildCodexExecResumeOutputSchemaArgs({ ...input, outputFile });
    const runOpts = {
        cwd: opts.cwd || packageRoot(),
        timeoutMs: opts.timeoutMs || 120_000,
        maxOutputBytes: opts.maxOutputBytes || 256 * 1024
    };
    if (opts.env)
        runOpts.env = opts.env;
    const result = await runProcess(availability.codex_bin, args, runOpts);
    const outputText = await readOutputText(outputFile, result.stdout);
    const parsed = parseStructuredCodexOutput(outputText);
    const schema = await readJson(path.resolve(input.outputSchemaPath), null);
    const validation = parsed.ok ? validateStructuredOutput(parsed.value, schema) : { ok: false, issues: ['json_parse_failed'] };
    const blocker = !parsed.ok
        ? parsed.blocker
        : validation.ok
            ? null
            : structuredOutputBlocker('schema_validation_failed', validation.issues.join(', '));
    return {
        schema: 'sks.codex-exec-output-schema-run.v1',
        ok: result.code === 0 && parsed.ok && validation.ok,
        status: result.code === 0 && parsed.ok && validation.ok ? 'parsed' : 'blocked',
        args,
        codex_bin: availability.codex_bin,
        output_file: outputFile,
        parsed_json: parsed.ok ? parsed.value : null,
        blocker,
        validation,
        stdout_tail: redactCodexOutput(result.stdout).slice(-12_000),
        stderr_tail: redactCodexOutput(result.stderr).slice(-12_000),
        timed_out: result.timedOut,
        exit_code: result.code
    };
}
export function parseStructuredCodexOutput(text) {
    const raw = String(text || '').trim();
    if (!raw) {
        return { ok: false, value: null, blocker: structuredOutputBlocker('json_parse_failed', 'empty output') };
    }
    try {
        return { ok: true, value: JSON.parse(raw), blocker: null };
    }
    catch (err) {
        return { ok: false, value: null, blocker: structuredOutputBlocker('json_parse_failed', err instanceof Error ? err.message : String(err)) };
    }
}
export function validateStructuredOutput(value, schema) {
    return validateJsonSchemaRecursive(value, schema);
}
export function structuredOutputBlocker(reason, detail) {
    return {
        schema: 'sks.codex-structured-output-blocker.v1',
        reason,
        detail: redactCodexOutput(detail),
        status: 'verified_partial_or_blocked',
        wrongness_kind: reason === 'schema_validation_failed' ? 'callout_extraction_schema_failed' : 'missing_evidence'
    };
}
export function redactCodexOutput(text) {
    return String(text || '')
        .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]')
        .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_PAT]')
        .slice(0, 12_000);
}
function sanitizeResumeId(value) {
    const id = String(value || '').trim();
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id))
        throw new Error('Unsafe Codex resume session id');
    return id;
}
async function readOutputText(outputFile, stdout) {
    try {
        const text = await fsp.readFile(outputFile, 'utf8');
        if (text.trim())
            return text;
    }
    catch { }
    return stdout;
}
//# sourceMappingURL=codex-exec-output-schema.js.map