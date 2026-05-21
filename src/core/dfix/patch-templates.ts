import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export type DfixPatchTemplate = {
  id: string;
  label: string;
  confidence: number;
  applies: boolean;
  target_file: string | null;
  patch_mode: string;
  blockers: string[];
};

export async function writeDfixPatchTemplateArtifact(dir: string, input: any = {}) {
  const result = selectDfixPatchTemplate(input);
  await writeJsonAtomic(path.join(dir, 'dfix-patch-template.json'), result);
  return result;
}

export function selectDfixPatchTemplate(input: any = {}) {
  const file = input.file || input.signature?.file || null;
  const templates: DfixPatchTemplate[] = [
    template('exact_find_replace', 'Exact find/replace', input.findText != null && input.replaceText != null && file, file, 'exact_find_replace', 0.94),
    template('missing_import', 'Missing import', /module-not-found|typescript/i.test(input.signature?.error_kind || input.error || '') && file, file, 'bounded_text_patch', 0.78),
    template('wrong_constant_string', 'Wrong constant/string', /expected|actual|version/i.test(input.error || input.signature?.normalized_message || '') && file, file, 'bounded_text_patch', 0.72),
    template('schema_required_field', 'Schema required field', input.signature?.error_kind === 'schema-validation' && file, file, 'bounded_text_patch', 0.76),
    template('package_script_command', 'Package script command', /missing script|npm ERR! Missing script/i.test(input.error || '') && 'package.json', 'package.json', 'json_patch', 0.8),
    template('path_typo', 'Path typo', input.signature?.error_kind === 'missing-file' && file, file, 'bounded_text_patch', 0.72),
    template('null_guard', 'Null/undefined guard', input.signature?.error_kind === 'nullish-typeerror' && file, file, 'bounded_text_patch', 0.7),
    template('typescript_optional_property', 'TypeScript optional property', /^TS/.test(input.signature?.error_code || '') && file, file, 'bounded_text_patch', 0.68),
    template('rust_version_output_mismatch', 'Rust version output mismatch', /\.rs$/.test(String(file || '')) && /version/i.test(input.error || ''), file, 'bounded_text_patch', 0.78),
    template('package_version_drift', 'Package/version drift', /package.*version|version drift/i.test(input.error || '') && file, file, 'bounded_text_patch', 0.82)
  ];
  const selected = templates.find((row) => row.applies) || null;
  return {
    schema: 'sks.dfix-patch-template-selection.v1',
    created_at: nowIso(),
    templates,
    selected_template: selected,
    template_id: selected?.id || null,
    confidence: selected?.confidence || 0,
    exact_target_file: selected?.target_file || null,
    exact_hunk_required: true,
    ambiguous: !selected,
    next_path: selected ? null : 'L2'
  };
}

function template(id: string, label: string, applies: any, targetFile: string | null, patchMode: string, confidence: number): DfixPatchTemplate {
  return {
    id,
    label,
    confidence,
    applies: Boolean(applies),
    target_file: targetFile,
    patch_mode: patchMode,
    blockers: targetFile ? [] : ['target_file_missing']
  };
}
