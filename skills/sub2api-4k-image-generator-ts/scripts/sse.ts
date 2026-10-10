import { RequestFailed } from "./errors.js";
import type { ImageOutputItem, ImageResponse } from "./types.js";

export function emptyImageResponse(): ImageResponse {
  return {
    data: [],
    output: [],
    partial_data: [],
    _stream_incomplete: false,
  };
}

export function extractEventImages(
  event: Record<string, unknown>,
  eventName: string,
  response: ImageResponse,
): void {
  const eventType = String(event.type || eventName);
  if (eventType === "error" || event.error) {
    throw new RequestFailed(`stream error: ${JSON.stringify(event)}`);
  }

  if (eventType === "image_generation.partial_image") {
    const index = Number(event.partial_image_index || 0);
    console.error(`partial image received: index=${index}`);
    const b64 = typeof event.b64_json === "string" ? event.b64_json : "";
    if (b64) {
      response.partial_data ??= [];
      response.partial_data.push({ b64_json: b64, partial_image_index: index });
    }
    return;
  }

  if (eventType === "image_generation.completed") {
    const b64 = typeof event.b64_json === "string" ? event.b64_json : "";
    if (b64) {
      response.data ??= [];
      response.data.push({ b64_json: b64 });
    }
    return;
  }

  if (eventType === "response.image_generation_call.partial_image") {
    const index = Number(event.partial_image_index || 0);
    console.error(`partial image received: index=${index}`);
    const b64 = typeof event.partial_image_b64 === "string" ? event.partial_image_b64 : "";
    if (b64) {
      response.partial_data ??= [];
      response.partial_data.push({ b64_json: b64, partial_image_index: index });
    }
    return;
  }

  if (eventType === "response.output_item.done") {
    const item = event.item as ImageOutputItem | undefined;
    if (item?.type === "image_generation_call" && typeof item.result === "string") {
      response.output ??= [];
      response.output.push(item);
    }
    return;
  }

  if (eventType === "response.completed") {
    const responseBody = event.response as Record<string, unknown> | undefined;
    const output = responseBody?.output;
    if (!Array.isArray(output)) {
      return;
    }
    response.output ??= [];
    for (const item of output) {
      if (
        item &&
        typeof item === "object" &&
        (item as ImageOutputItem).type === "image_generation_call" &&
        typeof (item as ImageOutputItem).result === "string"
      ) {
        response.output.push(item as ImageOutputItem);
      }
    }
  }
}

export function parseSSEText(text: string, response: ImageResponse = emptyImageResponse()): ImageResponse {
  const parser = new SSEImageParser(response);

  for (const rawLine of text.split("\n")) {
    parser.processLine(rawLine);
  }
  parser.flush();
  return response;
}

export class SSEImageParser {
  private eventName = "";
  private eventDataLines: string[] = [];

  constructor(private readonly response: ImageResponse = emptyImageResponse()) {}

  processLine(rawLine: string): void {
    const line = rawLine.replace(/\r$/, "");
    if (line === "") {
      this.flush();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    if (line.startsWith("event:")) {
      this.eventName = line.slice("event:".length).trim();
      return;
    }
    if (line.startsWith("data:")) {
      this.eventDataLines.push(line.slice("data:".length).trim());
    }
  }

  flush(): void {
    if (this.eventDataLines.length === 0) {
      this.eventName = "";
      return;
    }
    const rawData = this.eventDataLines.join("\n").trim();
    const currentEvent = this.eventName;
    this.eventName = "";
    this.eventDataLines = [];
    if (!rawData || rawData === "[DONE]") {
      return;
    }
    try {
      extractEventImages(JSON.parse(rawData) as Record<string, unknown>, currentEvent, this.response);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return;
      }
      throw error;
    }
  }

  result(): ImageResponse {
    return this.response;
  }
}
