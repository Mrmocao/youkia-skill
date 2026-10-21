import { readFileSync } from "node:fs";
import { extname } from "node:path";
function imageReference(value) {
    if (/^https?:\/\//i.test(value) || /^data:image\/(png|jpeg|webp);base64,/i.test(value))
        return value;
    const formats = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
    const format = formats[extname(value).toLowerCase()];
    if (!format)
        throw new Error("输入图支持 PNG、JPEG、WebP 文件或 HTTP(S) 图片地址");
    const bytes = readFileSync(value);
    if (bytes.length > 30 * 1024 * 1024)
        throw new Error("输入图超过 30 MB");
    return `data:${format};base64,${bytes.toString("base64")}`;
}
export function buildPayload(options) {
    const common = { model: options.imageModel, size: options.size, quality: options.quality, output_format: options.outputFormat };
    if (options.background)
        common.background = options.background;
    if (options.moderation)
        common.moderation = options.moderation;
    if (options.endpoint === "images") {
        return { ...common, prompt: options.prompt, n: options.n, response_format: "b64_json", ...(options.stream ? { stream: true, partial_images: options.partialImages } : {}) };
    }
    if (options.n !== 1)
        throw new Error("Responses 模式仅支持 n=1；多图请使用 images 模式");
    const content = [{ type: "input_text", text: options.prompt }];
    if (options.inputImage)
        content.push({ type: "input_image", image_url: imageReference(options.inputImage) });
    return {
        model: options.responsesModel,
        input: [{ role: "user", content }],
        tools: [{ ...common, type: "image_generation", ...(options.stream ? { partial_images: options.partialImages } : {}) }],
        tool_choice: { type: "image_generation" }, stream: options.stream,
    };
}
