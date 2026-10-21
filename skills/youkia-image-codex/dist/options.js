import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const valueFlags = {
    "--prompt": "prompt", "--base-url": "baseUrl", "--api-key": "apiKey",
    "--image-model": "imageModel", "--responses-model": "responsesModel",
    "--user-agent": "userAgent", "--endpoint": "endpoint", "--input-image": "inputImage",
    "--size": "size", "--quality": "quality", "--n": "n", "--output-format": "outputFormat",
    "--background": "background", "--moderation": "moderation", "--timeout": "timeout",
    "--output-dir": "outputDir", "--output": "output", "--prefix": "prefix",
    "--partial-images": "partialImages", "--config": "config",
};
export function parseOptions(args, environment = process.env) {
    const flags = {};
    let prompt = "";
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (flag === "--help" || flag === "-h")
            flags.help = true;
        else if (flag === "--dry-run")
            flags.dryRun = true;
        else if (flag === "--force")
            flags.force = true;
        else if (flag === "--stream" || flag === "--no-stream")
            flags.stream = flag === "--stream";
        else if (Object.hasOwn(valueFlags, flag)) {
            const value = args[++index];
            if (!value || value.startsWith("--"))
                throw new Error(`${flag} 缺少参数值`);
            flags[valueFlags[flag]] = value;
        }
        else if (!flag.startsWith("-") && !prompt)
            prompt = flag;
        else
            throw new Error(`未知参数：${flag}。使用 --help 查看用法。`);
    }
    if (flags.help)
        return { help: true };
    const configPath = String(flags.config || environment.YOUKIA_IMAGE_CONFIG || environment.SUB2API_CONFIG || resolve(skillRoot, "config.local.json"));
    const explicitConfig = Boolean(flags.config || environment.YOUKIA_IMAGE_CONFIG || environment.SUB2API_CONFIG);
    let config = {};
    if (existsSync(configPath)) {
        try {
            const parsed = JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                throw new Error();
            config = parsed;
        }
        catch {
            throw new Error(`配置必须是有效 JSON 对象：${configPath}`);
        }
    }
    else if (explicitConfig)
        throw new Error(`配置文件不存在：${configPath}`);
    function setting(flag, key, fallback) {
        const envKey = key.toUpperCase();
        const value = flags[flag] ?? environment[`YOUKIA_IMAGE_${envKey}`] ?? environment[`SUB2API_${envKey}`] ?? config[key] ?? fallback;
        if (typeof value !== "string")
            throw new Error(`配置 ${key} 必须是字符串`);
        return value.trim();
    }
    const options = {
        prompt: String(flags.prompt ?? prompt).trim(),
        baseUrl: setting("baseUrl", "base_url", ""),
        apiKey: setting("apiKey", "api_key", ""),
        imageModel: setting("imageModel", "image_model", "gpt-image-2.5-flare"),
        responsesModel: setting("responsesModel", "responses_model", "gpt-5.4-mini"),
        userAgent: setting("userAgent", "user_agent", "youkia-image-codex/1.0.0"),
        endpoint: String(flags.endpoint ?? "images"),
        inputImage: String(flags.inputImage ?? ""),
        size: String(flags.size ?? "3840x2160"),
        quality: String(flags.quality ?? "high"),
        n: Number(flags.n ?? 1),
        outputFormat: String(flags.outputFormat ?? "png"),
        background: String(flags.background ?? ""),
        moderation: String(flags.moderation ?? ""),
        timeout: Number(flags.timeout ?? 300),
        outputDir: String(flags.outputDir ?? "output"),
        output: String(flags.output ?? ""),
        prefix: String(flags.prefix ?? `youkia-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
        stream: Boolean(flags.stream ?? true),
        partialImages: Number(flags.partialImages ?? 1),
        dryRun: Boolean(flags.dryRun), force: Boolean(flags.force), help: false,
    };
    if (!options.prompt)
        throw new Error("请提供 prompt");
    if (!options.baseUrl)
        throw new Error("缺少 base_url，请配置 config.local.json 或 YOUKIA_IMAGE_BASE_URL");
    for (const [field, minimum, maximum] of [["n", 1, 10], ["partialImages", 0, 3], ["timeout", 1, 3600]]) {
        if (!Number.isInteger(options[field]) || options[field] < minimum || options[field] > maximum)
            throw new Error(`${field} 必须为 ${minimum}–${maximum} 的整数`);
    }
    const choices = { endpoint: ["images", "responses"], outputFormat: ["png", "jpeg", "webp"], quality: ["auto", "low", "medium", "high"], background: ["", "auto", "transparent", "opaque"], moderation: ["", "auto", "low"] };
    for (const field of Object.keys(choices)) {
        if (!choices[field].includes(options[field]))
            throw new Error(`${field} 可选值：${choices[field].join(", ")}`);
    }
    if (options.size !== "auto" && !/^[1-9]\d{1,4}x[1-9]\d{1,4}$/.test(options.size))
        throw new Error("size 应为 WIDTHxHEIGHT 或 auto；可用尺寸取决于服务端");
    if (!/^[\p{L}\p{N}_.-]+$/u.test(options.prefix) || options.prefix === "." || options.prefix === "..")
        throw new Error("prefix 仅允许名称，不能包含目录");
    if (options.output && options.n !== 1)
        throw new Error("--output 只支持 n=1；多张图片请使用 --output-dir");
    if (options.inputImage && options.endpoint !== "responses")
        throw new Error("改图请使用 --endpoint responses --input-image PATH_OR_URL");
    if (/^grok-imagine/i.test(options.imageModel))
        throw new Error("Grok 使用独立的 grok-imagine-subapi 技能，本技能的 4K 参数不适用");
    if (!options.imageModel || !options.responsesModel)
        throw new Error("模型名不能为空");
    return options;
}
export function endpointUrl(baseUrl, endpoint) {
    let url;
    try {
        url = new URL(baseUrl);
    }
    catch {
        throw new Error("base_url 必须是完整 HTTP(S) 地址");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error("base_url 不支持账号密码、查询参数或锚点");
    let path = url.pathname.replace(/\/+$/, "");
    if (/\/(?:images\/generations|responses)$/.test(path))
        throw new Error("base_url 请填写根地址或 /v1 地址，不要填写具体接口");
    if (!path.endsWith("/v1"))
        path += "/v1";
    url.pathname = `${path}/${endpoint === "images" ? "images/generations" : "responses"}`;
    return url.toString();
}
export function help() {
    return `youkia-image-codex 1.0.0 — Node.js 22+
node <SKILL_DIR>/dist/generate-image.js "提示词" [选项]
--config PATH                       默认技能目录内 config.local.json
--base-url URL --api-key KEY          优先级：参数 > YOUKIA_IMAGE_* > SUB2API_* > 配置
--image-model MODEL                  默认 gpt-image-2.5-flare（需服务端支持）
--endpoint images|responses          默认 images；改图使用 responses
--responses-model MODEL              默认 gpt-5.4-mini（需服务端支持）
--input-image PATH_OR_URL             responses 改图输入
--size WIDTHxHEIGHT|auto              默认 3840x2160，不保证服务端支持
--quality auto|low|medium|high         默认 high
--n 1..10 --output-format png|jpeg|webp
--output PATH                        单张精确路径；扩展名必须与返回格式一致
--output-dir DIR --prefix NAME        默认 ./output；自动唯一文件名
--stream / --no-stream               默认流式；不自动重试生成请求
--partial-images 0..3 --timeout 1..3600
--background auto|transparent|opaque --moderation auto|low
--dry-run                            离线检查请求，不发送、不打印密钥或输入图
--force                              允许覆盖已有文件
离线自测：node --test <SKILL_DIR>/tests/*.test.mjs`;
}
