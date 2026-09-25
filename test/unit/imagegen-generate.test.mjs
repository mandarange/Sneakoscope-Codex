import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateSksImage, readImagegenSidecar } from '../../dist/core/imagegen/imagegen-generate.js';
import { writeImagegenConfig } from '../../dist/core/imagegen/imagegen-config.js';
import {
  defaultDesktopBridgeServiceSettings,
  desktopBridgeServicePaths,
  ensureDesktopBridgeClientCapability,
  writeDesktopBridgeServiceSettings
} from '../../dist/core/codex-lb/desktop-service.js';

const ONE_PX_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l/5gVQAAAABJRU5ErkJggg==';
const PORT = 50555;

async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-generate-'));
  const env = { HOME: home, CODEX_HOME: path.join(home, '.codex') };
  const paths = desktopBridgeServicePaths(home);
  const capability = await ensureDesktopBridgeClientCapability(paths.client_capability_path);
  await writeDesktopBridgeServiceSettings(paths.settings_path, defaultDesktopBridgeServiceSettings({
    listen_host: '127.0.0.1',
    listen_port: PORT,
    client_capability_sha256: createHash('sha256').update(capability).digest('hex')
  }));
  await fs.writeFile(path.join(env.CODEX_HOME, 'config.toml'), 'model = "gpt-6-astra"\n\n[features]\nimage_generation = true\n');
  const reference = path.join(home, 'screen.png');
  await fs.writeFile(reference, Buffer.from(ONE_PX_PNG, 'base64'));
  return { home, env, capability, reference, cleanup: () => fs.rm(home, { recursive: true, force: true }) };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('custom mode calls the bridge image endpoint on the capability path and writes evidence next to the image', async () => {
  const f = await fixture();
  try {
    await writeImagegenConfig({ mode: 'openrouter', openrouterModel: 'google/gemini-3.1-flash-image' }, f.env);
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return json({ ok: true, model: 'google/gemini-3.1-flash-image', images: [{ mime: 'image/png', base64: ONE_PX_PNG }], usage: { cost: 0.01 } });
    };
    const out = path.join(f.home, 'art', 'hero.png');
    const result = await generateSksImage({ prompt: 'a red dot', outPath: out, references: [f.reference], aspectRatio: '16:9', env: f.env, fetchImpl });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `http://127.0.0.1:${PORT}/__sks/client/${f.capability}/__sks/imagegen/generations`);
    assert.equal(calls[0].body.model, 'google/gemini-3.1-flash-image');
    assert.equal(calls[0].body.aspect_ratio, '16:9');
    assert.equal(calls[0].body.references.length, 1);
    assert.equal(result.via, 'bridge');
    assert.equal(result.evidence_class, 'sks_custom_imagegen');
    const sidecar = await readImagegenSidecar(out);
    assert.equal(sidecar.model, 'google/gemini-3.1-flash-image');
    assert.equal(sidecar.sha256, result.outputs[0].sha256);
    await fs.writeFile(out, Buffer.from('changed'));
    assert.equal(await readImagegenSidecar(out), null, 'evidence stops matching once the bytes change');
  } finally {
    await f.cleanup();
  }
});

test('custom mode calls OpenRouter directly when the running bridge predates the endpoint', async () => {
  const f = await fixture();
  try {
    await writeImagegenConfig({ mode: 'openrouter', openrouterModel: 'google/gemini-3.1-flash-image' }, f.env);
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(String(init.body)) });
      if (String(url).includes('/__sks/imagegen/')) return json({ ok: false, error: 'bridge_path_not_allowed' }, 404);
      return json({ created: 1, data: [{ b64_json: ONE_PX_PNG, media_type: 'image/png' }], usage: { cost: 0.03 } });
    };
    const result = await generateSksImage({ prompt: 'a red dot', outPath: path.join(f.home, 'dot.png'), aspectRatio: '1:1', env: { ...f.env, OPENROUTER_API_KEY: 'test-openrouter-key' }, fetchImpl });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.via, 'direct');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://openrouter.ai/api/v1/images');
    assert.equal(calls[1].headers.Authorization, 'Bearer test-openrouter-key');
    assert.equal(calls[1].body.model, 'google/gemini-3.1-flash-image');
    assert.equal(calls[1].body.aspect_ratio, '1:1');
    assert.equal(result.usage.cost, 0.03);
    assert.ok(result.warnings.some((w) => w.startsWith('bridge_imagegen_unavailable')));
  } finally {
    await f.cleanup();
  }
});

