# Grok gateway troubleshooting

## Preserve the evidence

Errors contain HTTP status, provider error type, request ID when supplied, and the operation stage. Copy only sanitized error fields. Never share API keys, image data URLs, signed download URLs, local job files or account dumps. Do not repeatedly retry generation to diagnose a routing failure.

## 503: No eligible Grok media accounts

This means the gateway could not select a qualifying media account for this API key. It does not by itself prove the upstream is down, the prompt was rejected, or the skill parameters are invalid.

1. Verify the configured provider and API key, then use `diagnose.mjs` for a read-only model-list check. A 200 here only confirms that lookup.
2. Check the key's group against the intended Grok account, scheduling status, group image-generation setting and model allowlists.
3. Find the matching request ID in platform operations logs. `grok_media.account_select_failed` can include `capability_mismatch`; `grok_media.account_eligibility_rejected` can include billing or account-qualification reasons. Use the actual log reason, not a guessed fix.
4. The administrator's direct account test may bypass API-key group scheduling. Direct test success and API-key failure can coexist.
5. If a known paid account successfully generates in a direct test but automatic billing observations exclude it, an administrator can consider the account's `媒体生成资格 → 强制启用` override. Verify upstream capability first, keep the change scoped to that account, and follow the user's authorization. Do not enable it universally, change unrelated groups, disable moderation, or treat it as a credential repair.
6. Verify the fix with one minimal authorized generation through the same API key. Preserve the prior setting so it can be restored if ineffective.

Observed example (2026-10-21, Sub2API v0.2.17): account UI showed SuperGrok Heavy and `可用 · Billing 信息不明确`, but request logs reported `pool=1, filtered: capability_mismatch=1`. Re-saving the automatic setting did not help. After an authorized per-account eligibility override, the unchanged image model returned 200 and reference-video generation completed. This establishes an operational workaround for that case, not a universal root cause or an upstream entitlement guarantee. Do not embed that deployment's host, credentials, personal account details or task IDs in shared packages.

## Other failures

- 401/403: distinguish gateway key authentication, group policy and upstream entitlement from the stage/error body. Model discovery does not validate every permission.
- 400/422: inspect supported fields, duration and reference MIME type. Do not add undocumented parameters through trial-and-error paid jobs.
- 404/model_not_found: check route and model allowlists. `/v1/videos` and `/v1/videos/generations` are aliases on the tested gateway; external providers may differ.
- 429: obey quota/limit information. Do not automatically resubmit generation.
- Timeout/network loss after POST: acceptance is uncertain. Use the saved job ID to resume. Without an ID, inspect provider history first.
- Download failure: resume the existing job. Do not generate a replacement just to retry downloading.
- HTML/JSON instead of media: the file inspector rejects it before saving as an image/video. Inspect the response stage and provider status.
- Correct file with incorrect scenes or dialogue: transport succeeded, creative execution did not fully match. Report the limitation and revise only what the user requests; do not claim a prompt is evidence of the delivered content.
