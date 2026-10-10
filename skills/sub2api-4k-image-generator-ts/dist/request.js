import { RequestFailed } from "./errors.js";
import { emptyImageResponse, SSEImageParser } from "./sse.js";
export async function requestJson(url, apiKey, payload, timeoutSeconds, userAgent) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": userAgent,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new RequestFailed(`HTTP ${response.status}: ${text}`);
    }
    return JSON.parse(text);
}
export async function requestStream(url, apiKey, payload, timeoutSeconds, userAgent) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "User-Agent": userAgent,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!response.ok) {
        throw new RequestFailed(`HTTP ${response.status}: ${await response.text()}`);
    }
    if (!response.body) {
        throw new RequestFailed("response body is empty");
    }
    const result = emptyImageResponse();
    const parser = new SSEImageParser(result);
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        const reader = response.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lastNewline = buffer.lastIndexOf("\n");
            if (lastNewline < 0) {
                continue;
            }
            const completeText = buffer.slice(0, lastNewline + 1);
            buffer = buffer.slice(lastNewline + 1);
            for (const rawLine of completeText.split("\n")) {
                parser.processLine(rawLine);
            }
        }
        buffer += decoder.decode();
        if (buffer) {
            for (const rawLine of buffer.split("\n")) {
                parser.processLine(rawLine);
            }
        }
        parser.flush();
    }
    catch (error) {
        result._stream_incomplete = true;
        result._stream_error = error instanceof Error ? error.message : String(error);
        if (buffer) {
            for (const rawLine of buffer.split("\n")) {
                parser.processLine(rawLine);
            }
        }
        parser.flush();
    }
    return result;
}
