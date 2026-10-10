#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "grok-imagine-video";
const SELF_TEST_PROMPT =
  "5-second video of a cute kitten sitting beside a quiet pond and gently fishing with a tiny rod, natural motion, stable camera, no text, no watermark";
const SELF_TEST_OUTPUT = "./test-grok-video.mp4";
const DEFAULT_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.local.json");
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_DURATION_SECONDS = 5;
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 15;

function printUsage() {
  console.error(`Usage:
  node scripts/generate-video.mjs --prompt <text> --output <path>
  node scripts/generate-video.mjs --prompt <text> --savePath <path>
  node scripts/generate-video.mjs --self-test

Options:
  --api-key <key>           Override api_key from config.local.json
  --base-url <url>          Override base_url from config.local.json
  --config <path>           Use another JSON config file
  --duration <seconds>      Video duration from 1 to 15 (default: 5)
  --poll-interval <ms>      Delay between status requests (default: 5000)
  --timeout <ms>            Overall generation timeout (default: 600000)
  --self-test               Generate a 5-second kitten fishing video`);
}

function parseArgs(argv) {
  const args = {};
  const valueOptions = new Set([
    "prompt",
    "output",
    "savePath",
    "api-key",
    "base-url",
    "config",
    "duration",
    "poll-interval",
    "timeout",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--self-test") {
      args.selfTest = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
    if (!token.startsWith("--") || !valueOptions.has(token.slice(2))) {
      throw new Error(`Unknown argument: ${token}`);
    }

    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    args[name] = value;
    index += 1;
  }

  if (args.output && args.savePath && args.output !== args.savePath) {
    throw new Error("Use either --output or --savePath, not both");
  }
  return args;
}

function requireValue(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function positiveInteger(value, label, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function durationSeconds(value) {
  const duration = positiveInteger(value, "--duration", DEFAULT_DURATION_SECONDS);
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new Error(`--duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds`);
  }
  return duration;
}

function parseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("base_url must be a valid http(s) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("base_url must use http or https");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || parsed.port === "15721") {
    throw new Error("Loopback and CC-Switch proxy URLs are not allowed");
  }
  return parsed;
}

function resolveVideoEndpoint(baseUrl) {
  const parsed = parseUrl(baseUrl);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const videoPath = "/videos";

  if (pathname.endsWith("/v1/videos") || pathname.endsWith(videoPath)) {
    parsed.pathname = pathname;
  } else if (pathname.endsWith("/images/generations")) {
    parsed.pathname = `${pathname.slice(0, -"/images/generations".length)}${videoPath}`;
  } else if (pathname.endsWith("/v1")) {
    parsed.pathname = `${pathname}${videoPath}`;
  } else {
    parsed.pathname = `${pathname}/v1${videoPath}`;
  }

  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function endpointChild(endpoint, child) {
  return `${endpoint}/${encodeURIComponent(child)}`;
}

function authHeaders(apiKey, accept) {
  return {
    Accept: accept,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function truncate(value, maxLength = 600) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeErrorText(value) {
  return truncate(String(value).replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
}

function errorMessage(body, fallback) {
  if (body && typeof body === "object") {
    const candidate = body.error?.message || body.message || body.detail;
    if (candidate) {
      return safeErrorText(candidate);
    }
  }
  return fallback;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`${label} failed: HTTP ${response.status}: ${safeErrorText(text || "non-JSON response")}`);
    }
    throw new Error(`${label} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status}: ${errorMessage(body, `HTTP ${response.status}`)}`);
  }
  return body;
}

function findValue(value, keys, depth = 0) {
  if (value === null || value === undefined || depth > 5) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, keys, depth + 1);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if ((typeof candidate === "string" && candidate) || typeof candidate === "number") {
      return String(candidate);
    }
  }
  for (const child of Object.values(value)) {
    const found = findValue(child, keys, depth + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function requestIdFromResponse(body, response) {
  const id = findValue(body, ["request_id", "requestId", "video_id", "videoId", "id"]);
  if (id) {
    return id;
  }
  const location = response.headers.get("location");
  if (location) {
    const lastSegment = new URL(location).pathname.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      return decodeURIComponent(lastSegment);
    }
  }
  return null;
}

function statusFromResponse(body) {
  return (findValue(body, ["status", "state"]) || "").toLowerCase();
}

function isFailureStatus(status) {
  return ["failed", "failure", "error", "cancelled", "canceled", "rejected"].includes(status);
}

function isPendingStatus(status) {
  return ["queued", "pending", "processing", "in_progress", "in-progress", "generating", "running"].includes(status);
}

function dataUrlBytes(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^data:[^;,]+;base64,(.+)$/s);
  return match ? Buffer.from(match[1], "base64") : null;
}

function base64FromBody(body) {
  const encoded = findValue(body, ["b64_json", "b64Json", "video_base64", "videoBase64", "base64"]);
  return encoded ? Buffer.from(encoded, "base64") : null;
}

function urlFromBody(body) {
  return findValue(body, ["content_url", "contentUrl", "video_url", "videoUrl", "download_url", "downloadUrl", "url"]);
}

async function startVideo({ endpoint, apiKey, prompt, duration }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey, "application/json"),
    body: JSON.stringify({ model: MODEL, prompt, duration }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const body = await readJsonResponse(response, "Video generation");
  const requestId = requestIdFromResponse(body, response);
  if (!requestId) {
    throw new Error("Video generation response did not contain a request ID");
  }
  return { body, requestId, status: response.status };
}

async function pollVideo({ endpoint, apiKey, requestId, pollInterval, timeout }) {
  const statusEndpoint = endpointChild(endpoint, requestId);
  const contentEndpoint = endpointChild(statusEndpoint, "content");
  const deadline = Date.now() + timeout;
  let lastStatus = "";

  while (Date.now() <= deadline) {
    const response = await fetch(statusEndpoint, {
      method: "GET",
      headers: authHeaders(apiKey, "application/json"),
      signal: AbortSignal.timeout(Math.min(timeout, 120_000)),
    });
    const body = await readJsonResponse(response, "Video status request");
    const status = statusFromResponse(body);
    lastStatus = status || lastStatus;

    if (isFailureStatus(status)) {
      throw new Error(`Video generation failed: ${errorMessage(body, status)}`);
    }

    const bytes = base64FromBody(body);
    const url = urlFromBody(body);
    const complete = response.status === 200 && !isPendingStatus(status);
    if (bytes || url || complete) {
      return { body, status: response.status, state: status, bytes, url, contentEndpoint };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(pollInterval, remaining)));
  }

  throw new Error(`Video generation timed out${lastStatus ? ` (status: ${lastStatus})` : ""}`);
}

