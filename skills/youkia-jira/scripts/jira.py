import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from core import DEFAULT_URL, ROOT, VERSION, JiraClient, JiraError, connection_info, load_profile, quote, redact, validate_url
from operations import batch, execute, plan


def parser():
    root = argparse.ArgumentParser(description='youkia JIRA助手：实时查询、任务操作和项目技能抽取。')
    root.add_argument('--state-dir', default=os.environ.get('youkia_jira_state', str(ROOT / 'state')), help='只存储加密登录信息的目录')
    root.add_argument('--version', action='version', version=VERSION)
    commands = root.add_subparsers(dest='command', required=True)
    startup = commands.add_parser('startup', help='返回站点和当前登录状态；不自动弹窗')
    startup.add_argument('--base-url')
    login = commands.add_parser('login', help='打开空白账号密码/Token 登录窗并等待返回')
    login.add_argument('--base-url')
    commands.add_parser('projects', help='实时读取当前可访问项目')
    project = commands.add_parser('project', help='按需读取项目、任务类型、工作流和权限；不保存项目')
    project.add_argument('key')
    search = commands.add_parser('search', help='实时 JQL 查询')
    search.add_argument('--jql', required=True)
    search.add_argument('--fields', default='summary,status,issuetype,priority,assignee,resolution,components,fixVersions,updated')
    search.add_argument('--limit', type=int, default=100)
    search.add_argument('--all', action='store_true', help='自动分页，最多读取 limit 项')
    pending = commands.add_parser('pending-bugs', help='动态发现缺陷类型与已解决状态；明确列出解决结果')
    pending.add_argument('--project', required=True)
    pending.add_argument('--limit', type=int, default=1000)
    issue = commands.add_parser('issue', help='读取任务；可补充全部备注及历史摘要')
    issue.add_argument('key')
    issue.add_argument('--fields')
    issue.add_argument('--history', action='store_true')
    issue.add_argument('--all-comments', action='store_true')
    meta = commands.add_parser('meta', help='实时字段与操作元数据')
    meta.add_argument('kind', choices=['create', 'edit', 'transitions', 'fields', 'links', 'configuration', 'attachments'])
    meta.add_argument('--project')
    meta.add_argument('--type')
    meta.add_argument('--issue')
    api = commands.add_parser('api-read', help='按需探索站内只读 REST 接口')
    api.add_argument('path')
    for command in ('prepare', 'execute', 'batch'):
        action = commands.add_parser(command, help='预检或执行 JSON 请求，执行须有用户授权')
        action.add_argument('--request', required=True, help='UTF-8 JSON 文件路径')
        if command != 'prepare':
            action.add_argument('--authorized', action='store_true')
    download = commands.add_parser('download', help='下载本站附件到指定新文件')
    download.add_argument('attachment_id')
    download.add_argument('--out', required=True)
    report = commands.add_parser('report', help='实时查询并生成 HTML/Markdown/JSON 报告')
    report.add_argument('--jql', required=True)
    report.add_argument('--out', required=True, help='空目录或新目录')
    report.add_argument('--title', default='Jira 项目报告')
    report.add_argument('--limit', type=int, default=10000)
    demo = commands.add_parser('demo', help='使用明确标识的虚构任务生成离线展示报告')
    demo.add_argument('--out', required=True)
    export = commands.add_parser('export', help='导出独立技能，排除任何凭证和运行状态')
    export.add_argument('--destination', required=True)
    export.add_argument('--modules', nargs='+', default=['assistant'], choices=['assistant','operations','workflow','reports','diagnostics'])
    trace = commands.add_parser('trace-extract', help='安全解压用户指定的本地诊断 ZIP')
    trace.add_argument('--zip', required=True)
    trace.add_argument('--out', required=True)
    return root


