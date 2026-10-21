import { readFile, mkdir, writeFile, rename, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.2.0';
export const DEFAULT_CONFIG = fileURLToPath(new URL('../config.local.json', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const secrets = new Set();
export function redact(value) {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]');
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/data:[^\s"']+;base64,[A-Za-z0-9+/=]+/g, '[image data]')
    .replace(/\b(?:sk-|github_pat_|ghp_)[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/https?:\/\/[^\s"<>]+/g, url => {
      try { const u = new URL(url); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.toString(); }
      catch { return '[url]'; }
    }).slice(0, 1200);
}
export class ApiError extends Error {
  constructor(message, details = {}) { super(redact(message)); Object.assign(this, details); }
}
export function errorResult(error) {
  const result = { success: false, error: redact(error.message ?? error), code: error.code ?? 'local_or_network_error' };
  for (const key of ['status', 'request_id', 'stage', 'retryable']) if (error[key] !== undefined) result[key] = error[key];
  if (result.code === 'grok_media_no_eligible_account') result.hint = 'The gateway could not select a media account. Check this API key group, account scheduling, model allowlist and media eligibility; inspect capability_mismatch logs. A model listing or direct admin account test does not prove key routing works. Do not automatically force eligibility.';
  return result;
}
export function parseArgs(argv, valueNames, flagNames = []) {
  const args = {}; const values = new Set(valueNames); const flags = new Set([...flagNames, 'help']);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] === '-h' ? '--help' : argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (Object.hasOwn(args, name)) throw new Error(`Duplicate option: --${name}`);
    if (flags.has(name)) { args[name] = true; continue; }
    if (!values.has(name)) throw new Error(`Unknown option: --${name}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
    args[name] = argv[++i];
  }
  if (args.output && args.savePath && args.output !== args.savePath) throw new Error('Use --output or --savePath, not both');
  return args;
}
export function integer(value, label, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return n;
}
export function apiRoot(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('base_url must be an http(s) URL without credentials, query or fragment');
  if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname.toLowerCase()) || u.port === '15721') throw new Error('Use a direct provider URL, not loopback or the CC-Switch proxy');
  let path = u.pathname.replace(/\/+$/, '').replace(/\/(?:images\/generations|videos(?:\/generations)?)$/, '');
  if (!path.endsWith('/v1')) path += '/v1';
  u.pathname = path;
  return u.toString().replace(/\/$/, '');
}
export async function config(args) {
  const path = resolve(args.config ?? DEFAULT_CONFIG);
  let data;
  try { data = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (e) { throw new Error(`Cannot read JSON configuration: ${path} (${e.code ?? 'invalid JSON'})`); }
  const key = String(args['api-key'] ?? data.api_key ?? '').trim();
  if (!key || /YOUR_.*KEY/.test(key)) throw new Error('Set api_key in config.local.json');
  secrets.add(key);
  return { key, root: apiRoot(args['base-url'] ?? data.base_url) };
}
export async function promptFrom(args, selfTestPrompt) {
  if (args.prompt && args['prompt-file']) throw new Error('Use --prompt or --prompt-file, not both');
  if (args['self-test'] && (args.prompt || args['prompt-file'] || args.reference)) throw new Error('--self-test cannot be combined with prompt or reference options');
  const prompt = args['self-test'] ? selfTestPrompt : args['prompt-file'] ? await readFile(resolve(args['prompt-file']), 'utf8') : args.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Provide --prompt or --prompt-file');
  return prompt.replace(/^\uFEFF/, '').trim();
}
export async function ensureAbsent(path) {
  try { await stat(path); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw new Error(`File already exists; choose a new output or resume its job: ${path}`);
}
export async function writableParent(path) {
  let parent = dirname(resolve(path));
  while (true) {
    try {
      const info = await stat(parent);
      if (!info.isDirectory()) throw new Error(`Output parent is not a directory: ${parent}`);
      await access(parent, constants.W_OK); return;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const next = dirname(parent); if (next === parent) throw e; parent = next;
    }
  }
}
export async function saveJson(path, value, exclusive = false) {
  await mkdir(dirname(path), { recursive: true });
  const data = JSON.stringify(value, null, 2) + '\n';
  if (exclusive) return writeFile(path, data, { flag: 'wx', mode: 0o600 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, path);
}
export async function saveMedia(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
}
export function remaining(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new ApiError('Operation timed out; resume the saved job instead of submitting again', { code: 'timeout' });
  return ms;
}
export const pause = ms => new Promise(r => setTimeout(r, ms));
export async function request(url, { key, method = 'GET', body, deadline, stage, fetchImpl = fetch } = {}) {
  // Only read-only GETs are retried. Never replay a possibly accepted generation POST.
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { method, redirect: 'manual', headers: {
        Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.min(remaining(deadline), 120000)) });
      const text = await response.text();
      let data; try { data = JSON.parse(text); } catch { throw new ApiError(`Non-JSON response (HTTP ${response.status})`, { status: response.status, code: 'non_json_response', stage, request_id: response.headers.get('x-request-id') }); }
      if (!response.ok) throw new ApiError(data.error?.message ?? data.message ?? `HTTP ${response.status}`, { status: response.status, code: data.error?.type ?? data.error?.code ?? 'http_error', stage, request_id: response.headers.get('x-request-id'), retryable: [429, 500, 502, 503, 504].includes(response.status) });
      return { data, response };
    } catch (e) {
      if (method !== 'GET' || attempt >= 2 || (e.status && ![429, 500, 502, 503, 504].includes(e.status))) throw e;
      await pause(Math.min(500 * 2 ** attempt, remaining(deadline)));
    }
  }
}
export async function download(url, { key, root, deadline, fetchImpl = fetch }) {
  let target = new URL(url, root + '/');
  for (let i = 0; i < 5; i++) {
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid download URL');
    const response = await fetchImpl(target, { redirect: 'manual', headers: { Accept: 'video/mp4,image/*,application/octet-stream', ...(target.origin === new URL(root).origin ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(Math.min(remaining(deadline), 120000)) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Download redirect missing location');
      target = new URL(location, target); continue;
    }
    if (!response.ok) throw new ApiError(`Download failed (HTTP ${response.status})`, { status: response.status, stage: 'download', code: 'download_error' });
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('Too many download redirects');
}
export function imageInfo(b) {
  if (b.length > 32 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.toString('ascii', 12, 16) === 'IHDR' && b.includes(Buffer.from('IEND'))) {
    return { format: 'png', mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217) {
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i++] !== 255) break;
      while (b[i] === 255) i++;
      const marker = b[i++]; if (marker === 0xda || marker === 0xd9) break;
      const len = b.readUInt16BE(i);
      if (len < 2 || i + len > b.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && len >= 8) return { format: 'jpeg', mime: 'image/jpeg', width: b.readUInt16BE(i + 5), height: b.readUInt16BE(i + 3) };
      i += len;
    }
  }
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' && b.readUInt32LE(4) + 8 <= b.length) {
    const type = b.toString('ascii', 12, 16);
    if (type === 'VP8X') return { format: 'webp', mime: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (type === 'VP8 ' && b.subarray(23, 26).equals(Buffer.from([0x9d, 1, 0x2a]))) return { format: 'webp', mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (type === 'VP8L' && b[20] === 0x2f) { const n = b.readUInt32LE(21); return { format: 'webp', mime: 'image/webp', width: (n & 0x3fff) + 1, height: ((n >>> 14) & 0x3fff) + 1 }; }
  }
  throw new Error('File is not a supported PNG, JPEG or WebP image');
}
export async function referenceImage(path) {
  const bytes = await readFile(resolve(path));
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Reference image exceeds the local 20 MiB upload limit; resize it first');
  const info = imageInfo(bytes);
  if (info.width < 8 || info.height < 8) throw new Error('Reference image must be at least 8 pixels per side');
  return { image: { url: `data:${info.mime};base64,${bytes.toString('base64')}` }, summary: { ...info, bytes: bytes.length, sha256: sha256(bytes) } };
}
function boxes(b, start = 0, end = b.length) {
  const result = [];
  for (let p = start; p < end;) {
    if (p + 8 > end) throw new Error('Truncated MP4 box');
    let size = b.readUInt32BE(p); const type = b.toString('ascii', p + 4, p + 8); let header = 8;
    if (size === 1) { if (p + 16 > end) throw new Error('Truncated MP4 box'); size = Number(b.readBigUInt64BE(p + 8)); header = 16; }
    if (size === 0) size = end - p;
    if (!Number.isSafeInteger(size) || size < header || p + size > end) throw new Error('Invalid MP4 box length');
    result.push({ type, start: p + header, end: p + size }); p += size;
  }
  return result;
}
export function videoInfo(b) {
  const top = boxes(b); const moov = top.find(x => x.type === 'moov');
  if (!moov || !top.some(x => x.type === 'ftyp') || !top.some(x => x.type === 'mdat' && x.end > x.start)) throw new Error('Response is not a complete MP4 (ftyp/moov/mdat required)');
  const children = boxes(b, moov.start, moov.end); const mvhd = children.find(x => x.type === 'mvhd');
  let duration_seconds = null; let width = null; let height = null; let video_tracks = 0; let audio_tracks = 0;
  if (mvhd) {
    const p = mvhd.start; const v1 = b[p] === 1;
    if (mvhd.end - p < (v1 ? 32 : 20)) throw new Error('Truncated MP4 movie header');
    const scale = b.readUInt32BE(p + (v1 ? 20 : 12));
    const ticks = v1 ? Number(b.readBigUInt64BE(p + 24)) : b.readUInt32BE(p + 16);
    if (scale) duration_seconds = ticks / scale;
  }
  for (const track of children.filter(x => x.type === 'trak')) {
    const tc = boxes(b, track.start, track.end); const mdia = tc.find(x => x.type === 'mdia');
    const hdlr = mdia && boxes(b, mdia.start, mdia.end).find(x => x.type === 'hdlr');
    if (!hdlr || hdlr.end - hdlr.start < 12) continue;
    const handler = b.toString('ascii', hdlr.start + 8, hdlr.start + 12);
    if (handler === 'soun') audio_tracks++;
    if (handler === 'vide') {
      video_tracks++; const tkhd = tc.find(x => x.type === 'tkhd');
      if (tkhd && tkhd.end - tkhd.start >= 84) { width = b.readUInt32BE(tkhd.end - 8) / 65536; height = b.readUInt32BE(tkhd.end - 4) / 65536; }
    }
  }
  if (!video_tracks || !width || !height || !duration_seconds || !Number.isFinite(duration_seconds)) throw new Error('MP4 has no valid video track, dimensions or duration');
  return { format: 'mp4', mime: 'video/mp4', width, height, duration_seconds, video_tracks, audio_tracks, has_audio: audio_tracks > 0, validation: 'container metadata only; speech, lip sync and scene timing require review' };
}
export function extensionWarning(path, info) {
  const ext = extname(path).toLowerCase(); const expected = info.format === 'jpeg' ? ['.jpg', '.jpeg'] : ['.' + info.format];
  return expected.includes(ext) ? [] : [`Actual format is ${info.format}; output extension is ${ext || '(none)'}`];
}
