#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "grok-imagine-image";
const SELF_TEST_PROMPT = "simple dashboard ui";
const SELF_TEST_OUTPUT = "./test-grok.png";
const DEFAULT_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.local.json");

function printUsage() {
  console.error(`Usage:
  node scripts/generate-image.mjs --prompt <text> --output <path>
  node scripts/generate-image.mjs --prompt <text> --savePath <path>
  node scripts/generate-image.mjs --self-test

Options:
  --api-key <key>       Override api_key from config.local.json
  --base-url <url>      Override base_url from config.local.json
  --config <path>       Use another JSON config file
  --self-test           Use prompt "simple dashboard ui" and output ./test-grok.png`);
}

function parseArgs(argv) {
  const args = {};
  const valueOptions = new Set(["prompt", "output", "savePath", "api-key", "base-url", "config"]);

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

function resolveEndpoint(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
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

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith("/images/generations")) {
    parsed.pathname = pathname.endsWith("/v1")
      ? `${pathname}/images/generations`
      : `${pathname}/v1/images/generations`;
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function decodeDataUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^data:([^;,]+)?;base64,(.+)$/s);
  return match ? Buffer.from(match[2], "base64") : null;
}

async function readImage(responseBody) {
  const image = responseBody?.data?.[0];
  if (!image) {
    throw new Error("The API response did not contain data[0]");
  }
  if (typeof image.b64_json === "string" && image.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }

  const dataUrl = decodeDataUrl(image.url);
  if (dataUrl) {
    return dataUrl;
  }
  if (typeof image.url === "string" && image.url) {
    const imageUrl = new URL(image.url);
    if (!["http:", "https:"].includes(imageUrl.protocol)) {
      throw new Error("The returned image URL must use http or https");
    }
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(120_000) });
    if (!imageResponse.ok) {
      throw new Error(`Image download failed with HTTP ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("The image response did not contain b64_json or url");
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

async function generateImage({ apiKey, baseUrl, prompt, output }) {
  const endpoint = resolveEndpoint(baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    throw new Error(`API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) {
    const message = responseBody?.error?.message || responseBody?.message || `HTTP ${response.status}`;
    throw new Error(`Image generation failed: ${message}`);
  }

  const imageBytes = await readImage(responseBody);
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, imageBytes);
  return { endpoint, output: outputPath, bytes: imageBytes.length, model: MODEL, status: response.status };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const configPath = resolve(args.config || DEFAULT_CONFIG_PATH);
    const config = await loadConfig(configPath);
    const apiKey = requireValue(args["api-key"] || config.api_key, "api_key");
    const baseUrl = requireValue(args["base-url"] || config.base_url, "base_url");
    const prompt = args.selfTest ? SELF_TEST_PROMPT : requireValue(args.prompt, "--prompt");
    const output = args.selfTest
      ? SELF_TEST_OUTPUT
      : requireValue(args.output || args.savePath, "--output or --savePath");
    const result = await generateImage({ apiKey, baseUrl, prompt, output });
    console.log(JSON.stringify({ success: true, prompt, ...result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    printUsage();
    process.exitCode = 1;
  }
}

await main();