def read_request(filename):
    try:
        return json.loads(Path(filename).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        raise JiraError('REQUEST_FILE_INVALID', '无法读取 UTF-8 JSON 请求文件。') from None


def current_projects(client):
    return [{'key': item['key'], 'name': item['name'], 'archived': item.get('archived', False)}
            for item in client.request('GET', '/rest/api/2/project')]


def inspect_startup(state_dir, override=None):
    try:
        profile = load_profile(state_dir)
    except JiraError as error:
        if error.code not in ('LOGIN_REQUIRED', 'CREDENTIAL_UNAVAILABLE'):
            raise
        return {'state': 'needs_login', **connection_info(validate_url(override or DEFAULT_URL)), 'reason': error.code}
    if override and validate_url(override) != profile['base_url']:
        return {'state': 'needs_login', **connection_info(validate_url(override)), 'reason': 'SITE_CHANGED'}
    client = JiraClient(profile)
    try:
        identity = client.request('GET', '/rest/api/2/myself')
        if identity.get('active') is not True or not identity.get('name'):
            raise JiraError('LOGIN_REQUIRED', '登录身份未确认。')
        return {'state': 'needs_project_selection', **connection_info(profile['base_url']),
                'username': identity['name'], 'auth_mode': profile['auth_mode'], 'projects': current_projects(client)}
    except JiraError as error:
        if error.code in ('LOGIN_REQUIRED', 'PERMISSION_DENIED'):
            return {'state': 'needs_login', **connection_info(profile['base_url']), 'reason': error.code}
        raise


def login(state_dir, base_url=None):
    if os.name != 'nt':
        raise JiraError('WINDOWS_REQUIRED', '登录窗口需要 Windows 桌面会话。')
    if not base_url:
        try:
            base_url = load_profile(state_dir)['base_url']
        except JiraError:
            base_url = DEFAULT_URL
    command = [os.path.join(os.environ['SystemRoot'], 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
               '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'scripts' / 'login.ps1'),
               '-BaseUrl', validate_url(base_url), '-StateDirectory', str(Path(state_dir).resolve())]
    process = subprocess.run(command, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        result = json.loads(process.stdout.decode('utf-8-sig'))
    except (ValueError, UnicodeError):
        raise JiraError('LOGIN_WINDOW_ERROR', '登录窗口未能返回结果，请检查当前 Windows 桌面会话。') from None
    if result['status'] == 'cancelled':
        return {'state': 'cancelled', 'saved': False}
    if not result.get('saved'):
        return {'state': 'credential_save_failed', 'authenticated': result['status'] == 'authenticated', 'saved': False}
    return inspect_startup(state_dir)


def pending_bugs(client, project, limit):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', project):
        raise JiraError('PROJECT_KEY_INVALID', '请使用项目实际代号。')
    information = client.request('GET', '/rest/api/2/project/' + quote(project))
    types = [item for item in information['issueTypes'] if item['name'].casefold() in ('bug', 'sub-bug', '缺陷', '子缺陷')]
    workflows = client.request('GET', '/rest/api/2/project/' + quote(project) + '/statuses')
    statuses = sorted({status['id'] for workflow in workflows if workflow['id'] in {item['id'] for item in types}
                       for status in workflow['statuses'] if status['name'].casefold() in ('resolved', '已解决')})
    if not types or not statuses:
        raise JiraError('WORKFLOW_MAPPING_REQUIRED', '未能唯一识别 Bug 与待验收状态，请读取本项目类型和工作流后构造 JQL。',
                        {'issue_types': information['issueTypes'], 'workflows': workflows})
    jql = 'project = "' + project + '" AND issuetype in (' + ','.join(item['id'] for item in types) + ') AND status in (' + ','.join(statuses) + ') ORDER BY updated DESC'
    result = client.search(jql, limit=limit, all_pages=True, fields='summary,issuetype,status,priority,assignee,resolution,components,fixVersions,updated')
    groups = {}
    for issue in result['issues']:
        name = (issue['fields'].get('resolution') or {}).get('name', '未设置解决结果')
        groups.setdefault(name, []).append(issue)
    result['resolution_groups'] = {name: [item['key'] for item in issues] for name, issues in groups.items()}
    result['interpretation'] = '按本项目已解决状态筛选，需结合解决结果区分修复验收、不解决、重复等情况；不等于已完成实际验收。'
    return result


def all_comments(client, key):
    comments = []
    offset = 0
    for iteration in range(100):
        page = client.request('GET', '/rest/api/2/issue/' + quote(key) + '/comment?startAt=' + str(offset) + '&maxResults=100')
        batch_comments = page.get('comments', [])
        comments.extend(batch_comments)
        offset += len(batch_comments)
        if offset >= page.get('total', offset) or not batch_comments:
            return {'comments': comments, 'total': page.get('total', offset), 'complete': offset >= page.get('total', offset)}
    return {'comments': comments, 'complete': False}


def run(arguments):
    command = arguments.command
    if command == 'startup':
        return inspect_startup(arguments.state_dir, arguments.base_url)
    if command == 'login':
        return login(arguments.state_dir, arguments.base_url)
    if command == 'export':
        from exporting import export_skills
        return export_skills(arguments.destination, arguments.modules)
    if command in ('demo', 'trace-extract'):
        from reports import render_report, extract_trace
        if command == 'demo':
            return render_report(read_request(ROOT / 'assets' / 'demo.json'), DEFAULT_URL, arguments.out, 'youkia JIRA助手 · 演示报告', demo=True)
        return extract_trace(arguments.zip, arguments.out)
    profile = load_profile(arguments.state_dir)
    client = JiraClient(profile)
    if command == 'projects':
        return {'projects': current_projects(client)}
    if command == 'project':
        return {'project': client.request('GET', '/rest/api/2/project/' + quote(arguments.key)),
                'workflows': client.request('GET', '/rest/api/2/project/' + quote(arguments.key) + '/statuses'),
                'permissions': client.request('GET', '/rest/api/2/mypermissions?projectKey=' + quote(arguments.key)), 'saved': False}
    if command == 'search':
        return client.search(arguments.jql, arguments.fields, arguments.limit, arguments.all)
    if command == 'pending-bugs':
        return pending_bugs(client, arguments.project, arguments.limit)
    if command == 'issue':
        issue = client.issue(arguments.key, arguments.fields, arguments.history)
        if arguments.all_comments:
            issue['all_comments'] = all_comments(client, arguments.key)
        if arguments.history:
            issue['history_complete'] = len(issue.get('changelog', {}).get('histories', [])) >= issue.get('changelog', {}).get('total', 0)
        return issue
    if command == 'meta':
        if arguments.kind == 'create':
            if not arguments.project:
                raise JiraError('PROJECT_REQUIRED', '创建元数据需要项目代号。')
            return client.create_meta(arguments.project, arguments.type)
        if arguments.kind in ('edit', 'transitions') and not arguments.issue:
            raise JiraError('ISSUE_REQUIRED', '编辑和流转元数据需要任务编号。')
        if arguments.kind == 'transitions':
            return client.transitions(arguments.issue)
        paths = {'edit': '/rest/api/2/issue/' + quote(arguments.issue) + '/editmeta',
                 'fields': '/rest/api/2/field', 'links': '/rest/api/2/issueLinkType',
                 'configuration': '/rest/api/2/configuration', 'attachments': '/rest/api/2/attachment/meta'}
        return client.request('GET', paths[arguments.kind])
    if command == 'api-read':
        return client.read(arguments.path)
    if command in ('prepare', 'execute', 'batch'):
        request = read_request(arguments.request)
        if command == 'prepare':
            return plan(client, request)
        if command == 'batch':
            return batch(client, request, arguments.authorized)
        if not arguments.authorized:
            raise JiraError('AUTHORIZATION_REQUIRED', 'execute 需要已获用户授权的 --authorized 标记；预览请使用 prepare。')
        return execute(client, request)
    if command == 'download':
        return client.download(arguments.attachment_id, arguments.out)
    if command == 'report':
        from reports import FIELDS, render_report
        return render_report(client.search(arguments.jql, FIELDS, arguments.limit, all_pages=True), client.base_url,
                             arguments.out, arguments.title)
    raise JiraError('COMMAND_UNSUPPORTED', '不支持该命令。')


def main():
    arguments = parser().parse_args()
    try:
        result = run(arguments)
        print(json.dumps({'ok': True, 'data': redact(result)}, ensure_ascii=False))
        if isinstance(result, dict) and result.get('state') in ('partial', 'incomplete', 'outcome_unknown', 'needs_verification', 'credential_save_failed'):
            return 3
        return 0
    except JiraError as error:
        print(json.dumps({'ok': False, 'error': redact(error.payload())}, ensure_ascii=False))
        return 2
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print(json.dumps({'ok': False, 'error': {'code': 'LOCAL_OR_SCHEMA_ERROR', 'message': '本机文件或 Jira 响应格式不符合预期，请核对范围和兼容性；不自动重复写请求。'}}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
