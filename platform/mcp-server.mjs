import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

const MAX_PACKAGE_BASE64_LENGTH = Math.ceil((30 * 1024 * 1024) / 3) * 4 + 4;
const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function toolResult(value, message) {
  return {
    content: [{ type: "text", text: message ? `${message}\n\n${jsonText(value)}` : jsonText(value) }],
    structuredContent: value,
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: "text", text: `操作失败：${error?.message || "未知错误"}` }],
  };
}

function skillWithLinks(skill, baseUrl) {
  return {
    ...skill,
    detail_url: `${baseUrl}/#skill/${encodeURIComponent(skill.id)}`,
    download_url: `${baseUrl}/api/skills/${encodeURIComponent(skill.id)}/download`,
  };
}

function installCommands(skill, baseUrl) {
  const downloadUrl = `${baseUrl}/api/skills/${encodeURIComponent(skill.id)}/download`;
  return {
    windows_powershell: `$zip = Join-Path $env:TEMP "${skill.id}.zip"; Invoke-WebRequest "${downloadUrl}" -OutFile $zip; Expand-Archive $zip -DestinationPath (Join-Path $env:USERPROFILE ".codex\\skills") -Force`,
    macos_linux: `curl -fL "${downloadUrl}" -o "/tmp/${skill.id}.zip" && unzip -o "/tmp/${skill.id}.zip" -d "$HOME/.codex/skills"`,
    final_step: "退出并重启 Agent 客户端或新建会话，使新技能进入索引。",
  };
}

