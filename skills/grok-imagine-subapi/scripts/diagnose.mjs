#!/usr/bin/env node
import { parseArgs, config, request, errorResult } from './lib.mjs';
try {
  const args = parseArgs(process.argv.slice(2), ['config', 'base-url', 'api-key']);
  if (args.help) console.log('node scripts/diagnose.mjs [--config PATH]\nReads /v1/models only; never generates media or changes server configuration.');
  else {
    const cfg = await config(args);
    const { data } = await request(`${cfg.root}/models`, { key: cfg.key, deadline: Date.now() + 30000, stage: 'models' });
    const models = Array.isArray(data.data) ? data.data.map(x => x.id).filter(x => typeof x === 'string' && x.startsWith('grok-imagine')) : [];
    console.log(JSON.stringify({ success: true, endpoint: `${cfg.root}/models`, models, note: 'Model visibility confirms this lookup only; it does not verify media account routing, quota, or generation.' }, null, 2));
  }
} catch (error) { console.error(JSON.stringify(errorResult(error), null, 2)); process.exitCode = 1; }
