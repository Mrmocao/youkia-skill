#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(process.env.DATA_DIR || join(root, "data"));
const repository = String(process.env.BACKUP_GITHUB_REPO || "").trim();
const token = String(process.env.BACKUP_GITHUB_TOKEN || "").trim();
const branch = String(process.env.BACKUP_GITHUB_BRANCH || "main").trim();
const tempRoot = resolve(process.env.BACKUP_TEMP_DIR || "/tmp", `skillroom-backup-${Date.now()}`);

if (!repository || !token) {
  console.error("配置 BACKUP_GITHUB_REPO 和 BACKUP_GITHUB_TOKEN 后再运行备份。");
  process.exit(2);
}
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(repository)) {
  console.error("BACKUP_GITHUB_REPO 必须是 https://github.com/组织/仓库.git 地址。");
  process.exit(2);
}

const askpass = join(tempRoot, "askpass.sh");
const gitEnv = {
  ...process.env,
  GIT_ASKPASS: askpass,
  GIT_USERNAME: "x-access-token",
  GIT_TERMINAL_PROMPT: "0",
};

function git(args) {
  return execFileSync("git", args, { cwd: tempRoot, env: gitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function clearWorkingTree() {
  for (const entry of await readdir(tempRoot)) {
    if (entry !== ".git") await rm(join(tempRoot, entry), { recursive: true, force: true });
  }
}

async function hashFile(path) {
  const bytes = await (await import("node:fs/promises")).readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

try {
  await mkdir(tempRoot, { recursive: true });
  await writeFile(askpass, "#!/bin/sh\nprintf '%s' \"$BACKUP_GITHUB_TOKEN\"\n", { mode: 0o700 });
  await chmod(askpass, 0o700);
  git(["init", "--quiet", "-b", branch]);
  git(["remote", "add", "origin", repository]);
  try {
    git(["fetch", "--quiet", "--depth", "1", "origin", branch]);
    git(["checkout", "--quiet", "-B", branch, `FETCH_HEAD`]);
  } catch {
    git(["checkout", "--quiet", "-B", branch]);
  }
  await clearWorkingTree();

  const included = ["skills.json", "submissions.json", "archived-skills.json", "packages", "submissions", "archive"];
  const copied = [];
  for (const entry of included) {
    const source = join(dataDir, entry);
    try {
      await cp(source, join(tempRoot, entry), { recursive: true, force: true });
      copied.push(entry);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const manifest = { generatedAt: new Date().toISOString(), source: "skillroom/data", entries: copied, note: "Generated backup; .env and runtime secrets are intentionally excluded." };
  await writeFile(join(tempRoot, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  git(["config", "user.name", "Skillroom Backup"]);
  git(["config", "user.email", "skillroom-backup@noreply.local"]);
  git(["add", "-A"]);
  const status = git(["status", "--porcelain"]);
  if (!status) {
    console.log("BACKUP_UNCHANGED");
    process.exit(0);
  }
  git(["commit", "--quiet", "-m", `Backup skillroom data ${new Date().toISOString()}`]);
  git(["push", "--quiet", "origin", `HEAD:${branch}`]);
  console.log(JSON.stringify({ success: true, branch, entries: copied }));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
