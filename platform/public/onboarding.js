const topics = {
  understand: "了解与选择", install: "首次安装", maintain: "更新与维护", share: "上传与审批", faq: "常见问题",
};

export function agentTaskPrompt(task = "install") {
  const origin = window.location.origin;
  const goals = {
    install: "我想使用这个平台的技能。请根据我的需求选择合适技能，帮我安装、完成配置检查，并教我如何开始使用。我的需求：[填写想完成的任务或技能名称]。",
    submit: "请帮我把本地技能整理、打包并提交到这个平台审核。本地技能路径：[填写路径]。请检查内容、补齐教程，缺少的提交人和联系方式再问我。已有技能按优化版本提交，完成后给我审核编号。",
    maintain: "请检查我已安装的技能是否有更新，备份个人配置后完成必要更新和验证。需要检查的技能：[填写名称或本地路径]。",
  };
  return `${origin}/\n${goals[task] || goals.install}\n先读取 ${origin}/agent-guide.md，按其中流程执行。已连接平台 MCP 就使用相应工具；否则直接调用文档中的 HTTP API，无需让我手工配置 MCP 或填写网页表单。请基于实际结果报告完成状态。`;
}

export function renderAgentHandoff(codeBlock, task = "install") {
  return `<section class="agent-handoff"><h2>把网址和需求发给 AI，剩下的让它来做</h2><p class="guide-copy">不想自己下载安装、打包或填写上传表单？把平台网址或技能详情网址发给 Codex、OpenCode 或自己的 Agent 客户端，说清“帮我安装”或“帮我提交”。AI 会读取操作说明，处理具体步骤；缺少账号或人员信息时再向你询问。</p>${codeBlock(task === "submit" ? "交给 AI 投稿" : task === "maintain" ? "交给 AI 更新" : "交给 AI 安装", agentTaskPrompt(task))}<p class="guide-copy">客户端需要能够访问网络并操作本地文件。支持这些能力时，无需先连接 MCP。安装完成后，直接向 AI 描述你要完成的任务即可。</p><a class="text-link" href="/agent-guide.md">AI 操作说明</a> · <a class="text-link" href="/openapi.json">接口定义</a></section>`;
}

export const skillProfiles = {
  "grok-imagine-subapi": { purpose: "生成图片与短视频", prepare: "自己的 SubAPI 密钥、接口地址；按包内说明准备 Node.js。", first: "检查图片与视频脚本、运行环境和配置是否齐全，先不提交生成任务。" },
  "sub2api-4k-image-generator-ts": { purpose: "原版 Sub2API 高分辨率出图", prepare: "Sub2API 图片接口和 Node.js；已使用原版的同事可继续核对原版教程。", first: "检查本地配置，并进行离线请求检查，先不生成图片。" },
  "youkia-image-codex": { purpose: "高分辨率出图与参考图修改", prepare: "Node.js 22+；支持所选模型的 Sub2API 地址和自己的 API Key。", first: "检查配置、模型及输出目录，运行离线 dry-run，先不生成图片。" },
  "svn-windows-powershell": { purpose: "检查和维护 SVN 工作副本", prepare: "Windows PowerShell、SVN 客户端、工作副本路径及已有仓库权限。", first: "查看当前工作副本信息和修改状态，不提交、不回滚、不删除。" },
  "youkia-gm": { purpose: "通过对话使用项目 GM", prepare: "可访问的 GM 账号、项目与服务器信息；按引导在本机登录。", first: "引导我配置并检查账号可访问的项目，先不执行 GM 写操作。" },
  "youkia-jira": { purpose: "查询任务、Bug 与工作流", prepare: "Jira 地址与可访问账号；通过本机登录窗口配置。", first: "引导我登录并选择项目，只查询任务，不修改状态或创建任务。" },
  "youkia-local-server": { purpose: "管理游戏本地服务器", prepare: "Windows、可运行的本地服务器、Unity 工程及所需本机插件。", first: "核对本地服务器与 Unity 配置，只检查状态，不启动、关闭或清档。" },
  "youkia-midjourney-mcp": { purpose: "配置和使用 Midjourney", prepare: "Node.js、Chrome、自己的 Midjourney 账号，以及独立的 Midjourney MCP 配置。", first: "检查运行环境、连接和账号状态，先不提交生成任务。" },
};

