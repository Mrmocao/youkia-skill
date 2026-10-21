# 天上友嘉 · 锦鲤云公共技能平台

公司内部共享 Agent 技能平台，支持技能检索、教程展示、ZIP 下载、公开投稿和管理员审核发布。团队成员可以自主提交新技能或优化版本，共同维护公共技能库；投稿由莫超统一审批更新。兼容 MCP Streamable HTTP，Codex、OpenCode 等客户端可直接检索、读取和投稿技能。

平台管理员权限仅限内部维护人员。普通用户和 Agent 只拥有公开检索、详情读取、ZIP 下载和投稿权限，投稿内容在莫超审批前不会进入公共目录。

## 共同维护

使用中发现问题或改进空间时，可从技能详情页点击“提交此技能优化”，自动带入原技能资料。沿用技能 ID、提高版本号，补充本次改动和验证结果，再上传完整 ZIP。提交成功后联系莫超并提供审核编号，由莫超审批后更新发布；优化建议也可直接反馈给莫超。

平台记录每次投稿的基线版本和贡献说明。如果投稿期间原技能已经更新，审批会拒绝覆盖，提交人需合并最新内容后重新投稿。普通投稿不需要管理员账号，管理人员通过内部 `/#admin` 链接进入密码保护的审核中心。

## Run locally

```powershell
Copy-Item .env.example .env
node server.mjs
```

Open `http://localhost:8088`. Set `ADMIN_PASSWORD` before using the review center.

## MCP

MCP endpoint:

```text
http://SERVER_IP/mcp
```

Codex:

```bash
codex mcp add jinliSkillPlatform --url http://SERVER_IP/mcp
```

Equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.jinliSkillPlatform]
url = "http://SERVER_IP/mcp"
```

OpenCode `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jinli-skill-platform": {
      "type": "remote",
      "url": "http://SERVER_IP/mcp",
      "enabled": true
    }
  }
}
```

The MCP server exposes `search_skills`, `get_skill`, and `submit_skill`, plus the `skillroom://catalog` resource. `submit_skill` accepts a Base64 ZIP for a new skill or an improvement and always creates a pending submission; it never publishes directly or grants administrator access.

## Deploy

```bash
cp .env.example .env
docker compose up -d --build
```

Set `SKILLROOM_HOST` to a DNS name pointing at the server. Caddy obtains and renews HTTPS certificates automatically; ports 80 and 443 must be reachable.

Port 8443 also maps to HTTPS for networks that intercept unregistered domains on standard web ports.

The direct fallback URL is `http://SERVER_IP:8088` when wildcard DNS names are blocked by the client network.

Set `PUBLIC_BASE_URL` to the externally reachable origin so MCP responses return correct detail and download URLs.

The administrator review center also manages the published catalog. It can create a new published skill, edit display metadata, unpublish a skill into a recoverable archive, and restore an archived skill. Updating the actual ZIP contents should continue through a new version submission so the review baseline and package inspection remain visible.

The `data` directory contains the public catalog, pending submissions, archived skills, and ZIP packages. Keep `.env` private and do not put API keys in skill packages. Back up `data/skills.json`, `data/submissions.json`, `data/archived-skills.json`, `data/packages/`, `data/submissions/`, and `data/archive/` together.

## Scheduled backups

The optional `scripts/backup-to-github.mjs` creates a sanitized snapshot and pushes it to a private GitHub repository. It excludes `.env` and runtime secrets. On the server, configure the following variables without putting the token in this repository:

```bash
export BACKUP_GITHUB_REPO=https://github.com/ORG/PRIVATE-REPO.git
export BACKUP_GITHUB_TOKEN=github_pat_xxx
export DATA_DIR=/opt/skillroom/data
node /opt/skillroom/scripts/backup-to-github.mjs
```

Run it from cron, for example every night at 03:20:

```cron
20 3 * * * . /etc/skillroom/backup.env && /usr/bin/node /opt/skillroom/scripts/backup-to-github.mjs >> /var/log/skillroom-backup.log 2>&1
```

For a lower-risk alternative, use a server-side daily `tar.zst` or `rsync` snapshot to a second disk/NAS and keep 7–30 daily versions. This avoids placing internal submission metadata in GitHub; GitHub is convenient for version history, while a separate snapshot is better for disaster recovery.

Direct-IP HTTP does not encrypt MCP submissions or administrator login traffic. Use HTTPS before sending sensitive metadata, and never include secrets in a skill ZIP.
