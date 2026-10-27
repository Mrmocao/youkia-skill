import { profileFor, renderSkillHelp, renderHelpCenter, clientInstructions } from "./onboarding.js?v=2.5.0";

const state = {
  skills: [],
  submissions: [],
  publishedSkills: [],
  archivedSkills: [],
  query: "",
  category: "全部",
  sort: "featured",
  currentView: "library",
  currentSkill: null,
  mcpClient: "codex",
  authenticated: false,
  helpClient: "codex",
};

const libraryView = document.querySelector("#library-view");
const detailView = document.querySelector("#detail-view");
const guideView = document.querySelector("#guide-view");
const mcpView = document.querySelector("#mcp-view");
const skillsGrid = document.querySelector("#skills-grid");
const emptyState = document.querySelector("#empty-state");
const resultMeta = document.querySelector("#results-meta");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const categoryTabs = document.querySelector("#category-tabs");
const skillCount = document.querySelector("#skill-count");
const categoryCount = document.querySelector("#category-count");
const submitDialog = document.querySelector("#submit-dialog");
const submissionForm = document.querySelector("#submission-form");
const submissionStatus = document.querySelector("#submission-status");
const submissionPackageInput = document.querySelector("#submission-package-input");
const submissionPackageLabel = document.querySelector("#submission-package-label");
const adminDialog = document.querySelector("#admin-dialog");
const adminSkillDialog = document.querySelector("#admin-skill-dialog");
const adminSkillForm = document.querySelector("#admin-skill-form");
const adminSkillDialogTitle = document.querySelector("#admin-skill-dialog-title");
const adminPackageInput = document.querySelector("#admin-package-input");
const adminPackageLabel = document.querySelector("#admin-package-label");
const loginForm = document.querySelector("#login-form");
const reviewPanel = document.querySelector("#review-panel");
const reviewList = document.querySelector("#review-list");
const reviewCount = document.querySelector("#review-count");
const pendingBadge = document.querySelector("#pending-badge");
const publishedList = document.querySelector("#published-list");
const archivedList = document.querySelector("#archived-list");
const publishedCount = document.querySelector("#published-count");
const archivedCount = document.querySelector("#archived-count");
const toastRegion = document.querySelector("#toast-region");

const iconForCategory = {
  媒体生成: "sparkles",
  开发工具: "code-2",
  数据分析: "bar-chart-3",
  内容生产: "pen-line",
  团队效率: "users",
  其他: "wrench",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatDate(value, includeTime = false) {
  if (!value) return "未记录日期";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", includeTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast${type === "error" ? " is-error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4600);
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || `请求失败（${response.status}）`);
  return body;
}

async function loadSkills() {
  skillsGrid.innerHTML = '<div class="loading-line grid-full-span"></div>';
  try {
    const body = await api("/api/skills");
    state.skills = Array.isArray(body.skills) ? body.skills : [];
    skillCount.textContent = formatNumber(state.skills.length);
    categoryCount.textContent = formatNumber(new Set(state.skills.map((skill) => skill.category).filter(Boolean)).size);
    renderCategories();
    renderLibrary();
  } catch (error) {
    skillsGrid.innerHTML = `<div class="empty-state grid-full-span"><i data-lucide="wifi-off"></i><h2>技能平台暂时不可用</h2><p>${escapeHtml(error.message)}</p></div>`;
    refreshIcons();
  }
}

function categories() {
  return ["全部", ...new Set(state.skills.map((skill) => skill.category).filter(Boolean))];
}

function renderCategories() {
  categoryTabs.innerHTML = categories().map((category) => `
    <button type="button" class="category-tab${state.category === category ? " is-active" : ""}" data-category="${escapeAttribute(category)}" role="tab" aria-selected="${state.category === category}">
      ${escapeHtml(category)}
      <span>${formatNumber(category === "全部" ? state.skills.length : state.skills.filter((skill) => skill.category === category).length)}</span>
    </button>
  `).join("");
}

