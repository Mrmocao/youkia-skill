import { help, parseOptions, endpointUrl } from "./options.js";
import { buildPayload } from "./payload.js";
import { requestImages, redact } from "./protocol.js";
import { saveImage } from "./media.js";
export async function run(args = process.argv.slice(2)) {
    let options;
    try {
        options = parseOptions(args);
        if (options.help) {
            console.log(help());
            return 0;
        }
        const url = endpointUrl(options.baseUrl, options.endpoint);
        const payload = buildPayload(options);
        if (options.dryRun) {
            if (options.endpoint === "responses" && options.inputImage) {
                const input = payload.input;
                input[0].content[1].image_url = "[INPUT_IMAGE_REDACTED]";
            }
            console.log(JSON.stringify({ success: true, dry_run: true, url, credential_configured: Boolean(options.apiKey && !/^YOUR_|^sk-\.\.\./i.test(options.apiKey)), payload }, null, 2));
            return 0;
        }
        if (!options.apiKey || /^YOUR_|^sk-\.\.\./i.test(options.apiKey))
            throw new Error("缺少有效 API key；请填写 config.local.json 或 YOUKIA_IMAGE_API_KEY");
        const result = await requestImages(url, options.apiKey, payload, options.timeout, options.userAgent);
        const files = [];
        const failures = [];
        for (const [index, image] of result.images.entries()) {
            try {
                files.push(await saveImage(image, options, index));
            }
            catch (error) {
                failures.push(String(error));
            }
        }
        const partialFiles = [];
        if (!files.length) {
            for (const [index, image] of result.partials.entries()) {
                try {
                    partialFiles.push(await saveImage(image, options, index, true));
                }
                catch (error) {
                    failures.push(String(error));
                }
            }
        }
        const success = files.length === options.n && !result.error && !failures.length;
        const warnings = [];
        for (const file of files) {
            const actual = file.width && file.height ? `${file.width}x${file.height}` : "unknown";
            if (options.size !== "auto" && actual !== options.size)
                warnings.push(`请求 ${options.size}，实际 ${actual}：${file.path}`);
        }
        console.log(JSON.stringify({ success, model: options.imageModel, requested_size: options.size, files, partial_files: partialFiles, warnings, errors: [...(result.error ? [redact(result.error, options.apiKey)] : []), ...failures.map(error => redact(error, options.apiKey)), ...(files.length !== options.n ? [`预期 ${options.n} 张最终图片，得到 ${files.length} 张；不会自动重新生成。`] : [])] }, null, 2));
        return success ? 0 : 1;
    }
    catch (error) {
        const rawKeyIndex = args.indexOf("--api-key");
        const secret = options?.apiKey || (rawKeyIndex >= 0 ? args[rawKeyIndex + 1] : "") || process.env.YOUKIA_IMAGE_API_KEY || process.env.SUB2API_API_KEY || "";
        console.error(JSON.stringify({ success: false, error: redact(error instanceof Error ? error.message : String(error), secret) }));
        return 1;
    }
}
