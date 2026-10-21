import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiRoot, videoInfo, imageInfo, request, errorResult, download } from '../scripts/lib.mjs';
import { generate as video, videoState } from '../scripts/generate-video.mjs';
import { generate as image } from '../scripts/generate-image.mjs';

function box(type, payload) { const b = Buffer.alloc(8); b.writeUInt32BE(payload.length + 8); b.write(type, 4); return Buffer.concat([b, payload]); }
function mp4() {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(5000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(448 * 65536, 76); tkhd.writeUInt32BE(656 * 65536, 80);
  const handler = name => { const b = Buffer.alloc(24); b.write(name, 8); return box('mdia', box('hdlr', b)); };
  return Buffer.concat([box('ftyp', Buffer.from('isom0000isom')), box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', Buffer.concat([box('tkhd', tkhd), handler('vide')])), box('trak', handler('soun'))])), box('mdat', Buffer.from([1]))]);
}
function png() { const b = Buffer.alloc(45); Buffer.from('89504e470d0a1a0a', 'hex').copy(b); b.write('IHDR', 12); b.writeUInt32BE(16, 16); b.writeUInt32BE(16, 20); b.write('IEND', 37); return b; }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'grok-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cfg = join(dir, 'config.json'); await writeFile(cfg, '\uFEFF' + JSON.stringify({ api_key: 'test-secret-never-print', base_url: 'https://gateway.example/v1' }));
  return { dir, config: cfg, output: join(dir, 'video.mp4'), prompt: 'Flowers', 'poll-interval': '1' };
}
test('normalizes root, /v1, image and video endpoints once', () => {
  for (const suffix of ['', '/', '/v1', '/v1/', '/v1/images/generations', '/v1/videos', '/v1/videos/generations']) assert.equal(apiRoot('https://example.com' + suffix), 'https://example.com/v1');
  assert.throws(() => apiRoot('https://example.com?key=secret'));
  assert.throws(() => apiRoot('http://localhost:15721'));
});
test('unknown and pending statuses never complete because an URL is present', () => {
  assert.equal(videoState({ status: 'pending', video: { url: 'https://cdn.example/a' } }).complete, false);
  assert.equal(videoState({ status: 'new-status', url: 'https://cdn.example/a' }).complete, false);
  assert.equal(videoState({}).complete, false);
  assert.equal(videoState({ status: 'expired' }).failed, true);
  assert.equal(videoState({ status: 'done', video: { url: 'https://cdn.example/a' } }).complete, true);
});
test('validates container, reports true dimensions/audio and rejects HTML/truncation', () => {
  assert.deepEqual([videoInfo(mp4()).width, videoInfo(mp4()).height, videoInfo(mp4()).duration_seconds, videoInfo(mp4()).has_audio], [448, 656, 5, true]);
  assert.throws(() => videoInfo(Buffer.from('<html>error</html>')));
  assert.throws(() => videoInfo(mp4().subarray(0, 80)));
  assert.equal(imageInfo(png()).width, 16);
  assert.throws(() => imageInfo(Buffer.from('not an image')));
});
test('dry-run validates actual reference without network or job creation', async t => {
  const a = await workspace(t); const ref = join(a.dir, 'ref.png'); await writeFile(ref, png());
  const result = await video({ ...a, reference: ref, 'dry-run': true }, { fetchImpl: () => { throw new Error('network forbidden'); } });
  assert.equal(result.reference.mime, 'image/png'); assert.equal(result.network_requests, 0);
  await assert.rejects(access(a.output + '.job.json'));
});
test('reference payload and long prompt file reach POST; ID persists before polling', async t => {
  const a = await workspace(t); const ref = join(a.dir, 'ref.png'); const pf = join(a.dir, 'prompt.txt'); await writeFile(ref, png()); await writeFile(pf, '中文台词\n第二行');
  let posts = 0;
  const fetchImpl = async (url, opts) => {
    if (opts.method === 'POST') { posts++; const body = JSON.parse(opts.body); assert.equal(body.prompt, '中文台词\n第二行'); assert.match(body.image.url, /^data:image\/png;base64,/); return json({ request_id: 'job-1' }); }
    assert.equal(JSON.parse(await readFile(a.output + '.job.json')).request_id, 'job-1');
    return json({ status: 'done', video_base64: mp4().toString('base64') });
  };
  const { prompt, ...rest } = a;
  const r = await video({ ...rest, reference: ref, 'prompt-file': pf }, { fetchImpl, emit: () => {} });
  assert.equal(posts, 1); assert.equal(r.media.has_audio, true);
  const saved = await readFile(a.output + '.job.json', 'utf8'); assert.ok(!saved.includes('test-secret-never-print')); assert.ok(!saved.includes('中文台词'));
});
test('503 POST is never retried; error retains type and trace while redacting secrets', async t => {
  const a = await workspace(t); let count = 0;
  await assert.rejects(video(a, { fetchImpl: async () => { count++; return json({ error: { type: 'grok_media_no_eligible_account', message: 'test-secret-never-print No eligible Grok media accounts' } }, 503, { 'x-request-id': 'trace-1' }); } }), e => {
    const r = errorResult(e); assert.equal(r.status, 503); assert.equal(r.request_id, 'trace-1'); assert.ok(!JSON.stringify(r).includes('test-secret-never-print')); assert.ok(r.hint); return true;
  });
  assert.equal(count, 1);
  assert.equal(JSON.parse(await readFile(a.output + '.job.json')).state, 'submission_unconfirmed');
});
test('resume after polling failure performs GET only and saves output', async t => {
  const a = await workspace(t); let posts = 0;
  await assert.rejects(video(a, { fetchImpl: async (url, opts) => { if (opts.method === 'POST') { posts++; return json({ request_id: 'resume-me' }); } return json({ error: { message: 'not found yet' } }, 404); }, emit: () => {} }));
  const r = await video({ config: a.config, resume: a.output + '.job.json' }, { fetchImpl: async (url, opts) => { assert.equal(opts.method, 'GET'); return json({ status: 'completed', video_base64: mp4().toString('base64') }); }, emit: () => {} });
  assert.equal(posts, 1); assert.equal(r.success, true);
  const already = await video({ config: a.config, resume: a.output + '.job.json' }, { fetchImpl: () => { throw new Error('must not call network'); } });
  assert.equal(already.already_downloaded, true);
});
test('unknown state times out, retains job ID and can be resumed', async t => {
  const a = await workspace(t);
  await assert.rejects(video({ ...a, timeout: '100' }, { fetchImpl: async (url, opts) => opts.method === 'POST' ? json({ request_id: 'unknown' }) : json({ status: 'new-unrecognized-state' }), emit: () => {} }), /timed out/);
  assert.equal(JSON.parse(await readFile(a.output + '.job.json')).request_id, 'unknown');
  await assert.rejects(access(a.output));
});
test('resume rejects a changed provider before any authenticated request', async t => {
  const a = await workspace(t); const jp = a.output + '.job.json';
  await writeFile(jp, JSON.stringify({ version: 1, model: 'grok-imagine-video', output: a.output, request_id: 'x', api_root: 'https://other.example/v1' }));
  await assert.rejects(video({ config: a.config, resume: jp }, { fetchImpl: () => { throw new Error('network forbidden'); } }), /differs/);
});
test('download credentials never reach a redirected CDN', async () => {
  let calls = 0;
  await download('https://gateway.example/v1/content', { key: 'secret', root: 'https://gateway.example/v1', deadline: Date.now() + 5000, fetchImpl: async (url, opts) => {
    calls++; if (calls === 1) { assert.equal(opts.headers.Authorization, 'Bearer secret'); return new Response(null, { status: 302, headers: { location: 'https://cdn.example/video.mp4' } }); }
    assert.equal(opts.headers.Authorization, undefined); return new Response(mp4());
  } }); assert.equal(calls, 2);
});
test('image rejects non-media 200 responses without saving output', async t => {
  const a = await workspace(t);
  await assert.rejects(image(a, { fetchImpl: async () => json({ data: [{ b64_json: Buffer.from('<html>bad</html>').toString('base64') }] }) }), /supported/);
  await assert.rejects(access(a.output));
});
test('existing output fails before submitting, and image payload remains minimal', async t => {
  const a = await workspace(t); await writeFile(a.output, 'existing');
  await assert.rejects(image(a, { fetchImpl: () => { throw new Error('network forbidden'); } }), /already exists/);
  await image({ ...a, output: join(a.dir, 'image.png') }, { fetchImpl: async (url, opts) => { assert.deepEqual(Object.keys(JSON.parse(opts.body)).sort(), ['model', 'n', 'prompt', 'response_format']); return json({ data: [{ b64_json: png().toString('base64') }] }); } });
});
