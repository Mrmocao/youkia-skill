import { env } from "node:process";

import { UsageError } from "./errors.js";
import type { Background, Endpoint, Moderation, Options, OutputFormat } from "./types.js";

export const SIZE_OPTIONS = [
  "256x256",
  "512x512",
  "1024x1024",
  "1792x1024",
  "1792x1792",
  "3840x2160",
  "7680x4320",
] as const;

export const DEFAULT_SIZE = SIZE_OPTIONS[5];
export const DEFAULT_QUALITY = "high";
export const DEFAULT_IMAGES_MODEL = "gpt-image-2";
export const DEFAULT_RESPONSES_MODEL = "gpt-5.4-mini";
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} 缺少参数值`);
  }
  return value;
}

function parseNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError(`${flag} 必须是数字`);
  }
  return value;
}

function parseChoice<T extends string>(raw: string, choices: readonly T[], flag: string): T {
  if (!choices.includes(raw as T)) {
    throw new UsageError(`${flag} must be one of: ${choices.join(", ")}`);
  }
  return raw as T;
}

export function defaultOptions(): Options {
  return {
    prompt: "",
    baseUrl: env.SUB2API_BASE_URL || "http://127.0.0.1:8080",
    apiKey: env.SUB2API_API_KEY || "",
    userAgent: env.SUB2API_USER_AGENT || DEFAULT_USER_AGENT,
    endpoint: "images",
    imageModel: DEFAULT_IMAGES_MODEL,
    responsesModel: DEFAULT_RESPONSES_MODEL,
    inputImage: "",
    size: DEFAULT_SIZE,
    quality: DEFAULT_QUALITY,
    n: 1,
    outputFormat: "png",
    background: "",
    moderation: "",
    timeout: 300,
    outputDir: ".",
    prefix: "",
    stream: true,
    partialImages: 1,
    dryRun: false,
    help: false,
  };
}

export function parseArgs(rawArgs: string[]): Options {
  const options = defaultOptions();
  const args = [...rawArgs];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--") && !options.prompt) {
      options.prompt = arg;
      continue;
    }

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--base-url":
        options.baseUrl = nextValue(args, i, arg);
        i += 1;
        break;
      case "--api-key":
        options.apiKey = nextValue(args, i, arg);
        i += 1;
        break;
      case "--user-agent":
        options.userAgent = nextValue(args, i, arg);
        i += 1;
        break;
      case "--endpoint":
        options.endpoint = parseChoice<Endpoint>(nextValue(args, i, arg), ["images", "responses"], arg);
        i += 1;
        break;
      case "--image-model":
        options.imageModel = nextValue(args, i, arg);
        i += 1;
        break;
      case "--responses-model":
        options.responsesModel = nextValue(args, i, arg);
        i += 1;
        break;
      case "--input-image":
        options.inputImage = nextValue(args, i, arg);
        i += 1;
        break;
      case "--size":
        options.size = nextValue(args, i, arg);
        i += 1;
        break;
      case "--quality":
        options.quality = nextValue(args, i, arg);
        i += 1;
        break;
      case "--n":
        options.n = parseNumber(nextValue(args, i, arg), arg);
        i += 1;
        break;
      case "--output-format":
        options.outputFormat = parseChoice<OutputFormat>(nextValue(args, i, arg), ["png", "jpeg", "webp"], arg);
        i += 1;
        break;
      case "--background":
        options.background = parseChoice<Background>(nextValue(args, i, arg), ["auto", "transparent", "opaque"], arg);
        i += 1;
        break;
      case "--moderation":
        options.moderation = parseChoice<Moderation>(nextValue(args, i, arg), ["auto", "low"], arg);
        i += 1;
        break;
      case "--timeout":
        options.timeout = parseNumber(nextValue(args, i, arg), arg);
        i += 1;
        break;
      case "--output-dir":
        options.outputDir = nextValue(args, i, arg);
        i += 1;
        break;
      case "--prefix":
        options.prefix = nextValue(args, i, arg);
        i += 1;
        break;
      case "--stream":
        options.stream = true;
        break;
      case "--no-stream":
        options.stream = false;
        break;
      case "--partial-images":
        options.partialImages = parseNumber(nextValue(args, i, arg), arg);
        i += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new UsageError(`无法识别的参数：${arg}`);
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`sub2api-4k-image-request-ts

Usage:
  node dist/openai_4k_image_request.js "prompt" [options]
  npx tsx scripts/openai_4k_image_request.ts "prompt" [options]

Options:
  --base-url URL                 Defaults to SUB2API_BASE_URL or http://127.0.0.1:8080
  --api-key KEY                  Defaults to SUB2API_API_KEY
  --endpoint images|responses    Defaults to images
  --image-model MODEL            Defaults to gpt-image-2
  --responses-model MODEL        Defaults to gpt-5.4-mini
  --input-image PATH_OR_URL      Only with --endpoint responses
  --size WIDTHxHEIGHT            Defaults to 3840x2160
  --quality QUALITY              Defaults to high
  --n NUMBER                     Defaults to 1
  --output-format png|jpeg|webp  Defaults to png
  --background auto|transparent|opaque
  --moderation auto|low
  --timeout SECONDS              Defaults to 300
  --output-dir DIR               Defaults to .
  --prefix PREFIX
  --stream / --no-stream         Streaming defaults on
  --partial-images NUMBER        Defaults to 1
  --dry-run
`);
}
