export interface ImageResult { b64?: string; url?: string; id?: string }
export interface GenerationResult {
  images: ImageResult[];
  partials: ImageResult[];
  error: string;
}

export function emptyResult(): GenerationResult { return { images: [], partials: [], error: "" }; }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function failure(value: unknown): string {
  const error = object(value);
  return String(error.message || error.code || (typeof value === "string" ? value : "服务端生成失败"));
}

function addOutput(value: unknown, result: GenerationResult): void {
  const item = object(value);
  if (item.type !== "image_generation_call" || typeof item.result !== "string" || !item.result) return;
  if (item.status && item.status !== "completed") return;
  const id = typeof item.id === "string" ? item.id : undefined;
  if (result.images.some(image => id ? image.id === id : image.b64 === item.result)) return;
  result.images.push({ b64: item.result, id });
}

export function collect(value: unknown, result = emptyResult(), eventName = ""): GenerationResult {
  const event = object(value);
  const type = String(event.type || eventName);
  if (event.error || type === "error" || type === "response.failed" || type === "response.incomplete") {
    const response = object(event.response);
    result.error = failure(event.error || response.error || response.incomplete_details || event);
    return result;
  }
  if (type.endsWith(".partial_image")) {
    const b64 = event.b64_json || event.partial_image_b64;
    if (typeof b64 === "string" && b64) result.partials.push({ b64 });
    if (result.partials.length > 6) result.partials.shift();
    return result;
  }
  if (type === "image_generation.completed" && typeof event.b64_json === "string") result.images.push({ b64: event.b64_json });
  if (type === "response.output_item.done") addOutput(event.item, result);
  const body = type === "response.completed" ? object(event.response) : event;
  if (body.status === "failed" || body.status === "incomplete") result.error = failure(body.error || body.incomplete_details);
  if (Array.isArray(body.output)) for (const item of body.output) addOutput(item, result);
  if (Array.isArray(body.data)) {
    for (const entry of body.data) {
      const image = object(entry);
      if (typeof image.b64_json === "string") result.images.push({ b64: image.b64_json });
      else if (typeof image.url === "string") result.images.push({ url: image.url });
    }
  }
  return result;
}

export class SSEParser {
  private buffer = "";
  private event = "";
  private lines: string[] = [];
  readonly result = emptyResult();

  push(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      this.line(this.buffer.slice(0, newline).replace(/\r$/, ""));
      this.buffer = this.buffer.slice(newline + 1);
    }
  }

  private line(line: string): void {
    if (!line) this.flush();
    else if (line.startsWith("event:")) this.event = line.slice(6).trim();
    else if (line.startsWith("data:")) this.lines.push(line.slice(5).replace(/^ /, ""));
  }

  private flush(): void {
    const value = this.lines.join("\n").trim();
    this.lines = [];
    const event = this.event;
    this.event = "";
    if (!value || value === "[DONE]") return;
    let parsed: unknown;
    try { parsed = JSON.parse(value); }
    catch { this.result.error ||= "服务端返回了无法解析的 SSE 数据"; return; }
    collect(parsed, this.result, event);
  }

  end(): GenerationResult {
    if (this.buffer) this.line(this.buffer.replace(/\r$/, ""));
    this.buffer = "";
    this.flush();
    return this.result;
  }
}

export function redact(text: string, apiKey: string): string {
  return (apiKey ? text.split(apiKey).join("[REDACTED]") : text)
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/data:image\/[^;]+;base64,[a-z0-9+/=]+/gi, "[IMAGE_DATA]")
    .slice(0, 1200);
}

export async function requestImages(url: string, apiKey: string, payload: Record<string, unknown>, timeout: number, userAgent: string): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream, application/json", "User-Agent": userAgent },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout * 1000),
    });
  } catch (error) { throw new Error(`接口连接失败或超时：${redact(String(error), apiKey)}；未自动重试。`); }
  if (!response.ok) {
    const hint: Record<number, string> = { 401: "检查密钥", 403: "检查模型及账号权限", 429: "额度或限流", 524: "上游超时，可检查流式支持" };
    throw new Error(`HTTP ${response.status} ${hint[response.status] || "请求失败"}：${redact(await response.text(), apiKey)}`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    try { return collect(await response.json()); }
    catch { throw new Error("服务端未返回有效 JSON/SSE；请检查 base_url 和接口协议"); }
  }
  if (!response.body) throw new Error("响应体为空");
  const parser = new SSEParser();
  const decoder = new TextDecoder();
  try {
    for await (const chunk of response.body) parser.push(decoder.decode(chunk, { stream: true }));
    parser.push(decoder.decode());
  } catch (error) { parser.result.error ||= `流式连接中断：${redact(String(error), apiKey)}`; }
  return parser.end();
}
