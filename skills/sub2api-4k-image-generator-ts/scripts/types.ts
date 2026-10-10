export type Endpoint = "images" | "responses";
export type OutputFormat = "png" | "jpeg" | "webp";
export type Background = "" | "auto" | "transparent" | "opaque";
export type Moderation = "" | "auto" | "low";

export interface Options {
  prompt: string;
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  endpoint: Endpoint;
  imageModel: string;
  responsesModel: string;
  inputImage: string;
  size: string;
  quality: string;
  n: number;
  outputFormat: OutputFormat;
  background: Background;
  moderation: Moderation;
  timeout: number;
  outputDir: string;
  prefix: string;
  stream: boolean;
  partialImages: number;
  dryRun: boolean;
  help: boolean;
}

export interface ImageDataItem {
  b64_json?: string;
  url?: string;
}

export interface ImageOutputItem {
  type?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

export interface PartialImageItem {
  b64_json?: string;
  partial_image_index?: number;
}

export interface ImageResponse {
  data?: ImageDataItem[];
  output?: ImageOutputItem[];
  partial_data?: PartialImageItem[];
  _stream_incomplete?: boolean;
  _stream_error?: string;
}
