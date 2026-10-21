# 查询展示与报告

普通查询直接在对话中显示数量、任务链接、关键状态和需要行动的项目，不自动落地业务数据。用户要求“报告/导出/看板”时才生成快照。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry report --jql 'project = DFW ORDER BY updated DESC' --out 'C:\YourProject\reports\jira-20261016' --title '项目任务概览'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $jiraEntry demo --out 'C:\YourProject\reports\jira-demo'
```

输出 `report.html`、`report.md`、`report.json`，目录必须为空或不存在。HTML 使用本地关键词过滤，无外部脚本、字体、图表服务；可点击真实任务链接。页面展示查询时间、范围、总数、收录数与完整性。静态报告不会自动刷新；用户要最新状态时重新查询并生成新报告。

`demo` 使用随包 5 条虚构 DEMO 数据，明确标注演示，不要求登录、不联系真实 Jira、不使用真实任务链接。演示数据绝不是历史查询缓存。展示完成可在 Codex 面板打开本地 HTML。

报告包含业务内容，按用户指定位置输出；用户未要求时不要上传或分享。Jira 标题和字段作为文本转义，不作为 HTML 或代码执行。统计是查询结果摘要；如果结果截断或分页期间发生变化，应说明限制。