async function downloadUrl(url, apiKey, apiOrigin, depth = 0) {
  if (depth > 2) {
    throw new Error("Video content URL nesting is too deep");
  }
  const dataBytes = dataUrlBytes(url);
  if (dataBytes) {
    return dataBytes;
  }

  let parsed;
  try {
    parsed = new URL(url, apiOrigin);
  } catch {
    throw new Error("The returned video URL is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("The returned video URL must use http or https");
  }

  const headers = { Accept: "video/mp4,application/json" };
  if (parsed.origin === apiOrigin) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(parsed, { headers, signal: AbortSignal.timeout(120_000) });
  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`Video download failed: HTTP ${response.status}`);
  }
  if (contentType.includes("json") || bytes.toString("utf8", 0, 1) === "{") {
    let body;
    try {
      body = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Video content response was not valid JSON");
    }
    const nestedBytes = base64FromBody(body);
    if (nestedBytes) {
      return nestedBytes;
    }
    const nestedUrl = urlFromBody(body);
    if (nestedUrl) {
      return downloadUrl(nestedUrl, apiKey, apiOrigin, depth + 1);
    }
    throw new Error("Video content response did not contain video bytes or a URL");
  }
  return bytes;
}

async function loadConfig(configPath) {
  let configText;
  try {
    configText = await readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw new Error(`Unable to read config file: ${configPath}`);
  }

  try {
    return JSON.parse(configText);
  } catch {
    throw new Error(`Config file is not valid JSON: ${configPath}`);
  }
}

async function generateVideo({ apiKey, baseUrl, prompt, output, duration, pollInterval, timeout }) {
  const endpoint = resolveVideoEndpoint(baseUrl);
  const started = await startVideo({ endpoint, apiKey, prompt, duration });
  const completed = await pollVideo({
    endpoint,
    apiKey,
    requestId: started.requestId,
    pollInterval,
    timeout,
  });
  const bytes = completed.bytes || (completed.url
    ? await downloadUrl(completed.url, apiKey, new URL(endpoint).origin)
    : await downloadUrl(completed.contentEndpoint, apiKey, new URL(endpoint).origin));

  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return {
    endpoint,
    request_id: started.requestId,
    output: outputPath,
    bytes: bytes.length,
    model: MODEL,
    duration,
    status: completed.status,
    state: completed.state || undefined,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const configPath = resolve(args.config || DEFAULT_CONFIG_PATH);
    const config = await loadConfig(configPath);
    const apiKey = requireValue(args["api-key"] || config.api_key, "api_key");
    const baseUrl = requireValue(args["base-url"] || config.base_url, "base_url");
    const prompt = args.selfTest
      ? SELF_TEST_PROMPT
      : requireValue(args.prompt, "--prompt");
    const output = args.selfTest
      ? SELF_TEST_OUTPUT
      : requireValue(args.output || args.savePath, "--output or --savePath");
    const pollInterval = positiveInteger(args["poll-interval"], "--poll-interval", DEFAULT_POLL_INTERVAL_MS);
    const timeout = positiveInteger(args.timeout, "--timeout", DEFAULT_TIMEOUT_MS);
    const duration = durationSeconds(args.duration);
    const result = await generateVideo({ apiKey, baseUrl, prompt, output, duration, pollInterval, timeout });
    console.log(JSON.stringify({ success: true, prompt, ...result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    printUsage();
    process.exitCode = 1;
  }
}

await main();
