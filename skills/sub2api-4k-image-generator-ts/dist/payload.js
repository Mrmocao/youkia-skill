import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
export function imageReference(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
        return trimmed;
    }
    const path = resolve(trimmed);
    const data = readFileSync(path);
    const ext = extname(path).toLowerCase();
    const mimeType = ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
            ? "image/webp"
            : "image/png";
    return `data:${mimeType};base64,${data.toString("base64")}`;
}
export function buildImagesPayload(options) {
    const payload = {
        model: options.imageModel,
        prompt: options.prompt,
        size: options.size,
        quality: options.quality,
        n: options.n,
        response_format: "b64_json",
    };
    if (options.outputFormat) {
        payload.output_format = options.outputFormat;
    }
    if (options.background) {
        payload.background = options.background;
    }
    if (options.moderation) {
        payload.moderation = options.moderation;
    }
    if (options.stream) {
        payload.stream = true;
        payload.partial_images = options.partialImages;
    }
    return payload;
}
export function buildResponsesPayload(options) {
    const tool = {
        type: "image_generation",
        model: options.imageModel,
        size: options.size,
        quality: options.quality,
    };
    if (options.n > 1) {
        tool.n = options.n;
    }
    if (options.outputFormat) {
        tool.output_format = options.outputFormat;
    }
    if (options.background) {
        tool.background = options.background;
    }
    if (options.moderation) {
        tool.moderation = options.moderation;
    }
    const content = [{ type: "input_text", text: options.prompt }];
    if (options.inputImage) {
        content.push({ type: "input_image", image_url: imageReference(options.inputImage) });
    }
    return {
        model: options.responsesModel,
        input: [{ type: "message", role: "user", content }],
        tools: [tool],
        tool_choice: { type: "image_generation" },
        stream: options.stream,
    };
}