export function profileFor(skill) {
  return skillProfiles[skill.id] || { purpose: skill.description, prepare: "按本页教程和包内 SKILL.md 核对客户端、运行环境与账号要求。", first: "说明适用场景，检查运行环境与配置，列出还缺少的准备项。" };
}

export function installPrompt(skill) {
  const origin = window.location.origin;
  return `请帮我安装锦鲤云技能 ${skill.id}（页面版本 ${skill.version}）。\n先读取 ${origin}/api/skills/${encodeURIComponent(skill.id)} 的最新资料，再从 ${origin}/api/skills/${encodeURIComponent(skill.id)}/download 下载 ZIP。\n检查压缩包和 SKILL.md，按当前客户端实际识别的用户技能目录安装；解压后 SKILL.md 必须直接位于 ${skill.id} 文件夹下，不能多套一层。若已有同名技能，先说明版本和差异，备份后再更新，保留本机凭据、state 和个人配置。\n按技能说明检查依赖与配置，不把密钥发到平台。最后报告安装路径、实际版本、还需准备什么，以及是否需要重新加载客户端。先只完成安装与检查，不执行付费生成或业务写操作。`;
}

export function maintenancePrompt(skill) {
  return `请帮我检查已安装的 ${skill.id} 是否需要更新。平台资料：${window.location.origin}/api/skills/${encodeURIComponent(skill.id)}。\n先定位本地实际使用的技能目录，对照版本和文件差异；如果无法确认本地版本，请明确说明。更新前备份旧目录、配置和 state，保留我的密钥及账号状态。新版本在单独目录检查后再替换，避免残留旧脚本。完成后做离线或只读验收；失败时提供回退步骤。不要自动提交付费任务或业务写操作。`;
}

export function feedbackPrompt(skill) {
  return `请帮我整理技能问题反馈，先排查，不重复提交任务。\n技能：${skill.id}\n平台版本：${skill.version}\n详情：${window.location.origin}/#skill/${encodeURIComponent(skill.id)}\n我的系统与客户端版本：[填写]\n实际技能目录及本地版本：[填写或注明未知]\n操作步骤、预期结果、实际结果：[填写]\n报错发生时间与脱敏错误信息：[填写]\n请区分安装未识别、环境缺失、配置错误、账号权限或接口故障；去掉密钥、密码、Cookie 和个人业务数据。最终生成一段可发给维护方或莫超的反馈。`;
}

export function renderSkillHelp(skill, escapeHtml, codeBlock) {
  const profile = profileFor(skill);
  return `<section class="skill-getting-started" aria-labelledby="skill-start-title">
    <div class="help-section-heading"><div><p class="eyebrow">交给 AI 助手</p><h2 id="skill-start-title">把这个技能的网址发给 AI，帮你安装和使用</h2></div><a class="button button-secondary button-small" href="#guide/install">安装步骤</a></div>
    <p class="guide-copy"><strong>适合做什么：</strong>${escapeHtml(profile.purpose)}</p>
    <p class="guide-copy"><strong>需要准备：</strong>${escapeHtml(profile.prepare)}</p>
    <p class="guide-copy">复制下方提示词发给 Codex 或自己的 Agent。它会下载、安装并检查配置，完成后再告诉你如何使用。</p>
    <button class="button button-primary button-small" type="button" data-copy="${escapeHtml(window.location.origin + '/#skill/' + encodeURIComponent(skill.id))}">复制技能网址</button>
    ${codeBlock("安装提示词", installPrompt(skill))}
    ${codeBlock("首次验证提示词", `读取我已安装的 ${skill.id} 技能。${profile.first}`)}
    <details class="help-disclosure"><summary>已安装？检查更新或反馈问题</summary>
      <p class="guide-copy">网页显示的是平台版本，平台无法直接读取你的本地安装状态。新版发布后，需要你主动更新本地目录。</p>
      ${codeBlock("更新维护提示词", maintenancePrompt(skill))}
      ${codeBlock("问题反馈模板", feedbackPrompt(skill))}
      <a class="text-link" href="#guide/maintain">查看更新、回退与协作流程 →</a>
    </details>
  </section>`;
}

