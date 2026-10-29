import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleSkillMcpRequest } from "./mcp-server.mjs";
import { ROLE_OPTIONS, rolesFor, historyFor } from "./public/roles.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const PACKAGES_DIR = join(DATA_DIR, "packages");
const SUBMISSIONS_DIR = join(DATA_DIR, "submissions");
const ARCHIVE_DIR = join(DATA_DIR, "archive");
const SKILLS_FILE = join(DATA_DIR, "skills.json");
const SUBMISSIONS_FILE = join(DATA_DIR, "submissions.json");
const ARCHIVED_FILE = join(DATA_DIR, "archived-skills.json");
const PORT = Number.parseInt(process.env.PORT || "8088", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_JSON_BYTES = 45 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 30 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 500;
const MAX_PENDING_SUBMISSIONS = 200;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const submissionAttempts = new Map();
let dataMutationTail = Promise.resolve();

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".zip", "application/zip"],
]);

function setSecurityHeaders(response) {
  response.setHeader("Link", '</agent-guide.md>; rel="describedby"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/json"');
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { success: false, error: message });
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      throw Object.assign(new Error("请求内容过大"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("请求 JSON 格式无效"), { statusCode: 400 });
  }
}

async function readCollection(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeCollection(filePath, items) {
  const tempFile = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await rename(tempFile, filePath);
}

async function readSkills() {
  return (await readCollection(SKILLS_FILE)).map(skill => ({ ...skill, roles: rolesFor(skill), contributions: historyFor(skill) }));
}

function writeSkills(skills) {
  return writeCollection(SKILLS_FILE, skills);
}

function readSubmissions() {
  return readCollection(SUBMISSIONS_FILE);
}

function writeSubmissions(submissions) {
  return writeCollection(SUBMISSIONS_FILE, submissions);
}

function readArchivedSkills() {
  return readCollection(ARCHIVED_FILE);
}

function writeArchivedSkills(skills) {
  return writeCollection(ARCHIVED_FILE, skills);
}

function withDataMutation(task) {
  const operation = dataMutationTail.then(task, task);
  dataMutationTail = operation.catch(() => {});
  return operation;
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of (request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
}

function sessionToken(request) {
  cleanupSessions();
  const token = parseCookies(request).get("skillroom_session");
  return token && sessions.has(token) ? token : null;
}

function requireAdmin(request, response) {
  if (!sessionToken(request)) {
    sendError(response, 401, "请先登录管理员账号");
    return false;
  }
  return true;
}

function passwordsMatch(candidate) {
  const expectedDigest = createHash("sha256").update(ADMIN_PASSWORD).digest();
  const candidateDigest = createHash("sha256").update(String(candidate || "")).digest();
  return timingSafeEqual(expectedDigest, candidateDigest);
}

function clientAddress(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function mayAttemptLogin(address) {
  const now = Date.now();
  const recent = (loginAttempts.get(address) || []).filter((time) => now - time < 15 * 60 * 1000);
  loginAttempts.set(address, recent);
  return recent.length < 8;
}

function recordFailedLogin(address) {
  const recent = loginAttempts.get(address) || [];
  recent.push(Date.now());
  loginAttempts.set(address, recent);
}

function maySubmit(address) {
  const now = Date.now();
  const recent = (submissionAttempts.get(address) || []).filter((time) => now - time < 60 * 60 * 1000);
  submissionAttempts.set(address, recent);
  return recent.length < 8;
}

function recordSubmission(address) {
  const recent = submissionAttempts.get(address) || [];
  recent.push(Date.now());
  submissionAttempts.set(address, recent);
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function strings(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function structuredItems(value, fields, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => {
    const result = {};
    for (const field of fields) result[field] = String(item?.[field] || "").trim();
    return result;
  }).filter((item) => Object.values(item).some(Boolean));
}

function sanitizeSkill(body, packageFilename, existing) {
  const uploaderName = String(body.uploaderName || "").trim();
  if (!uploaderName || uploaderName.length > 80) {
    throw Object.assign(new Error("请填写上传人员姓名（1–80 字），用于公开展示上传与维护记录"), { statusCode: 400 });
  }
  const roles = body.roles === undefined ? rolesFor(existing || body) : body.roles;
  if (!Array.isArray(roles) || !roles.length || roles.length > ROLE_OPTIONS.length || roles.some(role => !ROLE_OPTIONS.includes(role))) {
    throw Object.assign(new Error("请选择有效的适用工种，可多选"), { statusCode: 400 });
  }
  const id = slug(body.id || body.name);
  const name = String(body.name || "").trim().slice(0, 100);
  const description = String(body.description || "").trim().slice(0, 1000);
  if (!id || !name || !description) {
    throw Object.assign(new Error("技能 ID、名称和简介不能为空"), { statusCode: 400 });
  }

  const version = String(body.version || "1.0.0").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40) || "1.0.0";
  const updatedAt = new Date().toISOString().slice(0, 10);
  const configFields = structuredItems(body.config?.fields, ["key", "type", "description"]);
  return {
    id,
    name,
    description,
    category: String(body.category || "其他").trim().slice(0, 40),
    tags: strings(body.tags, 12),
    author: String(body.author || "内部贡献者").trim().slice(0, 80),
    uploaderName,
    roles: [...new Set(roles)],
    contributions: existing ? historyFor(existing) : [],
    version,
    updatedAt,
    featured: Boolean(body.featured),
    downloads: Number(existing?.downloads || 0),
    package: packageFilename,
    files: strings(body.files, 100),
    tutorial: structuredItems(body.tutorial, ["title", "body"], 12),
    config: {
      path: String(body.config?.path || "config.local.json").trim().slice(0, 160),
      fields: configFields,
      example: String(body.config?.example || "").slice(0, 10000),
    },
    examples: structuredItems(body.examples, ["label", "command"], 20),
    notes: strings(body.notes, 30),
  };
}

function zipEntries(packageBytes) {
  if (packageBytes.length < 22) {
    throw Object.assign(new Error("上传文件不是有效的 ZIP 包"), { statusCode: 400 });
  }
  const minimumOffset = Math.max(0, packageBytes.length - 65_557);
  let endOffset = -1;
  for (let offset = packageBytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (packageBytes.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw Object.assign(new Error("上传文件不是有效的 ZIP 包"), { statusCode: 400 });
  }

  const entryCount = packageBytes.readUInt16LE(endOffset + 10);
  const centralOffset = packageBytes.readUInt32LE(endOffset + 16);
  if (!entryCount || entryCount > MAX_ZIP_ENTRIES || centralOffset >= packageBytes.length) {
    throw Object.assign(new Error("ZIP 包目录无效或文件数量过多"), { statusCode: 400 });
  }

  const entries = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > packageBytes.length || packageBytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw Object.assign(new Error("ZIP 包中央目录损坏"), { statusCode: 400 });
    }
    const flags = packageBytes.readUInt16LE(cursor + 8);
    const compressedSize = packageBytes.readUInt32LE(cursor + 20);
    const uncompressedSize = packageBytes.readUInt32LE(cursor + 24);
    const nameLength = packageBytes.readUInt16LE(cursor + 28);
    const extraLength = packageBytes.readUInt16LE(cursor + 30);
    const commentLength = packageBytes.readUInt16LE(cursor + 32);
    const externalAttributes = packageBytes.readUInt32LE(cursor + 38);
    const headerLength = 46 + nameLength + extraLength + commentLength;
    if (!nameLength || cursor + headerLength > packageBytes.length || (flags & 0x1) !== 0) {
      throw Object.assign(new Error("ZIP 包包含无效或加密文件"), { statusCode: 400 });
    }

    const entryName = packageBytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    const segments = entryName.split("/");
    const unixMode = externalAttributes >>> 16;
    if (
      entryName.includes("\0")
      || entryName.startsWith("/")
      || /^[a-z]:/i.test(entryName)
      || segments.includes("..")
      || (unixMode & 0o170000) === 0o120000
    ) {
      throw Object.assign(new Error("ZIP 包包含不安全的文件路径或符号链接"), { statusCode: 400 });
    }

    totalUncompressed += uncompressedSize;
    if (
      totalUncompressed > MAX_UNCOMPRESSED_BYTES
      || (compressedSize > 0 && uncompressedSize / compressedSize > 200)
    ) {
      throw Object.assign(new Error("ZIP 包解压体积或压缩比例异常"), { statusCode: 400 });
    }
    entries.push(entryName);
    cursor += headerLength;
  }
  return entries;
}

function validateZip(packageBytes) {
  if (packageBytes.length > MAX_PACKAGE_BYTES) {
    throw Object.assign(new Error("技能包不能超过 30 MB"), { statusCode: 413 });
  }

  const entries = zipEntries(packageBytes);
  const lowerEntries = entries.map((entry) => entry.toLowerCase());
  if (!lowerEntries.some((entry) => basename(entry) === "skill.md")) {
    throw Object.assign(new Error("技能包内未找到 SKILL.md"), { statusCode: 400 });
  }
  const forbidden = ["config.local.json", ".env", "id_rsa", "id_ed25519", "credentials.json"];
  if (lowerEntries.some((entry) => entry.split("/").some((part) => forbidden.includes(part)))) {
    throw Object.assign(new Error("技能包疑似包含本地凭据文件，请移除后重新上传"), { statusCode: 400 });
  }
  return entries.filter((entry) => !entry.endsWith("/"));
}

function decodePackageBase64(value) {
  const encoded = String(value || "").replace(/\s+/g, "");
  const maximumEncodedLength = Math.ceil(MAX_PACKAGE_BYTES / 3) * 4 + 4;
  if (!encoded || encoded.length > maximumEncodedLength) {
    throw Object.assign(new Error(encoded ? "技能包不能超过 30 MB" : "请选择技能 ZIP 包"), { statusCode: encoded ? 413 : 400 });
  }
  if (encoded.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw Object.assign(new Error("技能包编码无效"), { statusCode: 400 });
  }
  const packageBytes = Buffer.from(encoded, "base64");
  const files = validateZip(packageBytes);
  return { packageBytes, files };
}

async function createSubmission(body, address) {
  if (!maySubmit(address)) {
    throw Object.assign(new Error("提交过于频繁，请一小时后再试"), { statusCode: 429 });
  }
  const submitter = String(body.submitter || body.author || "").trim().slice(0, 80);
  const contact = String(body.contact || "").trim().slice(0, 160);
  if (!submitter || !contact) {
    throw Object.assign(new Error("提交人和联系方式不能为空"), { statusCode: 400 });
  }
  const { packageBytes, files } = decodePackageBase64(body.packageBase64);
  const submission = await withDataMutation(async () => {
    const submissions = await readSubmissions();
    if (submissions.length >= MAX_PENDING_SUBMISSIONS) {
      throw Object.assign(new Error("待审核队列已满，请稍后再提交"), { statusCode: 503 });
    }
    const submissionId = randomBytes(12).toString("hex");
    const skill = sanitizeSkill({ ...body, author: body.author || submitter, files }, `${slug(body.id || body.name)}.zip`, null);
    const current = (await readSkills()).find((item) => item.id === skill.id);
    const baseVersion = current?.version || "";
    if (body.baseVersion && String(body.baseVersion) !== baseVersion) {
      throw Object.assign(new Error("原技能已有更新，请重新获取最新版本后提交优化"), { statusCode: 409 });
    }
    if (current && skill.version === current.version) {
      throw Object.assign(new Error("优化已有技能请填写新的版本号，并说明改动与验证结果"), { statusCode: 400 });
    }
    skill.featured = false;
    skill.files = files.slice(0, 100);
    const packageFilename = `${submissionId}.zip`;
    await writeFile(join(SUBMISSIONS_DIR, packageFilename), packageBytes, { flag: "wx" });
    submissions.push({
      id: submissionId,
      submittedAt: new Date().toISOString(),
      submitter,
      contact,
      baseVersion,
      changeSummary: String(body.changeSummary || "").trim().slice(0, 2000),
      packageSize: packageBytes.length,
      package: packageFilename,
      skill,
    });
    await writeSubmissions(submissions);
    return { id: submissionId, status: "pending" };
  });
  recordSubmission(address);
  return submission;
}

function publicSkill(skill) {
  return {
    ...skill,
    package: undefined,
  };
}

function adminSubmission(submission) {
  return {
    id: submission.id,
    submittedAt: submission.submittedAt,
    submitter: submission.submitter,
    contact: submission.contact,
    baseVersion: submission.baseVersion,
    changeSummary: submission.changeSummary,
    packageSize: submission.packageSize,
    skill: publicSkill(submission.skill),
  };
}

async function removeFileIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { success: true, service: "skillroom" });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/skills") {
    const role = url.searchParams.get("role") || "";
    const category = url.searchParams.get("category") || "";
    const uploader = (url.searchParams.get("uploader") || "").trim().toLowerCase();
    const skills = (await readSkills()).filter(skill => (!role || rolesFor(skill).includes(role))
      && (!category || skill.category === category)
      && (!uploader || [skill.uploaderName, ...historyFor(skill).map(item => item.name)].join(" ").toLowerCase().includes(uploader)));
    sendJson(response, 200, { success: true, skills: skills.map(publicSkill) });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/submissions") {
    const address = clientAddress(request);
    const body = await readJson(request);
    const submission = await createSubmission(body, address);
    sendJson(response, 202, { success: true, submission });
    return true;
  }

  const detailMatch = url.pathname.match(/^\/api\/skills\/([a-z0-9-]+)$/);
  if (request.method === "GET" && detailMatch) {
    const skills = await readSkills();
    const skill = skills.find((item) => item.id === detailMatch[1]);
    if (!skill) sendError(response, 404, "未找到该技能");
    else sendJson(response, 200, { success: true, skill: publicSkill(skill) });
    return true;
  }

  const downloadMatch = url.pathname.match(/^\/api\/skills\/([a-z0-9-]+)\/download$/);
  if (request.method === "GET" && downloadMatch) {
    let download;
    try {
      download = await withDataMutation(async () => {
        const skills = await readSkills();
        const index = skills.findIndex((item) => item.id === downloadMatch[1]);
        if (index < 0) {
          throw Object.assign(new Error("未找到该技能"), { statusCode: 404 });
        }
        const skill = skills[index];
        const packagePath = join(PACKAGES_DIR, basename(skill.package));
        let packageStat;
        try {
          packageStat = await stat(packagePath);
        } catch {
          throw Object.assign(new Error("该技能包尚未上传"), { statusCode: 404 });
        }
        skill.downloads = Number(skill.downloads || 0) + 1;
        await writeSkills(skills);
        return { packagePath, packageStat, skill };
      });
    } catch (error) {
      sendError(response, error?.statusCode || 500, error?.message || "下载技能失败");
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": download.packageStat.size,
      "Content-Disposition": `attachment; filename="${download.skill.id}-${download.skill.version}.zip"`,
      "Cache-Control": "private, no-store",
    });
    createReadStream(download.packagePath).pipe(response);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    const authenticated = Boolean(sessionToken(request));
    const pendingCount = authenticated ? (await readSubmissions()).length : 0;
    sendJson(response, 200, { success: true, authenticated, configured: Boolean(ADMIN_PASSWORD), pendingCount });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    if (!ADMIN_PASSWORD) {
      sendError(response, 503, "服务器尚未配置管理员密码");
      return true;
    }
    const address = clientAddress(request);
    if (!mayAttemptLogin(address)) {
      sendError(response, 429, "登录尝试过多，请稍后再试");
      return true;
    }
    const body = await readJson(request);
    if (!passwordsMatch(body.password)) {
      recordFailedLogin(address);
      sendError(response, 401, "管理员密码错误");
      return true;
    }
    loginAttempts.delete(address);
    const token = randomBytes(32).toString("base64url");
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    sendJson(response, 200, { success: true }, {
      "Set-Cookie": `skillroom_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    const token = sessionToken(request);
    if (token) sessions.delete(token);
    sendJson(response, 200, { success: true }, {
      "Set-Cookie": "skillroom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/submissions") {
    if (!requireAdmin(request, response)) return true;
    const submissions = await readSubmissions();
    sendJson(response, 200, { success: true, submissions: submissions.map(adminSubmission) });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/skills") {
    if (!requireAdmin(request, response)) return true;
    const skills = await readSkills();
    sendJson(response, 200, { success: true, skills: skills.map(publicSkill) });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/archived-skills") {
    if (!requireAdmin(request, response)) return true;
    const skills = await readArchivedSkills();
    sendJson(response, 200, { success: true, skills: skills.map(publicSkill) });
    return true;
  }

  const submissionDownloadMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-f0-9]{24})\/download$/);
  if (request.method === "GET" && submissionDownloadMatch) {
    if (!requireAdmin(request, response)) return true;
    const submissions = await readSubmissions();
    const submission = submissions.find((item) => item.id === submissionDownloadMatch[1]);
    if (!submission) {
      sendError(response, 404, "未找到该待审核提交");
      return true;
    }
    const packagePath = join(SUBMISSIONS_DIR, basename(submission.package));
    let packageStat;
    try {
      packageStat = await stat(packagePath);
    } catch {
      sendError(response, 404, "待审核技能包文件不存在");
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": packageStat.size,
      "Content-Disposition": `attachment; filename="review-${submission.skill.id}-${submission.skill.version}.zip"`,
      "Cache-Control": "private, no-store",
    });
    createReadStream(packagePath).pipe(response);
    return true;
  }

  const submissionApproveMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-f0-9]{24})\/approve$/);
  if (request.method === "POST" && submissionApproveMatch) {
    if (!requireAdmin(request, response)) return true;
    const approval = await readJson(request);
    const result = await withDataMutation(async () => {
      const submissions = await readSubmissions();
      const submissionIndex = submissions.findIndex((item) => item.id === submissionApproveMatch[1]);
      if (submissionIndex < 0) {
        throw Object.assign(new Error("未找到该待审核提交"), { statusCode: 404 });
      }
      const submission = submissions[submissionIndex];
      const pendingPath = join(SUBMISSIONS_DIR, basename(submission.package));
      const packageBytes = await readFile(pendingPath);
      const files = validateZip(packageBytes);
      const skills = await readSkills();
      const existingIndex = skills.findIndex((item) => item.id === submission.skill.id);
      const existing = existingIndex >= 0 ? skills[existingIndex] : null;
      if (submission.baseVersion !== undefined && submission.baseVersion !== (existing?.version || "")) {
        throw Object.assign(new Error("此投稿基于旧版本，原技能已有更新。请联系提交人合并最新内容后重新投稿，避免覆盖其他人的优化"), { statusCode: 409 });
      }
      const packageFilename = `${submission.skill.id}.zip`;
      const uploaderName = submission.skill.uploaderName?.trim() || approval.uploaderName;
      const skill = sanitizeSkill({ ...submission.skill, uploaderName, files }, packageFilename, existing);
      skill.contributions = [...skill.contributions, { name: skill.uploaderName, version: skill.version, date: new Date().toISOString(), kind: existing ? "更新发布" : "首次发布" }];
      skill.featured = Boolean(existing?.featured);
      skill.files = files.slice(0, 100);
      await writeFile(join(PACKAGES_DIR, packageFilename), packageBytes);
      if (existingIndex >= 0) skills[existingIndex] = skill;
      else skills.push(skill);
      await writeSkills(skills);
      submissions.splice(submissionIndex, 1);
      await writeSubmissions(submissions);
      await removeFileIfPresent(pendingPath);
      return { existed: Boolean(existing), skill };
    });
    sendJson(response, result.existed ? 200 : 201, { success: true, skill: publicSkill(result.skill) });
    return true;
  }

  const submissionRejectMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-f0-9]{24})\/reject$/);
  if (request.method === "POST" && submissionRejectMatch) {
    if (!requireAdmin(request, response)) return true;
    await withDataMutation(async () => {
      const submissions = await readSubmissions();
      const submissionIndex = submissions.findIndex((item) => item.id === submissionRejectMatch[1]);
      if (submissionIndex < 0) {
        throw Object.assign(new Error("未找到该待审核提交"), { statusCode: 404 });
      }
      const [submission] = submissions.splice(submissionIndex, 1);
      await writeSubmissions(submissions);
      await removeFileIfPresent(join(SUBMISSIONS_DIR, basename(submission.package)));
    });
    sendJson(response, 200, { success: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/skills") {
    if (!requireAdmin(request, response)) return true;
    const body = await readJson(request);
    const { packageBytes, files } = decodePackageBase64(body.packageBase64);
    const result = await withDataMutation(async () => {
      const skills = await readSkills();
      const id = slug(body.id || body.name);
      const existingIndex = skills.findIndex((item) => item.id === id);
      const existing = existingIndex >= 0 ? skills[existingIndex] : null;
      const packageFilename = `${id}.zip`;
      const skill = sanitizeSkill({ ...body, files }, packageFilename, existing);
      skill.contributions = [...skill.contributions, { name: skill.uploaderName, version: skill.version, date: new Date().toISOString(), kind: existing ? "更新发布" : "首次发布" }];
      skill.files = files.slice(0, 100);
      await writeFile(join(PACKAGES_DIR, packageFilename), packageBytes);
      if (existingIndex >= 0) skills[existingIndex] = skill;
      else skills.push(skill);
      await writeSkills(skills);
      return { existed: Boolean(existing), skill };
    });
    sendJson(response, result.existed ? 200 : 201, { success: true, skill: publicSkill(result.skill) });
    return true;
  }

  const adminSkillMatch = url.pathname.match(/^\/api\/admin\/skills\/([a-z0-9-]+)$/);
  if (request.method === "PATCH" && adminSkillMatch) {
    if (!requireAdmin(request, response)) return true;
    const body = await readJson(request);
    const result = await withDataMutation(async () => {
      const skills = await readSkills();
      const index = skills.findIndex((item) => item.id === adminSkillMatch[1]);
      if (index < 0) throw Object.assign(new Error("未找到该已发布技能"), { statusCode: 404 });
      const existing = skills[index];
      const allowed = ["name", "description", "category", "roles", "tags", "author", "uploaderName", "version", "featured"];
      const changes = Object.fromEntries(allowed.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
      const skill = sanitizeSkill({ ...existing, ...changes, files: existing.files, tutorial: existing.tutorial, config: existing.config, examples: existing.examples, notes: existing.notes }, existing.package, existing);
      skill.downloads = Number(existing.downloads || 0);
      skill.updatedAt = new Date().toISOString().slice(0, 10);
      skills[index] = skill;
      await writeSkills(skills);
      return skill;
    });
    sendJson(response, 200, { success: true, skill: publicSkill(result) });
    return true;
  }

  const unpublishMatch = url.pathname.match(/^\/api\/admin\/skills\/([a-z0-9-]+)\/unpublish$/);
  if (request.method === "POST" && unpublishMatch) {
    if (!requireAdmin(request, response)) return true;
    const result = await withDataMutation(async () => {
      const skills = await readSkills();
      const index = skills.findIndex((item) => item.id === unpublishMatch[1]);
      if (index < 0) throw Object.assign(new Error("未找到该已发布技能"), { statusCode: 404 });
      const skill = skills[index];
      const sourcePackage = join(PACKAGES_DIR, basename(skill.package));
      await stat(sourcePackage).catch(() => { throw Object.assign(new Error("该技能包文件不存在，无法归档"), { statusCode: 404 }); });
      const archiveFilename = `${skill.id}-${Date.now()}.zip`;
      await copyFile(sourcePackage, join(ARCHIVE_DIR, archiveFilename));
      const archived = { ...skill, package: archiveFilename, archivedAt: new Date().toISOString() };
      const archivedSkills = await readArchivedSkills();
      archivedSkills.unshift(archived);
      await writeArchivedSkills(archivedSkills);
      skills.splice(index, 1);
      await writeSkills(skills);
      await removeFileIfPresent(sourcePackage);
      return archived;
    });
    sendJson(response, 200, { success: true, skill: publicSkill(result) });
    return true;
  }

  const restoreMatch = url.pathname.match(/^\/api\/admin\/archived-skills\/([a-z0-9-]+)\/restore$/);
  if (request.method === "POST" && restoreMatch) {
    if (!requireAdmin(request, response)) return true;
    const result = await withDataMutation(async () => {
      const archivedSkills = await readArchivedSkills();
      const index = archivedSkills.findIndex((item) => item.id === restoreMatch[1]);
      if (index < 0) throw Object.assign(new Error("未找到该归档技能"), { statusCode: 404 });
      const archived = archivedSkills[index];
      const skills = await readSkills();
      if (skills.some((item) => item.id === archived.id)) throw Object.assign(new Error("该技能 ID 已重新发布，请先处理当前版本"), { statusCode: 409 });
      const archivePackage = join(ARCHIVE_DIR, basename(archived.package));
      await stat(archivePackage).catch(() => { throw Object.assign(new Error("归档技能包文件不存在"), { statusCode: 404 }); });
      const skill = { ...archived, package: `${archived.id}.zip`, archivedAt: undefined, updatedAt: new Date().toISOString().slice(0, 10) };
      await copyFile(archivePackage, join(PACKAGES_DIR, skill.package));
      skills.push(skill);
      await writeSkills(skills);
      archivedSkills.splice(index, 1);
      await writeArchivedSkills(archivedSkills);
      await removeFileIfPresent(archivePackage);
      return skill;
    });
    sendJson(response, 200, { success: true, skill: publicSkill(result) });
    return true;
  }

  return false;
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const relativePath = decodeURIComponent(requested).replace(/^[/\\]+/, "");
  const filePath = resolve(PUBLIC_DIR, relativePath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${sep}`)) {
    sendError(response, 403, "禁止访问");
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    sendError(response, 404, "页面不存在");
    return;
  }
  if (!fileStat.isFile()) {
    sendError(response, 404, "页面不存在");
    return;
  }
  response.writeHead(200, {
    "Content-Type": MIME_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "Content-Length": fileStat.size,
    "Cache-Control": [".html", ".md", ".txt", ".json"].includes(extname(filePath)) ? "no-cache" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(response);
}

await Promise.all([
  mkdir(PACKAGES_DIR, { recursive: true }),
  mkdir(SUBMISSIONS_DIR, { recursive: true }),
  mkdir(ARCHIVE_DIR, { recursive: true }),
]);

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/mcp") {
      const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
      const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || `127.0.0.1:${PORT}`).split(",")[0].trim();
      const configuredBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
      const derivedBaseUrl = /^(https?):\/\//i.test(configuredBaseUrl)
        ? configuredBaseUrl
        : `${forwardedProtocol === "https" ? "https" : "http"}://${forwardedHost}`;
      await handleSkillMcpRequest(request, response, {
        baseUrl: derivedBaseUrl,
        clientAddress: clientAddress(request),
        readJson,
        readSkills: async () => (await readSkills()).map(publicSkill),
        submitSkill: createSubmission,
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (!(await handleApi(request, response, url))) sendError(response, 404, "API 不存在");
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      sendError(response, 405, "请求方法不支持");
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendError(response, error?.statusCode || 500, error?.message || "服务器内部错误");
    else response.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Jinli skill platform listening on http://0.0.0.0:${PORT}`);
});
