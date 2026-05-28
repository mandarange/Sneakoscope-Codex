import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';

export function validPngBuffer() {
  return Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64');
}

export function writeValidPngFixture(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, validPngBuffer());
  return file;
}

export function writeRepoTempPngFixture(name, root = process.cwd()) {
  return writeValidPngFixture(path.join(root, '.sneakoscope', 'tmp', 'fixtures', name));
}

export function repoTempPngFixtureArg(name, root = process.cwd()) {
  const file = writeRepoTempPngFixture(name, root);
  return path.relative(root, file).split(path.sep).join('/');
}

export function osTempPngFixtureArg(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-png-fixture-'));
  return writeValidPngFixture(path.join(dir, name));
}
