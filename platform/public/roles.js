export const ROLE_OPTIONS = ["美术", "客户端", "大数据", "后端", "人事", "策划", "测试", "运营", "通用"];
const legacyRoles = {
  "grok-imagine-subapi": ["美术", "策划", "运营"],
  "sub2api-4k-image-generator-ts": ["美术"],
  "youkia-image-codex": ["美术", "策划"],
  "youkia-midjourney-mcp": ["美术"],
  "svn-windows-powershell": ["客户端", "后端", "策划", "测试"],
  "youkia-gm": ["策划", "测试", "后端"],
  "youkia-local-server": ["客户端", "后端", "测试"],
  "youkia-jira": ["客户端", "后端", "策划", "测试"],
};
export function rolesFor(skill) {
  return Array.isArray(skill.roles) && skill.roles.length ? skill.roles : legacyRoles[skill.id] || ["通用"];
}
export function historyFor(skill) {
  if (Array.isArray(skill.contributions) && skill.contributions.length) return skill.contributions;
  return skill.uploaderName ? [{ name: skill.uploaderName, version: skill.version, date: skill.updatedAt, kind: "历史记录" }] : [];
}