const questions = [
  ["不想自己安装或上传，可以直接把网址给 AI 吗？", "可以。把平台或技能详情网址发给 Codex、OpenCode 或自己的 Agent，说清要安装哪个技能，或要上传的本地目录。具备网络和本地文件能力的客户端可按 AI 操作说明完成安装、打包和投稿；没有 MCP 也可以直接使用 HTTP 接口。提交后仍由莫超审批。"],
  ["什么是技能？和直接聊天有什么不同？", "技能是一套可复用的操作说明，可能包含脚本、参考资料和示例。Agent 读取它后，按团队约定处理特定任务。技能本身不提供账号、接口额度或业务权限。"],
  ["平台 MCP 和具体技能的 MCP 是一回事吗？", "平台 MCP 用来搜索、读取和投稿技能。连接平台不会自动安装全部技能，也不会自动连接 Midjourney、Unity 等业务服务；业务连接要按各技能教程单独配置。"],
  ["已下载，为什么客户端还是找不到？", "先定位客户端实际扫描的技能目录，检查技能文件夹内是否直接存在 SKILL.md；常见问题是多套了一层目录、放在另一个系统用户下、客户端还在读取旧副本。重新加载或新建会话，仍未识别时尝试重启客户端。也可直接让 Agent 读取本机 SKILL.md 的完整路径进行检查。"],
  ["配置文件一定叫 config.local.json 吗？", "不一定。部分技能使用本机登录窗口、state 目录或客户端配置。以技能包内 SKILL.md 和本页教程为准；没有配置示例不等于不需要账号。不要把空的配置字段当成所有技能的统一要求。"],
  ["401、403 或连接超时怎么办？", "401 通常与凭据有关，403 可能是权限、账号或服务策略，超时也可能只是任务尚未完成。保留脱敏错误和时间，让 Agent 核对当前地址、模型、账号权限及已有任务记录；不要反复提交同一个生成任务。"],
  ["安装或使用是否收费？", "平台用于公司内部共享。具体技能调用的图片、视频或其他服务可能消耗账号额度，取决于服务提供方；下载技能不包含额度。首次验证优先选择离线或只读检查。"],
  ["平台更新后，我的技能会自动更新吗？", "不会。对照平台版本和本地安装文件，备份个人配置后更新。仅修改网页教程也不会修改已下载的 ZIP；脚本更新需上传并审批新版本。"],
  ["上传后为什么广场里没有？", "投稿先进入待审核队列。保存提交成功时的审核编号，联系莫超审批；批准后才进入公共目录。上传人员名称是展示信息，不代表管理员权限。"],
  ["发现问题，但不会改代码怎么办？", "在技能详情复制问题反馈模板，补上系统、客户端版本、技能版本、复现步骤和脱敏报错，联系技能维护方或莫超。无需先上传一个技能包。"],
  ["平台能查看我的密钥或本地账号吗？", "正常使用时，这些配置保留在你的电脑上。上传前移除密钥、密码、Cookie、私钥和运行缓存；平台的包名检查不能替代你对文件内容的检查。"],
];

