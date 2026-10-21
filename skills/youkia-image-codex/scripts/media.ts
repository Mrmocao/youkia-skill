import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { ImageResult } from "./protocol.js";
import type { Options } from "./options.js";

export function inspectImage(bytes: Buffer): { format: string; width?: number; height?: number } {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { format: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const type = bytes.toString("ascii", 12, 16);
    if (type === "VP8X" && bytes.length >= 30) return { format: "webp", width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (type === "VP8 " && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) return { format: "webp", width: bytes.readUInt16LE(26) & 16383, height: bytes.readUInt16LE(28) & 16383 };
    if (type === "VP8L" && bytes.length >= 25 && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21);
      return { format: "webp", width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 };
    }
    return { format: "webp" };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) return { format: "jpeg", width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += 2 + length;
    }
    return { format: "jpeg" };
  }
  throw new Error("返回内容不是可识别的 PNG/JPEG/WebP 图片，未写入文件");
}

async function imageBytes(image: ImageResult, timeout: number): Promise<Buffer> {
  if (image.b64) {
    const base64 = image.b64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s/g, "");
    if (base64.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("图片 Base64 无效");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 80 * 1024 * 1024) throw new Error("图片超过 80 MB");
    return bytes;
  }
  let url: URL;
  try { url = new URL(image.url || ""); } catch { throw new Error("服务端图片地址无效"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("服务端图片地址必须为 HTTP(S)");
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout * 1000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error(`图片下载失败 HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 80 * 1024 * 1024) throw new Error("图片下载超过 80 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function saveImage(image: ImageResult, options: Options, index: number, partial = false) {
  const bytes = await imageBytes(image, options.timeout);
  const info = inspectImage(bytes);
  const filename = `${options.prefix}${partial ? "-partial" : ""}-${String(index + 1).padStart(2, "0")}.${info.format}`;
  const path = resolve(!partial && options.output ? options.output : resolve(options.outputDir, filename));
  const extension = extname(path).slice(1).toLowerCase().replace(/^jpg$/, "jpeg");
  if (extension !== info.format) throw new Error(`返回格式为 ${info.format}，与输出扩展名不符；请修改 --output 或使用 --output-dir`);
  await mkdir(dirname(path), { recursive: true });
  try { await writeFile(path, bytes, { flag: options.force ? "w" : "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`文件已存在：${path}；使用新路径或明确添加 --force`);
    throw error;
  }
  return { path, ...info, bytes: bytes.length, partial };
}