export async function createSkillMcpServer({ baseUrl, clientAddress, readSkills, submitSkill }) {
  const server = new McpServer({
    name: "jinli-cloud-skill-platform",
    title: "天上友嘉 · 锦鲤云公共技能平台",
    version: "2.2.0",
  }, {
    instructions: "这是公司的共享 Agent 技能平台，用于发现、读取和提交技能。鼓励大家提交更好的提示词、配置、脚本和教程共同迭代；所有提交都会进入审核队列，由莫超统一审批更新，不会直接公开。MCP 用户只有搜索、读取和投稿权限，不拥有管理员审核或发布权限。",
  });

  server.registerTool("search_skills", {
    title: "搜索公共技能",
    description: "搜索锦鲤云平台中已审核发布的技能。可按关键词和分类筛选，返回详情页与 ZIP 下载地址。",
    inputSchema: {
      query: z.string().trim().max(200).optional().describe("技能名称、用途、作者或标签关键词"),
      category: z.string().trim().max(40).optional().describe("可选分类，例如媒体生成、开发工具、数据分析"),
      limit: z.number().int().min(1).max(100).default(30).describe("最多返回多少条，默认 30"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ query = "", category = "", limit = 30 }) => {
    const normalizedQuery = query.toLowerCase();
    const skills = (await readSkills())
      .filter((skill) => !category || skill.category === category)
      .filter((skill) => {
        if (!normalizedQuery) return true;
        return [skill.name, skill.description, skill.category, skill.author, ...(skill.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((first, second) => Number(Boolean(second.featured)) - Number(Boolean(first.featured))
        || Number(second.downloads || 0) - Number(first.downloads || 0))
      .slice(0, limit)
      .map((skill) => skillWithLinks(skill, baseUrl));

    return toolResult({ count: skills.length, skills });
  });

  server.registerTool("get_skill", {
    title: "读取技能详情",
    description: "读取一个已发布技能的教程、配置、下载地址和跨平台安装命令。",
    inputSchema: {
      id: z.string().regex(SKILL_ID_PATTERN).max(100).describe("技能 ID，例如 grok-imagine-subapi"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ id }) => {
    const skill = (await readSkills()).find((item) => item.id === id);
    if (!skill) return toolError(new Error(`未找到技能：${id}`));
    const result = {
      skill: skillWithLinks(skill, baseUrl),
      install: installCommands(skill, baseUrl),
    };
    return {
      ...toolResult(result),
      content: [
        { type: "text", text: jsonText(result) },
        {
          type: "resource_link",
          uri: result.skill.download_url,
          name: `${skill.name} v${skill.version}`,
          description: "已审核技能 ZIP 安装包",
          mimeType: "application/zip",
        },
      ],
    };
  });

  server.registerTool("submit_skill", {
    title: "提交技能审核",
    description: "把本地技能 ZIP 以 Base64 提交到锦鲤云审核队列，适合提交新技能或已有技能的优化版本。ZIP 必须包含 SKILL.md，且不得包含 API Key、密码、config.local.json、.env 或私钥。提交后由莫超审批更新，不会直接公开；此工具不会授予管理员权限。",
    inputSchema: {
      id: z.string().regex(SKILL_ID_PATTERN).max(100).describe("小写英文、数字和连字符组成的技能 ID"),
      name: z.string().trim().min(1).max(100).describe("技能名称"),
      version: z.string().trim().min(1).max(40).default("1.0.0").describe("技能版本"),
      category: z.string().trim().min(1).max(40).default("其他").describe("技能分类"),
      description: z.string().trim().min(1).max(1000).describe("一句话说明用途和适用场景"),
      author: z.string().trim().min(1).max(80).describe("作者或团队"),
      uploader_name: z.string().trim().max(80).optional().describe("上传人员名称，可选，显示在技能详情页"),
      submitter: z.string().trim().min(1).max(80).describe("提交人"),
      contact: z.string().trim().min(1).max(160).describe("钉钉、邮箱或企业微信等审核联系方式"),
      base_version: z.string().trim().max(40).optional().describe("优化已有技能时，填写 get_skill 返回的当前版本号；版本过期将拒绝提交"),
      change_summary: z.string().trim().max(2000).optional().describe("说明解决的问题、改动内容和验证结果，帮助莫超审批"),
      tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]).describe("最多 12 个标签"),
      tutorial: z.array(z.object({
        title: z.string().trim().min(1).max(100),
        body: z.string().trim().min(1).max(2000),
      })).min(1).max(12).describe("安装、配置、自测等步骤"),
      config_path: z.string().trim().max(160).default("config.local.json").describe("可选配置文件路径"),
      config_example: z.string().max(10000).default("").describe("仅含占位符的配置示例，不得包含真实密钥"),
      examples: z.array(z.object({
        label: z.string().trim().min(1).max(100),
        command: z.string().trim().min(1).max(4000),
      })).max(20).default([]).describe("常用命令示例"),
      package_base64: z.string().min(4).max(MAX_PACKAGE_BASE64_LENGTH).describe("技能 ZIP 文件的纯 Base64 内容，不要包含 data: 前缀"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (input) => {
    try {
      const submission = await submitSkill({
        id: input.id,
        name: input.name,
        version: input.version,
        category: input.category,
        description: input.description,
        author: input.author,
        uploaderName: input.uploader_name,
        submitter: input.submitter,
        contact: input.contact,
        baseVersion: input.base_version,
        changeSummary: input.change_summary,
        tags: input.tags,
        tutorial: input.tutorial,
        config: {
          path: input.config_path,
          fields: [],
          example: input.config_example,
        },
        examples: input.examples,
        packageBase64: input.package_base64,
      }, clientAddress);
      return toolResult({
        submission_id: submission.id,
        status: submission.status,
        review_ticket: submission.id.slice(-8).toUpperCase(),
      }, "技能已提交莫超审核；批准前不会出现在公共技能目录中，投稿不会获得管理员权限。");
    } catch (error) {
      return toolError(error);
    }
  });

  const catalogUri = "skillroom://catalog";
  server.registerResource("skill-catalog", catalogUri, {
    title: "锦鲤云公共技能目录",
    description: "平台当前已审核发布的全部技能及其下载地址",
    mimeType: "application/json",
  }, async () => ({
    contents: [{
      uri: catalogUri,
      mimeType: "application/json",
      text: jsonText((await readSkills()).map((skill) => skillWithLinks(skill, baseUrl))),
    }],
  }));

  for (const skill of await readSkills()) {
    const resourceUri = `skillroom://skills/${skill.id}`;
    server.registerResource(`skill-${skill.id}`, resourceUri, {
      title: skill.name,
      description: skill.description,
      mimeType: "application/json",
    }, async () => ({
      contents: [{
        uri: resourceUri,
        mimeType: "application/json",
        text: jsonText({ skill: skillWithLinks(skill, baseUrl), install: installCommands(skill, baseUrl) }),
      }],
    }));
  }

  return server;
}

export async function handleSkillMcpRequest(request, response, context) {
  if (request.method !== "POST") {
    response.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Allow: "POST",
    });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use MCP Streamable HTTP POST." },
      id: null,
    }));
    return;
  }

  const body = await context.readJson(request);
  const server = await createSkillMcpServer(context);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  response.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
