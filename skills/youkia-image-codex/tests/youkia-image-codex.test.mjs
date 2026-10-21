import assert from "node:assert/strict";
import test from "node:test";
import { endpointUrl, parseOptions } from "../dist/options.js";
import { buildPayload } from "../dist/payload.js";
import { collect, SSEParser } from "../dist/protocol.js";

test("normalizes root and /v1 base URLs exactly once", () => {
  assert.equal(endpointUrl("https://example.test", "images"), "https://example.test/v1/images/generations");
  assert.equal(endpointUrl("https://example.test/v1/", "responses"), "https://example.test/v1/responses");
});

test("dry-run options use image defaults without exposing credentials", () => {
  const options = parseOptions(["a cat", "--base-url", "https://example.test/v1", "--api-key", "secret"]);
  assert.equal(options.imageModel, "gpt-image-2.5-flare");
  assert.equal(options.size, "3840x2160");
  assert.equal(options.stream, true);
  assert.equal(buildPayload(options).response_format, "b64_json");
});

test("SSE parser keeps final image and does not confuse partial image with final", () => {
  const parser = new SSEParser();
  parser.push('event: image_generation.partial_image\ndata: {"type":"image_generation.partial_image","b64_json":"cGFydGlhbA=="}\n\n');
  parser.push('event: image_generation.completed\ndata: {"type":"image_generation.completed","b64_json":"ZmluYWw="}\n\n');
  const result = parser.end();
  assert.equal(result.partials.length, 1);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].b64, "ZmluYWw=");
});

test("responses payload uses image_generation tool for edits", () => {
  const options = parseOptions(["change the sky", "--base-url", "https://example.test", "--endpoint", "responses", "--input-image", "https://example.test/input.png"]);
  const payload = buildPayload(options);
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.equal(payload.tool_choice.type, "image_generation");
  assert.equal(payload.input[0].content[1].type, "input_image");
});

test("JSON image responses are collected", () => {
  const result = collect({ data: [{ b64_json: "aW1hZ2U=" }] });
  assert.deepEqual(result.images, [{ b64: "aW1hZ2U=" }]);
});