function filteredSkills() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.skills.filter((skill) => {
    if (state.category !== "全部" && skill.category !== state.category) return false;
    if (!query) return true;
    const haystack = [skill.name, skill.description, skill.category, skill.author, profileFor(skill).purpose, ...(skill.tags || [])].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return filtered.sort((first, second) => {
    if (state.sort === "updated") return String(second.updatedAt).localeCompare(String(first.updatedAt));
    if (state.sort === "downloads") return Number(second.downloads || 0) - Number(first.downloads || 0);
    if (state.sort === "name") return String(first.name).localeCompare(String(second.name), "zh-CN");
    return Number(Boolean(second.featured)) - Number(Boolean(first.featured)) || Number(second.downloads || 0) - Number(first.downloads || 0);
  });
}

function toneForCategory(category) {
  if (category === "媒体生成") return "cyan";
  if (category === "内容生产") return "amber";
  if (category === "团队效率") return "teal";
  if (category === "数据分析") return "indigo";
  return "blue";
}

function renderCard(skill) {
  const icon = iconForCategory[skill.category] || "box";
  const tone = toneForCategory(skill.category);
  const tags = (skill.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  return `
    <article class="skill-card" tabindex="0" role="button" data-skill-id="${escapeAttribute(skill.id)}" aria-label="查看 ${escapeAttribute(skill.name)}">
      <div class="skill-visual" data-tone="${tone}">
        <span class="visual-category">${escapeHtml(skill.category || "其他")}</span>
        <span class="visual-icon"><i data-lucide="${icon}"></i></span>
        <span class="visual-version">v${escapeHtml(skill.version || "1.0.0")}</span>
      </div>
      <div class="skill-card-body">
        <div class="card-title-row">
          <h2 class="card-title">${escapeHtml(skill.name)}</h2>
          <i data-lucide="arrow-up-right"></i>
        </div>
        <p class="card-description">${escapeHtml(skill.description)}</p>
        <div class="tags">${tags || `<span class="tag">${escapeHtml(skill.category || "其他")}</span>`}</div>
        <p class="card-start-label">查看用途 · 安装 · 配置与反馈 →</p>
        <div class="card-footer">
          <span class="card-author"><i data-lucide="user-round"></i>${escapeHtml(skill.author || "内部贡献者")}</span>
          <span class="card-metric"><i data-lucide="download"></i>${formatNumber(skill.downloads)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderLibrary() {
  const items = filteredSkills();
  resultMeta.textContent = state.query || state.category !== "全部"
    ? `找到 ${formatNumber(items.length)} 个匹配技能`
    : `全部技能 · ${formatNumber(items.length)} 个`;
  emptyState.hidden = items.length !== 0;
  skillsGrid.innerHTML = items.map(renderCard).join("");
  refreshIcons();
}

function showView(view) {
  state.currentView = view;
  libraryView.hidden = view !== "library";
  detailView.hidden = view !== "detail";
  guideView.hidden = view !== "guide";
  mcpView.hidden = view !== "mcp";
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === view || (view === "detail" && button.dataset.nav === "library"));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openDetail(id) {
  try {
    const body = await api(`/api/skills/${encodeURIComponent(id)}`);
    state.currentSkill = body.skill;
    renderDetail(body.skill);
    showView("detail");
  } catch (error) {
    toast(error.message, "error");
    showView("library");
  }
}

function navigate(route = "") {
  const nextHash = route ? `#${route}` : "";
  if (window.location.hash === nextHash) {
    handleRoute();
    return;
  }
  window.location.hash = nextHash;
}

async function handleRoute() {
  const route = window.location.hash.slice(1);
  if (route.startsWith("skill/")) {
    let id = "";
    try {
      id = decodeURIComponent(route.slice("skill/".length));
    } catch {
      toast("技能链接格式无效", "error");
    }
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      await openDetail(id);
      return;
    }
  }
  if (route === "guide" || route.startsWith("guide/")) {
    renderGuide(route.split("/")[1]);
    showView("guide");
    return;
  }
  if (route === "admin") {
    openAdmin();
    return;
  }
  if (route === "mcp") {
    renderMcp();
    showView("mcp");
    return;
  }
  showView("library");
}

function codeBlock(label, code) {
  if (!code) return "";
  return `
    <div class="code-block">
      <div class="code-label"><span>${escapeHtml(label)}</span><button class="code-copy" type="button" data-copy="${escapeAttribute(code)}" aria-label="复制${escapeAttribute(label)}"><i data-lucide="copy"></i></button></div>
      <pre>${escapeHtml(code)}</pre>
    </div>
  `;
}

function renderDetail(skill) {
  const icon = iconForCategory[skill.category] || "box";
  const tutorial = (skill.tutorial || []).map((step, index) => `
    <div class="step">
      <span class="step-number">${index + 1}</span>
      <div><h3>${escapeHtml(step.title || `步骤 ${index + 1}`)}</h3><p>${escapeHtml(step.body)}</p></div>
    </div>
  `).join("");
  const examples = (skill.examples || []).map((example) => codeBlock(example.label || "命令", example.command)).join("");
  const notes = (skill.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const files = (skill.files || []).map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join("");
  const configFields = (skill.config?.fields || []).map((field) => `<tr><td><code>${escapeHtml(field.key)}</code></td><td>${escapeHtml(field.type)}</td><td>${escapeHtml(field.description)}</td></tr>`).join("");
  const configTable = configFields ? `<table class="config-table"><thead><tr><th>字段</th><th>类型</th><th>用途</th></tr></thead><tbody>${configFields}</tbody></table>` : "";

  detailView.innerHTML = `
    <div class="detail-breadcrumb"><button class="back-button" type="button" data-action="back-library"><i data-lucide="arrow-left"></i>返回技能广场</button></div>
    <header class="detail-header">
      <span class="detail-icon" data-tone="${toneForCategory(skill.category)}"><i data-lucide="${icon}"></i></span>
      <div class="detail-title">
        <p class="eyebrow">${escapeHtml(skill.category || "其他")}</p>
        <h1>${escapeHtml(skill.name)}</h1>
        <p class="intro">${escapeHtml(skill.description)}</p>
        <div class="detail-meta">
          <span><i data-lucide="user-round"></i>${escapeHtml(skill.author || "内部贡献者")}</span>
          ${skill.uploaderName ? `<span><i data-lucide="upload"></i>上传人：${escapeHtml(skill.uploaderName)}</span>` : ""}
          <span><i data-lucide="git-branch"></i>v${escapeHtml(skill.version || "1.0.0")}</span>
          <span><i data-lucide="calendar-days"></i>${escapeHtml(formatDate(skill.updatedAt))} 更新</span>
        </div>
      </div>
      <div class="detail-actions"><a class="button button-primary" href="/api/skills/${encodeURIComponent(skill.id)}/download"><i data-lucide="download"></i>下载技能包</a><button class="button button-secondary" type="button" data-action="improve-skill"><i data-lucide="git-pull-request"></i>提交此技能优化</button></div>
    </header>

    ${renderSkillHelp(skill, escapeHtml, codeBlock)}
    <div class="detail-band">
      <div class="detail-layout">
        <div class="detail-main">
          <section class="detail-section"><h2>安装与使用</h2><div class="steps">${tutorial || '<p class="guide-copy">暂无教程，请联系发布者补充。</p>'}</div></section>
          <section class="detail-section"><h2>配置方案</h2><p class="guide-copy">具体以包内 SKILL.md 为准；有些技能通过本机登录窗口或 state 保存配置。</p>${skill.config?.example && skill.config.example !== "{}" && skill.config?.path ? `<p class="guide-copy">发布者提供的配置位置：<code>${escapeHtml(skill.config.path)}</code></p>` : ""}${configTable}${skill.config?.example && skill.config.example !== "{}" ? codeBlock("配置示例", skill.config.example) : '<p class="guide-copy">未提供通用配置示例，请按上方教程完成配置或登录。</p>'}</section>
          <section class="detail-section"><h2>常用命令</h2>${examples || '<p class="guide-copy">暂无命令示例。</p>'}</section>
        </div>
        <aside class="detail-aside">
          <div class="side-panel"><h3>技能信息</h3><dl class="metadata-list"><div class="metadata-row"><dt>技能 ID</dt><dd><code>${escapeHtml(skill.id)}</code></dd></div><div class="metadata-row"><dt>下载次数</dt><dd>${formatNumber(skill.downloads)}</dd></div>${skill.uploaderName ? `<div class="metadata-row"><dt>上传人员</dt><dd>${escapeHtml(skill.uploaderName)}</dd></div>` : ""}<div class="metadata-row"><dt>标签</dt><dd>${escapeHtml((skill.tags || []).join(" · ") || "未设置")}</dd></div></dl></div>
          <div class="side-panel"><h3>包内文件</h3><ul class="file-list">${files || "<li>未登记文件清单</li>"}</ul></div>
          <div class="side-panel"><h3>发布须知</h3><ul class="note-list">${notes || "<li>请先阅读技能包内的 SKILL.md。</li>"}</ul></div>
          <div class="side-panel"><h3>一起迭代</h3><p class="guide-copy">欢迎改进脚本、提示词与教程。沿用技能 ID、提高版本号并填写优化说明，提交后联系莫超，提供审核编号，由莫超审批更新。</p></div>
        </aside>
      </div>
    </div>
  `;
  refreshIcons();
}

function renderGuide(topic) {
  guideView.innerHTML = renderHelpCenter(topic, escapeHtml, codeBlock);
  renderHelpClient();
  refreshIcons();
}

function renderHelpClient() {
  const content = document.querySelector("#help-client-content");
  if (!content) return;
  content.innerHTML = clientInstructions(state.helpClient, codeBlock);
  guideView.querySelectorAll("[data-help-client]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.helpClient === state.helpClient));
  });
  refreshIcons();
}

function renderMcp() {
  const endpoint = `${window.location.origin}/mcp`;
  const codexCommand = `codex mcp add jinliSkillPlatform --url ${endpoint}`;
  const codexConfig = `[mcp_servers.jinliSkillPlatform]\nurl = "${endpoint}"`;
  const openCodeConfig = JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    mcp: {
      "jinli-skill-platform": {
        type: "remote",
        url: endpoint,
        enabled: true,
      },
    },
  }, null, 2);
  const clientConfig = state.mcpClient === "codex"
    ? `${codeBlock("Codex 命令", codexCommand)}${codeBlock("~/.codex/config.toml", codexConfig)}`
    : codeBlock("opencode.json", openCodeConfig);
  const prompts = [
    "使用锦鲤云技能平台搜索图片生成技能，并告诉我安装步骤。",
    "读取 grok-imagine-subapi 的详情，下载并安装到我的全局技能目录。",
    "把本地 ./my-skill.zip 提交到锦鲤云审核，作者是研发工具组，联系方式是我的公司邮箱。",
  ];

  mcpView.innerHTML = `
    <header class="mcp-header">
      <div>
        <p class="eyebrow">AGENT CONNECTION</p>
        <h1>让 Agent 直接使用技能平台</h1>
        <p class="intro">这是公司的共享技能平台。Codex、OpenCode 等兼容 MCP 的客户端可以搜索、安装和投稿，优化内容会由莫超审批后更新到公共目录。</p>
      </div>
      <div class="mcp-protocol"><i data-lucide="radio-tower"></i><span><strong>Streamable HTTP</strong><small>公开读取 · 投稿需审核</small></span></div>
    </header>

    <div class="mcp-endpoint" aria-label="MCP 服务地址">
      <div><span>MCP Endpoint</span><code>${escapeHtml(endpoint)}</code></div>
      <button class="icon-button" type="button" data-copy="${escapeAttribute(endpoint)}" aria-label="复制 MCP 地址" title="复制 MCP 地址"><i data-lucide="copy"></i></button>
    </div>

    <div class="mcp-layout">
      <div class="mcp-main">
        <section class="mcp-section">
          <div class="mcp-section-head"><span class="mcp-section-icon"><i data-lucide="cable"></i></span><div><p class="eyebrow">01 · CONNECT</p><h2>选择客户端并接入</h2></div></div>
          <div class="mcp-client-tabs" role="tablist" aria-label="Agent 客户端">
            <button class="${state.mcpClient === "codex" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.mcpClient === "codex"}" data-mcp-client="codex">Codex</button>
            <button class="${state.mcpClient === "opencode" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.mcpClient === "opencode"}" data-mcp-client="opencode">OpenCode</button>
          </div>
          <div class="mcp-client-config">${clientConfig}</div>
          <p class="mcp-footnote">保存配置后，新建 Agent 会话或重启客户端，使 MCP 工具进入当前工具列表。投稿工具只进入审核队列，不会获得管理员权限。</p>
        </section>

        <section class="mcp-section">
          <div class="mcp-section-head"><span class="mcp-section-icon"><i data-lucide="wrench"></i></span><div><p class="eyebrow">02 · TOOLS</p><h2>可调用工具</h2></div></div>
          <div class="mcp-tool-list">
            <div class="mcp-tool-row"><code>search_skills</code><p>按名称、用途、作者、标签或分类搜索已审核发布的技能。</p><span>只读</span></div>
            <div class="mcp-tool-row"><code>get_skill</code><p>读取教程、配置字段、下载地址，以及 Windows 和 macOS / Linux 安装命令。</p><span>只读</span></div>
            <div class="mcp-tool-row"><code>submit_skill</code><p>把包含 SKILL.md 的 ZIP 提交审核；批准前不会出现在公共目录。</p><span class="is-write">投稿</span></div>
          </div>
        </section>

        <section class="mcp-section">
          <div class="mcp-section-head"><span class="mcp-section-icon"><i data-lucide="route"></i></span><div><p class="eyebrow">03 · WORKFLOW</p><h2>从发现到发布</h2></div></div>
          <ol class="mcp-flow">
            <li><span>1</span><strong>搜索</strong><small>Agent 查询公共目录</small></li>
            <li><span>2</span><strong>安装</strong><small>读取详情并下载 ZIP</small></li>
            <li><span>3</span><strong>投稿</strong><small>提交本地技能包</small></li>
            <li><span>4</span><strong>审批</strong><small>管理员检查后发布</small></li>
          </ol>
        </section>
      </div>

      <aside class="mcp-aside">
        <section class="mcp-aside-section">
          <h2>可以直接这样说</h2>
          <div class="mcp-prompt-list">
            ${prompts.map((prompt) => `<div class="mcp-prompt"><p>${escapeHtml(prompt)}</p><button class="code-copy" type="button" data-copy="${escapeAttribute(prompt)}" aria-label="复制示例提示词" title="复制示例提示词"><i data-lucide="copy"></i></button></div>`).join("")}
          </div>
        </section>
        <section class="mcp-aside-section">
          <h2>投稿要求</h2>
          <ul class="note-list">
            <li>ZIP 包不超过 30 MB，且必须包含 <code>SKILL.md</code>。</li>
            <li>不要包含 API Key、密码、<code>.env</code>、私钥或本地配置。</li>
            <li>所有 Agent 投稿与网页投稿共用同一审核队列，由莫超审批更新。</li>
            <li>平台管理员权限仅限内部维护人员，投稿者不会获得审核或发布权限。</li>
          </ul>
          <button class="button button-secondary mcp-web-upload" type="button" data-action="open-submit"><i data-lucide="upload-cloud"></i>改用网页投稿</button>
        </section>
        <section class="mcp-security-note">
          <i data-lucide="shield-alert"></i>
          <div><strong>当前为 HTTP 直连</strong><p>不要通过 MCP 或网页上传任何真实密钥。管理员登录建议后续切换到 HTTPS。</p></div>
        </section>
      </aside>
    </div>
  `;
  refreshIcons();
}

