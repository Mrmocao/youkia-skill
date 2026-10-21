#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION, parseArgs, config, promptFrom, integer, ensureAbsent, writableParent, request, download, saveMedia, imageInfo, extensionWarning, errorResult } from './lib.mjs';
export async function generate(args, deps = {}) {
  const cfg = await config(args);
  const prompt = await promptFrom(args, 'simple dashboard ui');
  const output = args.output ?? args.savePath ?? (args['self-test'] ? './test-grok.png' : null);
  if (!output) throw new Error('Provide --output');
  const path = resolve(output); await ensureAbsent(path); await writableParent(path);
  const endpoint = `${cfg.root}/images/generations`;
  const timeout = integer(args.timeout, '--timeout', 120000, 1, 3600000);
  if (args['dry-run']) return { success: true, dry_run: true, model: 'grok-imagine-image', endpoint, output: path, network_requests: 0 };
  const deadline = Date.now() + timeout;
  const { data } = await request(endpoint, { key: cfg.key, method: 'POST', body: { model: 'grok-imagine-image', prompt, n: 1, response_format: 'b64_json' }, deadline, stage: 'create', fetchImpl: deps.fetchImpl });
  const item = data.data?.[0];
  if (!item) throw new Error('Response contains no data[0] image');
  let bytes;
  if (item.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
  else if (typeof item.url === 'string' && /^data:image\/[\w.+-]+;base64,/.test(item.url)) bytes = Buffer.from(item.url.slice(item.url.indexOf(',') + 1), 'base64');
  else if (item.url) bytes = await download(item.url, { ...cfg, deadline, fetchImpl: deps.fetchImpl });
  else throw new Error('Response contains no image bytes or URL');
  const media = imageInfo(bytes); await saveMedia(path, bytes);
  return { success: true, model: 'grok-imagine-image', endpoint, output: path, bytes: bytes.length, media, warnings: extensionWarning(path, media) };
}
export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv, ['prompt', 'prompt-file', 'output', 'savePath', 'api-key', 'base-url', 'config', 'timeout'], ['self-test', 'dry-run']);
    if (args.help) return console.log(`Grok image generator ${VERSION}\nnode scripts/generate-image.mjs --prompt TEXT --output image.jpg\nOptions: --prompt-file PATH, --savePath PATH, --config PATH, --api-key KEY, --base-url URL, --timeout MS, --dry-run (offline), --self-test (paid), --help.\nOnly text-to-image is supported. Existing files are not overwritten.`);
    console.log(JSON.stringify(await generate(args), null, 2));
  } catch (error) { console.error(JSON.stringify(errorResult(error), null, 2)); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
