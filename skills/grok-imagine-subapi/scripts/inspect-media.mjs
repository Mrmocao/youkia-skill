#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, videoInfo, imageInfo, errorResult } from './lib.mjs';
try {
  const args = parseArgs(process.argv.slice(2), ['input']);
  if (args.help) console.log('node scripts/inspect-media.mjs --input PATH\nOffline image headers / MP4 container inspection. Does not verify speech, lip sync or visual correctness.');
  else {
    if (!args.input) throw new Error('Provide --input');
    const path = resolve(args.input); const bytes = await readFile(path);
    let media; try { media = imageInfo(bytes); } catch { media = videoInfo(bytes); }
    console.log(JSON.stringify({ success: true, input: path, bytes: bytes.length, media }, null, 2));
  }
} catch (error) { console.error(JSON.stringify(errorResult(error), null, 2)); process.exitCode = 1; }
