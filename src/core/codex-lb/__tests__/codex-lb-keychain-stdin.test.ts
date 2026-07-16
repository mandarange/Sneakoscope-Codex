import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeCodexLbKeychain } from '../codex-lb-env.js';

test('Keychain writes keep the secret on stdin and allow cold Swift startup beyond five seconds', async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-keychain-stdin-'));
  const fakeSwift = path.join(temp, 'swift');
  const secret = 'sk-clb-stdin-only-test';
  try {
    await fsp.writeFile(fakeSwift, `#!/usr/bin/env node
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const secret=${JSON.stringify(secret)};if(process.argv.some(arg=>arg.includes(secret))||input.trim()!==secret)return process.exit(1);setTimeout(()=>process.exit(0),5250)})
`);
    await fsp.chmod(fakeSwift, 0o755);
    const result = await writeCodexLbKeychain(secret, {
      forceMacos: true,
      swiftBin: fakeSwift,
      account: 'fixture-account',
      service: 'fixture-service'
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'stored');
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
});