function lineItems(text, fields) {
  const items = [];
  for (const line of String(text || "").split("\n")) {
    const separator = line.indexOf("|");
    if (separator >= 0) items.push({ [fields[0]]: line.slice(0, separator).trim(), [fields[1]]: line.slice(separator + 1).trim() });
    else if (items.length) items[items.length - 1][fields[1]] += `\n${line}`;
    else if (line.trim()) items.push({ [fields[0]]: `步骤 ${items.length + 1}`, [fields[1]]: line });
  }
  return items.map(item => ({ ...item, [fields[1]]: item[fields[1]].trim() }));
}

function fileToBase64(file) {
  return new Promise((resolvePromise, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolvePromise(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("读取 ZIP 文件失败"));
    reader.readAsDataURL(file);
  });
}

function openSubmission(skill = null) {
  submissionForm.reset();
  submissionPackageLabel.textContent = "最大 30 MB，包内必须包含 SKILL.md";
  submissionForm._originalConfig = skill?.config || null;
  submissionForm._originalNotes = skill?.notes || [];
  submissionForm._originalTutorial = skill?.tutorial || [];
  submissionForm._originalExamples = skill?.examples || [];
  submissionForm.elements.namedItem("version").placeholder = "例如：1.0.0";
  if (skill) {
    const values = {
      id: skill.id, name: skill.name, version: "", category: skill.category,
      description: skill.description, author: skill.author,
      tags: (skill.tags || []).join(", "), baseVersion: skill.version,
      tutorial: (skill.tutorial || []).map((step) => `${step.title} | ${step.body}`).join("\n"),
      configExample: skill.config?.example || "",
      examples: (skill.examples || []).map((example) => `${example.label} | ${example.command}`).join("\n"),
    };
    for (const [name, value] of Object.entries(values)) {
      submissionForm.elements.namedItem(name).value = value || "";
    }
    submissionForm.elements.namedItem("version").placeholder = `当前 ${skill.version}，请填写新版本`;
  }
  submissionStatus.hidden = true;
  submissionForm._tutorialText = submissionForm.elements.namedItem("tutorial").value;
  submissionForm._examplesText = submissionForm.elements.namedItem("examples").value;
  submitDialog.querySelector("h2").textContent = skill ? `提交优化：${skill.name}` : "上传新技能";
  if (!submitDialog.open) submitDialog.showModal();
}

