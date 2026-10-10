import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function loadDotEnv(path = ".env") {
    if (!existsSync(path)) {
        return;
    }
    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (!key || env[key] !== undefined) {
            continue;
        }
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
}
export function loadLocalConfig(path = env.SUB2API_CONFIG || resolve(SKILL_ROOT, "config.local.json")) {
    if (!existsSync(path)) {
        return;
    }
    let config;
    try {
        config = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        throw new Error(`Local config is not valid JSON: ${path}`);
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`Local config must be a JSON object: ${path}`);
    }
    const values = config;
    const mappings = {
        api_key: "SUB2API_API_KEY",
        base_url: "SUB2API_BASE_URL",
        user_agent: "SUB2API_USER_AGENT",
    };
    for (const [configKey, envKey] of Object.entries(mappings)) {
        const value = values[configKey];
        if (env[envKey] === undefined && typeof value === "string" && value.trim()) {
            env[envKey] = value.trim();
        }
    }
}
export function maskApiKey(apiKey) {
    const trimmed = apiKey.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.length <= 10) {
        return "***";
    }
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}
