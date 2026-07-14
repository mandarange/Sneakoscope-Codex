import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, packageRoot, sha256 } from '../../fsx.js';
import { aggregateFileHashes } from './build-stamp.js';
import { NATIVE_RESOURCE_FILES, NATIVE_SOURCE_FILES, SKS_MENUBAR_LABEL } from './constants.js';
import type { NativeSourceInput, SksMenuBarBuildStamp } from './types.js';

export interface NativeSourceFile {
  name: string;
  sourcePath: string;
  content: string;
  sha256: string;
}

export function resolvePackagedMenuBarSourceRoot(): string {
  const distCandidate = fileURLToPath(new URL('../../../native/sks-menubar', import.meta.url));
  const sourceCandidate = path.join(packageRoot(), 'native', 'sks-menubar');
  if (fsSync.existsSync(path.join(distCandidate, 'Sources'))) return distCandidate;
  if (fsSync.existsSync(path.join(sourceCandidate, 'Sources'))) return sourceCandidate;
  return distCandidate;
}

export function loadNativeMenuBarSources(input: NativeSourceInput): NativeSourceFile[] {
  const sourceRoot = resolvePackagedMenuBarSourceRoot();
  const replacements: Record<string, string> = {
    '__SKS_ACTION_SCRIPT__': swiftLiteral(input.actionScriptPath),
    '__SKS_BUILD_STAMP__': swiftLiteral(input.buildStampPath),
    '__SKS_CONFIG_PATH__': swiftLiteral(input.configPath),
    '__SKS_LAST_LOG__': swiftLiteral(input.lastActionLogPath),
    '__SKS_OPERATION_DIR__': swiftLiteral(input.operationDirPath),
    '__SKS_CODEX_BUNDLE_ID__': input.codexBundleId ? swiftLiteral(input.codexBundleId) : 'nil',
    '__SKS_PACKAGE_VERSION__': swiftLiteral(input.packageVersion)
  };
  return NATIVE_SOURCE_FILES.map((name) => {
    const sourcePath = path.join(sourceRoot, 'Sources', name);
    let content = fsSync.readFileSync(sourcePath, 'utf8');
    for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(token, value);
    return { name, sourcePath, content, sha256: sha256(content) };
  });
}

export function swiftMenuSource(input: Omit<NativeSourceInput, 'operationDirPath'> & { operationDirPath?: string }): string {
  return loadNativeMenuBarSources({
    ...input,
    operationDirPath: input.operationDirPath || path.join(path.dirname(input.lastActionLogPath), '..', 'operations')
  }).map((entry) => `// MARK: - ${entry.name}\n${entry.content}`).join('\n\n');
}

export function infoPlistSource(version: string): string {
  const templatePath = path.join(resolvePackagedMenuBarSourceRoot(), 'Info.plist.template');
  return fsSync.readFileSync(templatePath, 'utf8')
    .replaceAll('__SKS_BUNDLE_IDENTIFIER__', SKS_MENUBAR_LABEL)
    .replaceAll('__SKS_VERSION__', escapeXml(version));
}

export async function materializeNativeSources(input: {
  targetDir: string;
  runtime: NativeSourceInput;
}): Promise<{ files: string[]; hashes: Record<string, string>; combinedSha256: string }> {
  await fs.rm(input.targetDir, { recursive: true, force: true });
  await ensureDir(input.targetDir);
  const loaded = loadNativeMenuBarSources(input.runtime);
  const files: string[] = [];
  const hashes: Record<string, string> = {};
  for (const entry of loaded) {
    const target = path.join(input.targetDir, entry.name);
    await fs.writeFile(target, entry.content, { encoding: 'utf8', mode: 0o600 });
    files.push(target);
    hashes[entry.name] = entry.sha256;
  }
  const combinedSha256 = aggregateFileHashes(hashes);
  return { files, hashes, combinedSha256 };
}

export async function copyNativeResources(targetDir: string): Promise<Record<string, string>> {
  const sourceDir = path.join(resolvePackagedMenuBarSourceRoot(), 'Resources');
  await ensureDir(targetDir);
  const hashes: Record<string, string> = {};
  for (const name of NATIVE_RESOURCE_FILES) {
    const source = path.join(sourceDir, name);
    if (!(await exists(source))) throw new Error(`menubar_resource_missing:${name}`);
    const bytes = await fs.readFile(source);
    if (bytes.length === 0) throw new Error(`menubar_resource_empty:${name}`);
    await fs.copyFile(source, path.join(targetDir, name));
    hashes[name] = sha256(bytes);
  }
  return hashes;
}

export function nativeResourceHashes(): Record<string, string> {
  const sourceDir = path.join(resolvePackagedMenuBarSourceRoot(), 'Resources');
  return Object.fromEntries(NATIVE_RESOURCE_FILES.map((name) => {
    const file = path.join(sourceDir, name);
    const bytes = fsSync.readFileSync(file);
    if (bytes.length === 0) throw new Error(`menubar_resource_empty:${name}`);
    return [name, sha256(bytes)];
  }));
}

export async function inspectInstalledResources(input: {
  resourcesDir: string;
  buildStamp: SksMenuBarBuildStamp | null;
}): Promise<{ checked: boolean; ok: boolean; missing: string[]; mismatched: string[] }> {
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const name of NATIVE_RESOURCE_FILES) {
    const file = path.join(input.resourcesDir, name);
    if (!(await exists(file))) {
      missing.push(name);
      continue;
    }
    const expected = input.buildStamp?.resource_files_sha256?.[name];
    if (!expected || sha256(await fs.readFile(file)) !== expected) mismatched.push(name);
  }
  return { checked: true, ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

function swiftLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
