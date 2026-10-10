import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseArgs } from "./args.js";
import { buildRequest } from "./cli.js";
import { loadLocalConfig, maskApiKey } from "./env.js";
import { buildImagesPayload, buildResponsesPayload } from "./payload.js";
import { emptyImageResponse, parseSSEText, SSEImageParser } from "./sse.js";
import { iterB64Images, iterPartialB64Images, responseSummary } from "./save.js";

test("parseArgs defaults to 4K images streaming", () => {
  const options = parseArgs(["draw a sword immortal"]);
  assert.equal(options.prompt, "draw a sword immortal");
  assert.equal(options.endpoint, "images");
  assert.equal(options.size, "3840x2160");
  assert.equal(options.quality, "high");
  assert.equal(options.stream, true);
  assert.equal(options.partialImages, 1);
});

test("buildImagesPayload includes stream and partial image controls", () => {
  const options = parseArgs(["draw a cat", "--size", "2160x3840", "--partial-images", "2"]);
  const payload = buildImagesPayload(options);
  assert.equal(payload.model, "gpt-image-2");
  assert.equal(payload.size, "2160x3840");
  assert.equal(payload.stream, true);
  assert.equal(payload.partial_images, 2);
  assert.equal(payload.response_format, "b64_json");
});

test("buildResponsesPayload includes image_generation tool and input image", () => {
  const options = parseArgs([
    "edit this",
    "--endpoint",
    "responses",
    "--input-image",
    "https://example.com/input.png",
  ]);
  const payload = buildResponsesPayload(options);
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.deepEqual(payload.tool_choice, { type: "image_generation" });
  const tools = payload.tools as Array<Record<string, unknown>>;
  assert.equal(tools[0].type, "image_generation");
  const input = payload.input as Array<{ content: Array<Record<string, string>> }>;
  assert.equal(input[0].content[1].type, "input_image");
  assert.equal(input[0].content[1].image_url, "https://example.com/input.png");
});

test("buildRequest selects images or responses URL", () => {
  const imageReq = buildRequest(parseArgs(["x", "--base-url", "https://your-sub2api.example.com/"]));
  assert.equal(imageReq.url, "https://your-sub2api.example.com/v1/images/generations");

  const responsesReq = buildRequest(parseArgs(["x", "--endpoint", "responses", "--base-url", "https://your-sub2api.example.com/"]));
  assert.equal(responsesReq.url, "https://your-sub2api.example.com/v1/responses");
});

test("parseSSEText extracts final images API event", () => {
  const b64 = Buffer.from("final image").toString("base64");
  const response = parseSSEText(
    `event: image_generation.completed\n` +
      `data: {"type":"image_generation.completed","b64_json":"${b64}"}\n\n` +
      `data: [DONE]\n\n`,
  );
  assert.deepEqual([...iterB64Images(response)], [b64]);
});

test("parseSSEText extracts responses output item event", () => {
  const b64 = Buffer.from("responses image").toString("base64");
  const response = parseSSEText(
    `data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"${b64}"}}\n\n`,
  );
  assert.deepEqual([...iterB64Images(response)], [b64]);
});

test("SSEImageParser preserves events across chunks", () => {
  const b64 = Buffer.from("partial").toString("base64");
  const response = emptyImageResponse();
  const parser = new SSEImageParser(response);
  parser.processLine("event: image_generation.partial_image");
  parser.processLine(`data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"${b64}"}`);
  parser.processLine("");
  assert.deepEqual([...iterPartialB64Images(response)], [b64]);
});

test("responseSummary reports final and partial counts", () => {
  const finalB64 = Buffer.from("final").toString("base64");
  const partialB64 = Buffer.from("partial").toString("base64");
  const summary = responseSummary({
    data: [{ b64_json: finalB64 }],
    partial_data: [{ b64_json: partialB64 }],
    output: [],
    _stream_incomplete: true,
    _stream_error: "closed",
  });
  assert.equal(summary.final_images, 1);
  assert.equal(summary.partial_images, 1);
  assert.equal(summary.stream_incomplete, true);
  assert.equal(summary.stream_error, "closed");
});

test("maskApiKey hides full secret", () => {
  assert.equal(maskApiKey("sk-1234567890abcdef"), "sk-123...cdef");
  assert.equal(maskApiKey("short"), "***");
});

test("loadLocalConfig reads redacted-compatible local settings without overwriting env", () => {
  const previousKey = process.env.SUB2API_API_KEY;
  const previousBase = process.env.SUB2API_BASE_URL;
  delete process.env.SUB2API_API_KEY;
  delete process.env.SUB2API_BASE_URL;
  const configPath = fileURLToPath(new URL("../config.example.json", import.meta.url));
  loadLocalConfig(configPath);
  assert.equal(process.env.SUB2API_API_KEY, "YOUR_SUB2API_API_KEY");
  assert.equal(process.env.SUB2API_BASE_URL, "https://your-sub2api.example.com");
  if (previousKey === undefined) delete process.env.SUB2API_API_KEY;
  else process.env.SUB2API_API_KEY = previousKey;
  if (previousBase === undefined) delete process.env.SUB2API_BASE_URL;
  else process.env.SUB2API_BASE_URL = previousBase;
});