export function renderHelpCenter(topic, escapeHtml, codeBlock) {
  const selected = Object.hasOwn(topics, topic) ? topic : "understand";
  const uploadPrompt = agentTaskPrompt("submit");
  const content = {
    understand: `<h2>先选任务，再选技能</h2><p class="guide-copy">技能把同事已经验证的操作方法交给 Agent 复用。先确认你要完成的工作，再检查账号、运行环境和项目权限。</p>
      <div class="help-task-list">
        <div><strong>图片与视频</strong><p>Grok：图片和短视频；youkia-image-codex：高分辨率图片与参考图修改；Midjourney：独立账号与 MCP 工作流。</p></div>
        <div><strong>游戏项目日常</strong><p>GM：项目与服务器操作；Jira：任务、Bug 与工作流；本地服务器：Unity 配合的本地服务管理。</p></div>
        <div><strong>版本协作</strong><p>SVN：在工作副本中检查修改、更新与提交，需要已有 SVN 环境和仓库权限。</p></div>
      </div><p class="guide-copy">Sub2API 原版与 youkia-image-codex 是两个技能目录。新版是本平台的重构版本；迁移前检查配置兼容性，不要把两个目录混合覆盖。</p>
      <h3>技能、客户端、账号，分别是什么？</h3><ul class="help-list"><li>客户端：Codex、OpenCode 等执行任务的入口。</li><li>技能：任务说明与脚本，安装在你自己的电脑上。</li><li>账号与接口：实际连接的业务服务，需要你已有的访问权限。</li><li>技能平台：共享目录、教程、下载与投稿审批。</li></ul><a class="button button-primary" href="#guide/install">下一步：安装一个技能</a>`,
    install: `<h2>首次安装：让 Agent 帮你检查</h2><ol class="help-list numbered"><li><strong>打开技能详情。</strong>阅读“需要准备”和发布者教程，确认系统、账号与依赖。</li><li><strong>复制安装提示词。</strong>详情页已带入技能 ID、版本、资料地址和下载地址。粘贴到有文件及网络操作能力的 Agent 客户端。</li><li><strong>完成本机配置。</strong>按 SKILL.md 配置，或通过技能提供的登录窗口登录；密钥不要填进网页投稿表单。</li><li><strong>验证。</strong>复制详情页的首次验证提示词；先确认技能被识别、依赖齐全，再开展实际业务操作。</li></ol>
      <h3>也可以手动安装</h3><div class="help-client-switch" role="group" aria-label="选择安装客户端"><button class="button button-secondary" type="button" data-help-client="codex">Codex</button><button class="button button-secondary" type="button" data-help-client="opencode">OpenCode</button><button class="button button-secondary" type="button" data-help-client="other">其他客户端</button></div><div id="help-client-content"></div>
      <p class="guide-copy">先在临时目录解压。包里已有技能同名文件夹时复制整个文件夹；包根目录直接是 SKILL.md 时，先创建以技能 ID 命名的目录再放入内容。最终必须是 <code>技能目录/技能ID/SKILL.md</code>。</p><p class="guide-copy">解压后先阅读说明，再决定是否安装依赖或运行脚本。网页不会自动获知你的安装状态。</p>`,
    maintain: `<h2>更新、回退与共同维护</h2><ol class="help-list numbered"><li><strong>查当前版本。</strong>查看平台详情的版本和日期，请 Agent 定位本地实际使用的副本。版本无法确认时，对照文件，不猜测。</li><li><strong>先备份。</strong>把旧技能目录、config.local.json、state 和个人修改备份到技能扫描目录之外，避免两个同名技能被同时加载。</li><li><strong>独立检查新包。</strong>在临时目录解压，阅读新配置要求。确认后更新脚本，并按新结构迁移个人配置；不要用空示例覆盖密钥。</li><li><strong>重载并验收。</strong>检查客户端实际读取的是新版。失败时恢复旧目录和配置，再反馈问题。</li></ol><h3>我优化了一个已有技能</h3><p class="guide-copy">打开原技能详情 → “提交此技能优化” → 沿用原 ID、填写新版本 → 说明改动和验证结果 → 上传完整新包 → 联系莫超审批。若其他人已经更新，请先合并最新版本再投稿。</p><p class="guide-copy">管理员可维护页面信息及下架、恢复技能。下架会停止平台上的公开获取，但不会自动移除同事电脑上的已安装文件。</p><a class="button button-primary" href="#guide/share">查看投稿步骤</a>`,
    share: `<h2>上传前，让别人能独立用起来</h2><ol class="help-list numbered"><li><strong>整理技能包。</strong>包含 SKILL.md、必要脚本和参考文件；保留原作者、许可证与来源说明。</li><li><strong>补齐教程。</strong>写清用途、适用系统、依赖、安装路径、配置方式、首次验证及常见问题；配置示例只用占位符。</li><li><strong>选择提交方式。</strong>会用网页就点击“上传技能”；已连接平台 MCP 的同事可让 Agent 直接投稿。</li><li><strong>等待审批。</strong>保存审核编号，联系莫超。审批前公共目录不会出现该技能，投稿不会授予管理员权限。</li></ol>
      <h3>三个名字如何填写？</h3><dl class="help-definitions"><dt>作者 / 团队</dt><dd>原作者或维护团队，保留来源。</dd><dt>上传人员（选填）</dt><dd>本次整理上传的同事，审批后显示在详情页。</dd><dt>提交人 + 联系方式</dt><dd>供管理员审核沟通，不会作为公开联系方式展示。</dd></dl>
      <div class="help-actions"><button class="button button-secondary" type="button" data-action="open-submit">开始上传</button><a class="button button-secondary" href="#mcp">可选：连接平台 MCP</a></div>`,
    faq: `<h2>常见问题</h2><p class="guide-copy">点击问题展开。无法解决时，请从对应技能详情复制反馈模板，联系维护方或莫超。</p>${questions.map(([question, answer]) => `<details class="help-disclosure"><summary>${escapeHtml(question)}</summary><p class="guide-copy">${escapeHtml(answer)}</p></details>`).join("")}`,
  };
  return `<header class="guide-header"><p class="eyebrow">团队使用手册</p><h1>你说需求，AI 帮你安装、使用和分享</h1><p class="intro">把网址交给 AI 助手即可开始。你也可以按下方说明手动操作。</p></header><nav class="help-topic-nav" aria-label="指南主题">${Object.entries(topics).map(([key, label]) => `<a href="#guide/${key}" ${key === selected ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav><article class="help-content">${selected !== "faq" ? renderAgentHandoff(codeBlock, selected === "share" ? "submit" : selected === "maintain" ? "maintain" : "install") : ""}${content[selected]}</article>`;
}

export function clientInstructions(client, codeBlock) {
  if (client === "codex") return `<p class="guide-copy">优先让 Agent 检查当前 Codex 实际扫描的用户技能目录。当前官方文档推荐用户级 <code>~/.agents/skills</code>；团队旧安装也可能位于 <code>~/.codex/skills</code>，不要在两处重复安装同名副本。</p>${codeBlock("Codex 用户级目录示例", "Windows：%USERPROFILE%\\.agents\\skills\\技能ID\\SKILL.md\nmacOS / Linux：~/.agents/skills/技能ID/SKILL.md")}<p class="guide-copy">安装后重新加载技能或新建会话；仍未识别时重启客户端。可用 <code>$技能ID</code> 指定技能，或直接给 Agent 本地 SKILL.md 的完整路径。</p><a class="text-link" href="https://developers.openai.com/codex/skills/" target="_blank" rel="noopener noreferrer">Codex 官方技能说明 ↗</a>`;
  if (client === "opencode") return `<p class="guide-copy">OpenCode 常见用户级目录示例为 <code>~/.config/opencode/skills/技能ID/SKILL.md</code>。请让 Agent 核对当前客户端版本和实际扫描位置，再安装；不要仅凭其他客户端的目录推断。</p>${codeBlock("OpenCode 安装后验证", "请查找我刚安装的技能，读取其 SKILL.md，检查需要的运行环境和配置，先不要执行实际任务。")}<p class="guide-copy">技能内容可复用不代表所有脚本、系统或 MCP 依赖都已兼容；请按包内说明验证。</p><a class="text-link" href="https://opencode.ai/docs/skills/" target="_blank" rel="noopener noreferrer">核对 OpenCode 官方技能说明 ↗</a>`;
  return `<p class="guide-copy">先确认该客户端支持 SKILL.md 及其安装目录。可以把解压目录交给 Agent，要求读取 SKILL.md 并核对兼容性；客户端仅支持聊天、不支持本地脚本时，不能直接执行脚本型技能。</p>`;
}
