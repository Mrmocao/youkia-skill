#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION, parseArgs, integer, config, promptFrom, referenceImage, sha256, ensureAbsent, writableParent, saveJson, saveMedia, request, download, remaining, pause, videoInfo, extensionWarning, errorResult, ApiError } from './lib.mjs';

export const MODEL = 'grok-imagine-video';
const HELP = `Grok video generator ${VERSION}
node scripts/generate-video.mjs --prompt TEXT --output video.mp4 [--reference image.png] [--duration 1..15]
node scripts/generate-video.mjs --prompt-file prompt.txt --reference image.jpg --output video.mp4
node scripts/generate-video.mjs --resume video.mp4.job.json [--output recovered.mp4]
Options: --config PATH, --base-url URL, --api-key KEY, --savePath PATH (output alias),
  --job-file PATH, --poll-interval MS (5000), --timeout MS (600000, total per run),
  --dry-run (offline), --self-test (paid 5-second kitten video), --help.
Creates a local job file BEFORE submitting; resume never submits a new generation.
Existing output files and new-job paths are not overwritten. Config defaults to the skill directory.`;

export function videoState(data) {
  const item = data.video ?? data.data?.video ?? data.data ?? data;
  const state = String(data.status ?? data.state ?? item.status ?? item.state ?? '').toLowerCase();
  const url = item.url ?? item.video_url ?? data.video_url ?? data.content_url ?? data.download_url;
  const base64 = item.b64_json ?? data.b64_json ?? data.video_base64;
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected', 'expired'].includes(state)) return { state, failed: true };
  if (['queued', 'pending', 'processing', 'in_progress', 'in-progress', 'generating', 'running'].includes(state)) return { state, complete: false };
  const complete = ['done', 'completed', 'complete', 'succeeded', 'success'].includes(state) || (!state && Boolean(url || base64));
  return { state, complete, url, base64 };
}
export async function generate(args, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cfg = await config(args);
  const timeout = integer(args.timeout, '--timeout', 600000, 1, 3600000);
  const interval = integer(args['poll-interval'], '--poll-interval', 5000, 1, 60000);
  const deadline = Date.now() + timeout;
  let job, jobPath, prompt, reference;
  if (args.resume) {
    if (['prompt', 'prompt-file', 'reference', 'duration', 'self-test', 'job-file'].some(k => args[k] !== undefined)) throw new Error('--resume cannot be combined with generation options');
    jobPath = resolve(args.resume);
    job = JSON.parse(await readFile(jobPath, 'utf8'));
    if (job.version !== 1 || job.model !== MODEL || !job.output || !job.request_id) throw new Error('Job has no resumable request ID. If submission was interrupted, check provider task history; do not blindly resubmit.');
    if (job.api_root !== cfg.root) throw new Error('Resume config base_url differs from the saved job; use the original provider config');
    job.output = resolve(args.output ?? args.savePath ?? job.output);
    if (job.state === 'completed' && job.media && !args.output && !args.savePath) {
      const bytes = await readFile(job.output);
      if (sha256(bytes) !== job.sha256) throw new Error('Completed output changed; resume with --output pointing to a new file to recover it');
      return { success: true, resumed: true, already_downloaded: true, output: job.output, media: videoInfo(bytes), request_id: job.request_id };
    }
  } else {
    prompt = await promptFrom(args, 'A cute kitten fishing beside a quiet pond, natural motion, no text.');
    const duration = integer(args.duration, '--duration', 5, 1, 15);
    if (args.reference) reference = await referenceImage(args.reference);
    const output = args.output ?? args.savePath ?? (args['self-test'] ? './test-grok-video.mp4' : null);
    if (!output) throw new Error('Provide --output');
    jobPath = resolve(args['job-file'] ?? `${output}.job.json`);
    job = { version: 1, client_version: VERSION, model: MODEL, api_root: cfg.root, output: resolve(output), duration, prompt_sha256: sha256(prompt), reference: reference?.summary ?? null, created_at: new Date().toISOString(), state: 'prepared', request_id: null };
  }
  if (jobPath === job.output) throw new Error('Job file and output must be different paths');
  await ensureAbsent(job.output);
  await writableParent(job.output); await writableParent(jobPath);
  if (!args.resume) await ensureAbsent(jobPath);
  if (args['dry-run']) return { success: true, dry_run: true, endpoint: `${cfg.root}/videos/generations`, output: job.output, job_file: jobPath, model: MODEL, duration: job.duration, reference: job.reference, resume: Boolean(args.resume), network_requests: 0 };
  if (!args.resume) await saveJson(jobPath, job, true);
  const emit = deps.emit ?? (event => console.error(JSON.stringify(event)));
  try {
    if (!args.resume) {
      job.state = 'submitting'; await saveJson(jobPath, job);
      const { data } = await request(`${cfg.root}/videos/generations`, { key: cfg.key, method: 'POST', body: { model: MODEL, prompt, duration: job.duration, ...(reference ? { image: reference.image } : {}) }, deadline, stage: 'create', fetchImpl });
      const id = data.request_id ?? data.id ?? data.video?.id ?? data.data?.request_id ?? data.data?.id;
      if (typeof id !== 'string' || !id) throw new Error('Create response has no request ID; check provider history before submitting again');
      job.request_id = id; job.state = 'submitted'; await saveJson(jobPath, job);
      emit({ event: 'video_created', request_id: id, job_file: jobPath });
    }
    let result;
    while (true) {
      const { data } = await request(`${cfg.root}/videos/${encodeURIComponent(job.request_id)}`, { key: cfg.key, deadline, stage: 'poll', fetchImpl });
      result = videoState(data);
      if (result.failed) throw new ApiError(data.error?.message ?? `Video ended with status: ${result.state}`, { code: 'video_failed', stage: 'poll' });
      if (job.provider_state !== result.state) {
        job.provider_state = result.state; await saveJson(jobPath, job);
        emit({ event: 'video_status', request_id: job.request_id, state: result.state || 'unknown' });
      }
      if (result.complete) break;
      await pause(Math.min(interval, remaining(deadline)));
    }
    job.state = 'downloading'; await saveJson(jobPath, job);
    let bytes;
    if (result.base64) bytes = Buffer.from(result.base64, 'base64');
    else if (typeof result.url === 'string' && result.url.startsWith('data:video/mp4;base64,')) bytes = Buffer.from(result.url.slice('data:video/mp4;base64,'.length), 'base64');
    else bytes = await download(result.url ?? `${cfg.root}/videos/${encodeURIComponent(job.request_id)}/content`, { ...cfg, deadline, fetchImpl });
    const media = videoInfo(bytes);
    await saveMedia(job.output, bytes);
    job.state = 'completed'; job.media = media; job.sha256 = sha256(bytes); job.completed_at = new Date().toISOString(); delete job.last_error;
    await saveJson(jobPath, job);
    const warnings = extensionWarning(job.output, media);
    if (Math.abs(media.duration_seconds - job.duration) > 0.6) warnings.push(`Requested ${job.duration}s but received ${media.duration_seconds}s`);
    return { success: true, model: MODEL, output: job.output, job_file: jobPath, request_id: job.request_id, bytes: bytes.length, requested_duration: job.duration, media, warnings };
  } catch (e) {
    job.state = job.request_id ? 'resumable' : 'submission_unconfirmed'; job.last_error = errorResult(e);
    try { await saveJson(jobPath, job); } catch { /* Preserve the original failure. */ }
    e.job_file = jobPath; e.video_request_id = job.request_id; throw e;
  }
}
export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv, ['prompt', 'prompt-file', 'reference', 'output', 'savePath', 'api-key', 'base-url', 'config', 'duration', 'poll-interval', 'timeout', 'job-file', 'resume'], ['self-test', 'dry-run']);
    if (args.help) return console.log(HELP);
    console.log(JSON.stringify(await generate(args), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ...errorResult(error), ...(error.job_file ? { job_file: error.job_file, video_request_id: error.video_request_id, hint_resume: error.video_request_id ? 'Run --resume with this job file; do not create another job.' : 'Check provider history before retrying generation.' } : {}) }, null, 2));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