async function submitContribution(event) {
  event.preventDefault();
  const form = new FormData(submissionForm);
  const file = submissionPackageInput.files?.[0];
  if (!file) return toast("请选择技能 ZIP 包", "error");
  if (file.size > 30 * 1024 * 1024) return toast("技能包不能超过 30 MB", "error");

  const submitButton = submissionForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerHTML = '<i data-lucide="loader-circle"></i>正在提交';
  refreshIcons();
  try {
    const packageBase64 = await fileToBase64(file);
    const payload = {
      id: form.get("id"),
      name: form.get("name"),
      version: form.get("version"),
      category: form.get("category"),
      description: form.get("description"),
      author: form.get("author"),
      uploaderName: form.get("uploaderName"),
      submitter: form.get("submitter"),
      contact: form.get("contact"),
      tags: String(form.get("tags") || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      tutorial: form.get("tutorial") === submissionForm._tutorialText ? submissionForm._originalTutorial : lineItems(form.get("tutorial"), ["title", "body"]),
      config: { ...(submissionForm._originalConfig || { path: "config.local.json", fields: [] }), example: form.get("configExample") },
      notes: submissionForm._originalNotes,
      baseVersion: form.get("baseVersion"),
      changeSummary: form.get("changeSummary"),
      examples: form.get("examples") === submissionForm._examplesText ? submissionForm._originalExamples : lineItems(form.get("examples"), ["label", "command"]),
      packageBase64,
    };
    const body = await api("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
    const ticket = body.submission.id.slice(-8).toUpperCase();
    submissionForm.reset();
    submissionForm._originalConfig = null;
    submissionForm._originalNotes = [];
    submissionForm._originalTutorial = [];
    submissionForm._originalExamples = [];
    submissionForm._tutorialText = "";
    submissionForm._examplesText = "";
    submissionPackageLabel.textContent = "最大 30 MB，包内必须包含 SKILL.md";
    submissionStatus.innerHTML = `<i data-lucide="circle-check-big"></i><div><strong>提交成功，等待莫超审批</strong><span>审核编号：${escapeHtml(ticket)}。请联系莫超并提供此编号，审批后更新发布。</span></div>`;
    submissionStatus.hidden = false;
    submissionForm.scrollTop = 0;
    toast("技能已进入待审核队列");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i data-lucide="send"></i>提交审核';
    refreshIcons();
  }
}

function openAdmin() {
  if (!adminDialog.open) adminDialog.showModal();
  checkAdminSession(true);
}

async function checkAdminSession(loadReviews = false) {
  try {
    const body = await api("/api/admin/session");
    state.authenticated = Boolean(body.authenticated);
    loginForm.hidden = state.authenticated;
    reviewPanel.hidden = !state.authenticated;
    if (state.authenticated) {
      pendingBadge.textContent = formatNumber(body.pendingCount);
      pendingBadge.hidden = body.pendingCount === 0;
      if (loadReviews) await Promise.all([loadSubmissions(), loadAdminCatalog()]);
    } else {
      pendingBadge.hidden = true;
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderSubmission(submission) {
  const skill = submission.skill || {};
  const files = (skill.files || []).slice(0, 8).map((file) => `<code>${escapeHtml(file)}</code>`).join("");
  return `
    <article class="review-item" data-review-id="${escapeAttribute(submission.id)}">
      <header class="review-item-head">
        <div>
          <span class="review-category">${escapeHtml(skill.category || "其他")}</span>
          <h3>${escapeHtml(skill.name)}</h3>
        </div>
        <span class="review-version">v${escapeHtml(skill.version || "1.0.0")}</span>
      </header>
      <p class="review-description">${escapeHtml(skill.description)}</p>
      <p class="review-description"><strong>贡献说明：</strong>${escapeHtml(submission.changeSummary || "旧投稿未填写，请联系提交人确认")}</p>
      <dl class="review-metadata">
        <div><dt>技能 ID</dt><dd><code>${escapeHtml(skill.id)}</code></dd></div>
        <div><dt>基线版本</dt><dd>${escapeHtml(submission.baseVersion || "新技能 / 未记录")}</dd></div>
        <div><dt>提交人</dt><dd>${escapeHtml(submission.submitter)}</dd></div>
        <div><dt>联系方式</dt><dd>${escapeHtml(submission.contact)}</dd></div>
        <div><dt>提交时间</dt><dd>${escapeHtml(formatDate(submission.submittedAt, true))}</dd></div>
        <div><dt>技能包</dt><dd>${escapeHtml(formatBytes(submission.packageSize))}</dd></div>
      </dl>
      <div class="review-files">${files || "<span>未读取到文件清单</span>"}</div>
      <footer class="review-actions">
        <a class="button button-secondary button-small" href="/api/admin/submissions/${encodeURIComponent(submission.id)}/download">
          <i data-lucide="download"></i>下载检查
        </a>
        <span class="review-action-group">
          <button class="button button-danger button-small" type="button" data-review-action="reject" data-review-id="${escapeAttribute(submission.id)}">
            <i data-lucide="x"></i>驳回
          </button>
          <button class="button button-primary button-small" type="button" data-review-action="approve" data-review-id="${escapeAttribute(submission.id)}">
            <i data-lucide="check"></i>批准发布
          </button>
        </span>
      </footer>
    </article>
  `;
}

function renderSubmissions() {
  reviewCount.textContent = `${formatNumber(state.submissions.length)} 个待处理`;
  pendingBadge.textContent = formatNumber(state.submissions.length);
  pendingBadge.hidden = state.submissions.length === 0;
  reviewList.innerHTML = state.submissions.length
    ? state.submissions.map(renderSubmission).join("")
    : '<div class="review-empty"><i data-lucide="inbox"></i><strong>暂无待审核投稿</strong><span>新的公开投稿会显示在这里。</span></div>';
  refreshIcons();
}

async function loadSubmissions() {
  reviewList.innerHTML = '<div class="loading-line"></div>';
  try {
    const body = await api("/api/admin/submissions");
    state.submissions = Array.isArray(body.submissions) ? body.submissions : [];
    renderSubmissions();
  } catch (error) {
    reviewList.innerHTML = `<div class="review-empty is-error"><i data-lucide="circle-alert"></i><strong>加载失败</strong><span>${escapeHtml(error.message)}</span></div>`;
    refreshIcons();
  }
}

function renderPublishedSkill(skill) {
  return `
    <article class="review-item catalog-review-item" data-admin-id="${escapeAttribute(skill.id)}">
      <header class="review-item-head">
        <div><span class="review-category">${escapeHtml(skill.category || "其他")}</span><h3>${escapeHtml(skill.name)}</h3></div>
        <span class="review-version">v${escapeHtml(skill.version || "1.0.0")}</span>
      </header>
      <p class="review-description">${escapeHtml(skill.description)}</p>
      <dl class="review-metadata">
        <div><dt>技能 ID</dt><dd><code>${escapeHtml(skill.id)}</code></dd></div>
        <div><dt>作者 / 团队</dt><dd>${escapeHtml(skill.author || "内部贡献者")}</dd></div>
        <div><dt>上传人员</dt><dd>${escapeHtml(skill.uploaderName || "未填写")}</dd></div>
        <div><dt>下载次数</dt><dd>${formatNumber(skill.downloads)}</dd></div>
        <div><dt>状态</dt><dd>${skill.featured ? "推荐" : "正常发布"}</dd></div>
      </dl>
      <footer class="review-actions">
        <span class="review-files">更新于 ${escapeHtml(formatDate(skill.updatedAt))}</span>
        <span class="review-action-group">
          <button class="button button-secondary button-small" type="button" data-admin-action="edit" data-admin-id="${escapeAttribute(skill.id)}"><i data-lucide="pencil"></i>编辑信息</button>
          <button class="button button-danger button-small" type="button" data-admin-action="unpublish" data-admin-id="${escapeAttribute(skill.id)}"><i data-lucide="archive"></i>下架</button>
        </span>
      </footer>
    </article>
  `;
}

function renderArchivedSkill(skill) {
  return `
    <article class="review-item catalog-review-item is-archived" data-admin-id="${escapeAttribute(skill.id)}">
      <header class="review-item-head"><div><span class="review-category">${escapeHtml(skill.category || "其他")}</span><h3>${escapeHtml(skill.name)}</h3></div><span class="review-version">已归档</span></header>
      <p class="review-description">${escapeHtml(skill.description)}</p>
      <dl class="review-metadata"><div><dt>技能 ID</dt><dd><code>${escapeHtml(skill.id)}</code></dd></div><div><dt>版本</dt><dd>v${escapeHtml(skill.version || "1.0.0")}</dd></div><div><dt>上传人员</dt><dd>${escapeHtml(skill.uploaderName || "未填写")}</dd></div><div><dt>归档时间</dt><dd>${escapeHtml(formatDate(skill.archivedAt, true))}</dd></div></dl>
      <footer class="review-actions"><span class="review-files">技能包已保留，可恢复上架</span><button class="button button-secondary button-small" type="button" data-admin-action="restore" data-admin-id="${escapeAttribute(skill.id)}"><i data-lucide="undo-2"></i>恢复上架</button></footer>
    </article>
  `;
}

async function loadAdminCatalog() {
  publishedList.innerHTML = '<div class="loading-line"></div>';
  archivedList.innerHTML = '<div class="loading-line"></div>';
  try {
    const [published, archived] = await Promise.all([api("/api/admin/skills"), api("/api/admin/archived-skills")]);
    state.publishedSkills = Array.isArray(published.skills) ? published.skills : [];
    state.archivedSkills = Array.isArray(archived.skills) ? archived.skills : [];
    publishedCount.textContent = `${formatNumber(state.publishedSkills.length)} 个`;
    archivedCount.textContent = `${formatNumber(state.archivedSkills.length)} 个`;
    publishedList.innerHTML = state.publishedSkills.length ? state.publishedSkills.map(renderPublishedSkill).join("") : '<div class="review-empty"><i data-lucide="package-open"></i><strong>暂无已发布技能</strong></div>';
    archivedList.innerHTML = state.archivedSkills.length ? state.archivedSkills.map(renderArchivedSkill).join("") : '<div class="review-empty"><i data-lucide="archive"></i><strong>暂无下架归档</strong></div>';
    refreshIcons();
  } catch (error) {
    publishedList.innerHTML = `<div class="review-empty is-error"><strong>加载失败</strong><span>${escapeHtml(error.message)}</span></div>`;
    archivedList.innerHTML = "";
    refreshIcons();
  }
}

function openAdminSkillEditor(skill = null) {
  adminSkillForm.reset();
  adminSkillForm.elements.mode.value = skill ? "edit" : "create";
  adminSkillForm.elements.originalId.value = skill?.id || "";
  adminSkillDialogTitle.textContent = skill ? `编辑：${skill.name}` : "新增技能";
  adminSkillForm.elements.id.readOnly = Boolean(skill);
  adminSkillForm.elements.id.value = skill?.id || "";
  adminSkillForm.elements.name.value = skill?.name || "";
  adminSkillForm.elements.version.value = skill?.version || "1.0.0";
  adminSkillForm.elements.category.value = skill?.category || "其他";
  adminSkillForm.elements.author.value = skill?.author || "";
  adminSkillForm.elements.uploaderName.value = skill?.uploaderName || "";
  adminSkillForm.elements.description.value = skill?.description || "";
  adminSkillForm.elements.tags.value = (skill?.tags || []).join(", ");
  adminSkillForm.elements.featured.checked = Boolean(skill?.featured);
  adminPackageInput.value = "";
  adminPackageLabel.textContent = skill ? "编辑信息时可留空；如需更新脚本，请从投稿审核发布新版本" : "新增技能必填；最大 30 MB，包内必须包含 SKILL.md";
  if (!adminSkillDialog.open) adminSkillDialog.showModal();
  refreshIcons();
}

async function submitAdminSkill(event) {
  event.preventDefault();
  const form = new FormData(adminSkillForm);
  const mode = form.get("mode");
  const id = String(form.get("originalId") || form.get("id") || "");
  const file = adminPackageInput.files?.[0];
  if (mode === "create" && !file) return toast("新增技能必须选择 ZIP 包", "error");
  if (file && file.size > 30 * 1024 * 1024) return toast("技能包不能超过 30 MB", "error");
  const button = adminSkillForm.querySelector('button[type="submit"]');
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i data-lucide="loader-circle"></i>保存中';
  refreshIcons();
  try {
    const common = {
      name: form.get("name"), version: form.get("version"), category: form.get("category"),
      description: form.get("description"), author: form.get("author"), uploaderName: form.get("uploaderName"),
      tags: String(form.get("tags") || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      featured: form.get("featured") === "on",
    };
    if (mode === "edit") {
      await api(`/api/admin/skills/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(common) });
      toast("技能信息已更新");
    } else {
      const packageBase64 = await fileToBase64(file);
      await api("/api/admin/skills", { method: "POST", body: JSON.stringify({ ...common, id: form.get("id"), tutorial: [], examples: [], notes: [], config: { path: "config.local.json", fields: [] }, packageBase64 }) });
      toast("技能已发布");
    }
    adminSkillDialog.close();
    await Promise.all([loadAdminCatalog(), loadSkills()]);
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.innerHTML = original;
    refreshIcons();
  }
}

async function adminCatalogAction(id, action, button) {
  const skill = [...state.publishedSkills, ...state.archivedSkills].find((item) => item.id === id);
  if (!skill) return;
  if (action === "edit") return openAdminSkillEditor(skill);
  const isRestore = action === "restore";
  const message = isRestore ? `确定恢复上架“${skill.name}”吗？` : `确定下架“${skill.name}”吗？技能包会进入可恢复归档。`;
  if (!window.confirm(message)) return;
  button.disabled = true;
  try {
    const path = isRestore ? `/api/admin/archived-skills/${encodeURIComponent(id)}/restore` : `/api/admin/skills/${encodeURIComponent(id)}/unpublish`;
    await api(path, { method: "POST", body: "{}" });
    toast(isRestore ? `“${skill.name}”已恢复上架` : `“${skill.name}”已下架并归档`);
    await Promise.all([loadAdminCatalog(), loadSkills()]);
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
  }
}

async function reviewSubmission(id, action, button) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;
  const actionName = action === "approve" ? "批准发布" : "驳回并删除";
  if (!window.confirm(`确定要${actionName}“${submission.skill.name}”吗？`)) return;

  const originalContent = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i data-lucide="loader-circle"></i>处理中';
  refreshIcons();
  try {
    await api(`/api/admin/submissions/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" });
    toast(action === "approve" ? `“${submission.skill.name}”已发布` : `“${submission.skill.name}”已驳回`);
    await loadSubmissions();
    if (action === "approve") await loadSkills();
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.innerHTML = originalContent;
    refreshIcons();
  }
}

async function logout() {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    state.authenticated = false;
    state.submissions = [];
    loginForm.hidden = false;
    reviewPanel.hidden = true;
    pendingBadge.hidden = true;
    toast("已退出管理员登录");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  const active = document.activeElement;
  const input = document.createElement("textarea");
  input.className = "clipboard-fallback";
  input.value = text;
  input.setAttribute("aria-label", "待复制内容");
  (Array.from(document.querySelectorAll("dialog[open]")).at(-1) || document.body).append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  active?.focus({ preventScroll: true });
  if (!copied) throw new Error("请手动选择文本复制");
}

document.addEventListener("click", async (event) => {
  const helpClient = event.target.closest("[data-help-client]");
  if (helpClient) {
    state.helpClient = helpClient.dataset.helpClient;
    renderHelpClient();
    return;
  }
  const category = event.target.closest("[data-category]");
  if (category) {
    state.category = category.dataset.category;
    renderCategories();
    renderLibrary();
    return;
  }

  const card = event.target.closest("[data-skill-id]");
  if (card) {
    navigate(`skill/${encodeURIComponent(card.dataset.skillId)}`);
    return;
  }

  const mcpClient = event.target.closest("[data-mcp-client]");
  if (mcpClient) {
    state.mcpClient = mcpClient.dataset.mcpClient;
    renderMcp();
    return;
  }

  const reviewButton = event.target.closest("[data-review-action]");
  if (reviewButton) {
    await reviewSubmission(reviewButton.dataset.reviewId, reviewButton.dataset.reviewAction, reviewButton);
    return;
  }

  const adminButton = event.target.closest("[data-admin-action]");
  if (adminButton) {
    await adminCatalogAction(adminButton.dataset.adminId, adminButton.dataset.adminAction, adminButton);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (action === "open-submit") openSubmission();
  if (action === "improve-skill") openSubmission(state.currentSkill);
  if (action === "open-mcp") {
    if (submitDialog.open) submitDialog.close();
    navigate("mcp");
  }
  if (action === "open-guide") {
    navigate("guide");
  }
  if (action === "upload-help") {
    submitDialog.close();
    navigate("guide/share");
  }
  if (action === "tutorial-template") {
    const field = submissionForm.elements.namedItem("tutorial");
    if (field.value.trim()) return toast("已有教程已保留，可按运行环境、安装、配置、验证补充。");
    field.value = "运行环境 | 填写支持的系统、客户端、运行时和账号权限\n安装 | 填写文件放置位置，以及如何确认技能被识别\n配置 | 填写配置文件或本机登录方式，仅使用占位符\n首次验证 | 给出一条离线或只读检查，以及成功时的表现\n常见问题 | 写明常见报错、排查步骤和维护联系方式";
    field.focus();
  }
  if (action === "open-admin") openAdmin();
  if (action === "new-admin-skill") openAdminSkillEditor();
  if (action === "close-dialog") actionTarget.closest("dialog")?.close();
  if (action === "back-library") navigate();
  if (action === "clear-filters") {
    state.query = "";
    state.category = "全部";
    searchInput.value = "";
    renderCategories();
    renderLibrary();
  }
  if (action === "refresh-reviews") await Promise.all([loadSubmissions(), loadAdminCatalog()]);
  if (action === "logout") await logout();

  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    try {
      await copyText(copyButton.dataset.copy);
      toast("已复制到剪贴板");
    } catch {
      toast("复制失败，请手动选择文本", "error");
    }
  }
});

document.addEventListener("keydown", async (event) => {
  const dialogOpen = submitDialog.open || adminDialog.open || adminSkillDialog.open;
  if (event.key === "/" && document.activeElement !== searchInput && !dialogOpen) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Enter" && event.target.matches("[data-skill-id]")) navigate(`skill/${encodeURIComponent(event.target.dataset.skillId)}`);
});

document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
  navigate(button.dataset.nav === "library" ? "" : button.dataset.nav);
}));

window.addEventListener("hashchange", handleRoute);

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderLibrary();
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  renderLibrary();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(loginForm).get("password");
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    loginForm.reset();
    state.authenticated = true;
    loginForm.hidden = true;
    reviewPanel.hidden = false;
    toast("管理员登录成功");
    await Promise.all([loadSubmissions(), loadAdminCatalog()]);
  } catch (error) {
    toast(error.message, "error");
  }
});

submissionForm.addEventListener("submit", submitContribution);
adminSkillForm.addEventListener("submit", submitAdminSkill);
submissionPackageInput.addEventListener("change", () => {
  const file = submissionPackageInput.files?.[0];
  submissionPackageLabel.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "最大 30 MB，包内必须包含 SKILL.md";
});

adminPackageInput.addEventListener("change", () => {
  const file = adminPackageInput.files?.[0];
  adminPackageLabel.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "新增技能必填；编辑时可留空";
});

for (const dialog of [submitDialog, adminDialog, adminSkillDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

renderGuide();
renderMcp();
refreshIcons();
loadSkills();
checkAdminSession(false);
handleRoute();
