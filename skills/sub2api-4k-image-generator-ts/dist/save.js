import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function* iterB64Images(response) {
    const data = response.data;
    if (Array.isArray(data)) {
        for (const item of data) {
            if (typeof item.b64_json === "string" && item.b64_json) {
                yield item.b64_json;
            }
        }
    }
    const output = response.output;
    if (Array.isArray(output)) {
        for (const item of output) {
            if (item.type === "image_generation_call" && typeof item.result === "string") {
                yield item.result;
            }
        }
    }
}
export function* iterPartialB64Images(response) {
    for (const item of response.partial_data || []) {
        if (typeof item.b64_json === "string" && item.b64_json) {
            yield item.b64_json;
        }
    }
}
function saveBase64Image(path, b64) {
    writeFileSync(path, Buffer.from(b64, "base64"));
    console.log(path);
}
export function saveImages(response, outputDir, prefix) {
    mkdirSync(outputDir, { recursive: true });
    let count = 0;
    for (const b64 of iterB64Images(response)) {
        count += 1;
        saveBase64Image(join(outputDir, `${prefix}-${String(count).padStart(2, "0")}.png`), b64);
    }
    return count;
}
export function savePartialImages(response, outputDir, prefix) {
    mkdirSync(outputDir, { recursive: true });
    let count = 0;
    for (const b64 of iterPartialB64Images(response)) {
        count += 1;
        saveBase64Image(join(outputDir, `${prefix}-partial-${String(count).padStart(2, "0")}.png`), b64);
    }
    return count;
}
export function responseSummary(response) {
    return {
        final_images: [...iterB64Images(response)].length,
        partial_images: [...iterPartialB64Images(response)].length,
        stream_incomplete: Boolean(response._stream_incomplete),
        stream_error: response._stream_error || "",
    };
}