test('Codex default mode sends the hosted image tool, with no pinned image model, on the Codex model route', async () => {
  const f = await fixture();
  try {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(String(init.body)) });
      const events = [
        { type: 'response.created', response: { id: 'r1' } },
        { type: 'response.output_item.done', item: { id: 'ig1', type: 'image_generation_call', status: 'completed', result: ONE_PX_PNG } },
        { type: 'response.completed', response: { id: 'r1', status: 'completed', output: [{ id: 'ig1', type: 'image_generation_call', status: 'completed', result: ONE_PX_PNG }] } }
      ];
      return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n`).join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const env = { ...f.env, OPENAI_API_KEY: 'ambient-openai-secret', OPENROUTER_API_KEY: 'ambient-openrouter-secret' };
    const result = await generateSksImage({ prompt: 'a red dot', outPath: path.join(f.home, 'dot.png'), references: [f.reference], aspectRatio: '9:16', env, fetchImpl });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(calls[0].url, `http://127.0.0.1:${PORT}/__sks/client/${f.capability}/backend-api/codex/responses`);
    assert.equal(calls[0].body.model, 'gpt-6-astra');
    assert.equal(calls[0].headers['x-sks-model'], 'gpt-6-astra');
    assert.doesNotMatch(JSON.stringify(calls[0]), /ambient-openai-secret|ambient-openrouter-secret/, 'the bridge adds route credentials; SKS sends none');
    assert.equal(calls[0].body.tools[0].type, 'image_generation');
    assert.equal('model' in calls[0].body.tools[0], false, 'SKS never pins the image engine');
    assert.equal(calls[0].body.tools[0].action, 'edit');
    assert.equal(calls[0].body.tools[0].size, '1024x1536');
    assert.equal(result.model, 'codex-default');
    assert.equal(result.evidence_class, 'codex_bridge_route_imagegen');
  } finally {
    await f.cleanup();
  }
});

test('a partial preview frame is never an image', async () => {
  const f = await fixture();
  try {
    const fetchImpl = async () => new Response([
      { type: 'response.image_generation_call.partial_image', item_id: 'p1', partial_image_b64: ONE_PX_PNG },
      { type: 'response.completed', response: { id: 'r2', status: 'completed', output: [] } }
    ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n`).join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const out = path.join(f.home, 'dot.png');
    const result = await generateSksImage({ prompt: 'a red dot', outPath: out, env: f.env, fetchImpl });
    assert.equal(result.ok, false);
    assert.deepEqual(result.blockers, ['codex_imagegen_output_missing']);
    await assert.rejects(fs.access(out));
  } finally {
    await f.cleanup();
  }
});

test('an image is saved under the extension of its real format, never mislabeled', async () => {
  const f = await fixture();
  try {
    await writeImagegenConfig({ mode: 'openrouter', openrouterModel: 'black-forest-labs/flux.2-klein-4b' }, f.env);
    const bodies = [];
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return json({ ok: true, model: 'black-forest-labs/flux.2-klein-4b', images: [{ mime: 'image/jpeg', base64: ONE_PX_PNG }], warnings: [] });
    };
    const result = await generateSksImage({ prompt: 'a red dot', outPath: path.join(f.home, 'hero.png'), env: f.env, fetchImpl });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(bodies[0].output_format, 'png', 'the bridge is asked for the format the name implies');
    assert.equal(result.outputs[0].path, path.join(f.home, 'hero.jpg'));
    assert.deepEqual(result.warnings, ['imagegen_output_extension_changed:.jpg']);
    await assert.rejects(fs.access(path.join(f.home, 'hero.png')));
  } finally {
    await f.cleanup();
  }
});
