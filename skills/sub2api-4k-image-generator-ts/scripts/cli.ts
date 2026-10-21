import { argv } from "node:process";

import { parseArgs, printHelp } from "./args.js";
import { UsageError } from "./errors.js";
import { loadDotEnv, loadLocalConfig, maskApiKey } from "./env.js";
import { buildImagesPayload, buildResponsesPayload } from "./payload.js";
import { requestJson, requestStream } from "./request.js";
import { responseSummary, saveImages, savePartialImages } from "./save.js";
import type { ImageResponse, Options } from "./types.js";

export function buildRequest(options: Options): { url: string; payload: Record<string, unknown> } {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  return {
    url: options.endpoint === "images" ? `${baseUrl}/v1/images/generations` : `${baseUrl}/v1/responses`,
    payload: options.endpoint === "images" ? buildImagesPayload(options) : buildResponsesPayload(options),
  };
}

export async function run(rawArgs = argv.slice(2)): Promise<number> {
  loadLocalConfig();
  loadDotEnv();
  const options = parseArgs(rawArgs);
  if (options.help) {
    printHelp();
    return 0;
  }

  console.log(`sub2api URL: ${options.baseUrl.trim()}`);
  console.log(`API key: ${maskApiKey(options.apiKey)}`);

  if (!options.prompt) {
    throw new UsageError("prompt is required");
  }
  if (options.n <= 0) {
    throw new UsageError("--n must be greater than 0");
  }
  if (options.inputImage && options.endpoint !== "responses") {
    throw new UsageError("--input-image is only supported with --endpoint responses");
  }

  const { url, payload } = buildRequest(options);
  if (options.dryRun) {
    console.log(url);
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }
  if (!options.apiKey) {
    throw new UsageError("Missing API key. Set SUB2API_API_KEY or pass --api-key.");
  }

  const response = options.stream
    ? await requestStream(url, options.apiKey, payload, options.timeout, options.userAgent.trim())
    : await requestJson(url, options.apiKey, payload, options.timeout, options.userAgent.trim());

  const prefix = options.prefix || `image-4k-${Math.floor(Date.now() / 1000)}`;
  const finalCount = saveImages(response, options.outputDir, prefix);
  if (finalCount > 0) {
    return 0;
  }

  const imageResponse = response as ImageResponse;
  const partialCount = savePartialImages(imageResponse, options.outputDir, prefix);
  if (imageResponse._stream_incomplete) {
    console.error(
      "Stream ended before the final image_generation.completed event. " +
        "Saved partial images only; they are not the final 4K result.",
    );
  }
  console.error(JSON.stringify(responseSummary(imageResponse), null, 2));
  if (partialCount === 0) {
    console.error("No base64 image found in response.");
  }
  return 1;
}
