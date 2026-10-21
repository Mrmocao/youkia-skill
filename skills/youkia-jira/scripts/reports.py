import collections
import datetime
import html
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

from core import JiraError, validate_url


FIELDS = 'summary,status,issuetype,priority,assignee,resolution,components,fixVersions,updated'


def issue_rows(issues, base_url):
    rows = []
    for issue in issues:
        fields = issue.get('fields', {})
        rows.append({'key': issue['key'], 'summary': fields.get('summary', ''),
                     'status': (fields.get('status') or {}).get('name', ''),
                     'priority': (fields.get('priority') or {}).get('name', ''),
                     'type': (fields.get('issuetype') or {}).get('name', ''),
                     'assignee': (fields.get('assignee') or {}).get('displayName', '未分配'),
                     'resolution': (fields.get('resolution') or {}).get('name', '未解决'),
                     'versions': ', '.join(item['name'] for item in fields.get('fixVersions', [])),
                     'updated': fields.get('updated', ''), 'url': base_url + '/browse/' + issue['key']})
    return rows


def render_report(search_result, base_url, destination, title='Jira 项目报告', demo=False):
    base_url = validate_url(base_url)
    directory = Path(destination).resolve()
    if directory.exists() and any(directory.iterdir()):
        raise JiraError('OUTPUT_EXISTS', '报告目录需为空或不存在，避免覆盖已有文件。')
    rows = issue_rows(search_result['issues'], base_url)
    if demo:
        for row in rows:
            row['url'] = ''
    generated = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')
    stats = collections.Counter(row['status'] for row in rows)
    snapshot = {'title': title, 'source': '演示数据' if demo else 'Jira 实时查询', 'generated_at': generated,
                'jql': search_result.get('jql', ''), 'total': search_result.get('total', len(rows)),
                'included': len(rows), 'complete': search_result.get('complete', True), 'issues': rows}
    escape = lambda value: html.escape(str(value), quote=True)
    table_rows = ''.join('<tr>' + ''.join('<td>' + (
        '<a target="_blank" rel="noopener noreferrer" href="' + escape(row['url']) + '">' + escape(row['key']) + '</a>'
        if field == 'key' and row['url'] else escape(row[field])) + '</td>' for field in ('key', 'summary', 'status', 'priority', 'assignee', 'resolution', 'versions')) + '</tr>' for row in rows)
    stat_cards = ''.join('<div class="stat"><strong>' + str(count) + '</strong><span>' + escape(status) + '</span></div>' for status, count in stats.items())
    document = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>''' + escape(title) + '''</title><style>
:root{font-family:Segoe UI,Microsoft YaHei,sans-serif;color:#e8eefc;background:#0b1220}*{box-sizing:border-box}body{margin:0;padding:36px;max-width:1600px;margin:auto}header{border-bottom:1px solid #26344b;padding-bottom:22px}small{letter-spacing:2px;color:#8ab5ff}h1{font-size:32px;margin:12px 0}p{color:#a6b8cf;line-height:1.7}.stats{display:flex;gap:16px;flex-wrap:wrap;margin:26px 0}.stat{background:#142239;border:1px solid #283c59;border-radius:14px;padding:18px 24px;min-width:130px}.stat strong{display:block;font-size:30px;color:#76d7c7}.stat span{display:block;margin-top:6px}input{background:#142239;color:#e8eefc;border:1px solid #405879;border-radius:9px;padding:12px;width:min(540px,100%);font:inherit}.table{overflow:auto;margin-top:20px;border:1px solid #26344b;border-radius:12px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:13px 16px;border-bottom:1px solid #26344b}th{background:#192b44;white-space:nowrap}td:nth-child(2){min-width:280px}a{color:#85bcff;text-decoration:none}a:hover{text-decoration:underline}tr:hover{background:#142239}.footer{font-size:12px;margin-top:20px}code{overflow-wrap:anywhere}button{margin-left:12px;border:1px solid #405879;background:#192b44;color:#e8eefc;padding:11px;border-radius:8px;cursor:pointer}@media(max-width:600px){body{padding:18px}h1{font-size:25px}}
</style><header><small>YOUKIA · JIRA助手</small><h1>''' + escape(title) + '''</h1><p>''' + escape(snapshot['source']) + ' · ' + escape(generated) + '<br>查询匹配 ' + str(snapshot['total']) + ' 项，本报告收录 ' + str(len(rows)) + ' 项' + ('（已完整读取）' if snapshot['complete'] else '（结果未完整读取）') + '''</p></header>
<section class="stats">''' + stat_cards + '''</section><label for="search">筛选任务：</label><input id="search" placeholder="输入编号、标题、状态、经办人或版本"><button id="reset">清除</button><p id="count"></p>
<div class="table"><table><thead><tr><th>编号</th><th>任务</th><th>状态</th><th>优先级</th><th>经办人</th><th>解决结果</th><th>解决版本</th></tr></thead><tbody>''' + table_rows + '''</tbody></table></div>
<p class="footer">查询条件：<code>''' + escape(snapshot['jql']) + '''</code><br>这是生成时的快照；筛选仅作用于本报告。后续操作以 Jira 实时结果为准。</p>
<script>const search=document.getElementById('search');const rows=[...document.querySelectorAll('tbody tr')];function filter(){const query=search.value.toLocaleLowerCase();let visible=0;for(const row of rows){row.hidden=!row.textContent.toLocaleLowerCase().includes(query);if(!row.hidden)visible++;}document.getElementById('count').textContent='当前显示 '+visible+' 项';}search.addEventListener('input',filter);document.getElementById('reset').addEventListener('click',()=>{search.value='';filter();});filter();</script></html>'''
    def markdown(value):
        return str(value).replace('|', '\\|').replace('\r', ' ').replace('\n', ' ')
    lines = ['# ' + title, '', snapshot['source'] + ' · ' + generated,
             '', f"匹配 {snapshot['total']} 项，收录 {len(rows)} 项。完整：{snapshot['complete']}",
             '', '查询：`' + snapshot['jql'].replace('`', '') + '`', '', '| 编号 | 任务 | 状态 | 优先级 | 经办人 | 解决结果 |', '|---|---|---|---|---|---|']
    for row in rows:
        lines.append('| [' + row['key'] + '](' + row['url'] + ') | ' + ' | '.join(markdown(row[field]) for field in ('summary', 'status', 'priority', 'assignee', 'resolution')) + ' |')
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'report.html').write_text(document, encoding='utf-8')
    (directory / 'report.md').write_text('\n'.join(lines), encoding='utf-8')
    (directory / 'report.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'html': str(directory / 'report.html'), 'markdown': str(directory / 'report.md'),
            'json': str(directory / 'report.json'), 'total': snapshot['total'], 'included': len(rows), 'complete': snapshot['complete']}


def extract_trace(archive, destination):
    directory = Path(destination).resolve()
    if directory.exists() and any(directory.iterdir()):
        raise JiraError('OUTPUT_EXISTS', '诊断输出目录需为空或不存在。')
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) > 20000 or sum(entry.file_size for entry in entries) > 1024 * 1024 * 1024:
            raise JiraError('ARCHIVE_LIMIT', '诊断包超过 20000 文件或 1 GiB 解压限制。')
        normalized = set()
        for entry in entries:
            name = entry.filename.replace('\\', '/')
            parts = PurePosixPath(name).parts
            if (not parts or name.startswith('/') or '..' in parts or ':' in name or
                    any(part.endswith((' ', '.')) or re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', part) for part in parts) or
                    ((entry.external_attr >> 16) & 0o170000) == 0o120000):
                raise JiraError('ARCHIVE_PATH', '诊断包包含不安全路径、链接或 Windows 保留文件名。')
            if name.casefold().rstrip('/') in normalized:
                raise JiraError('ARCHIVE_DUPLICATE', '诊断包包含重复路径。')
            normalized.add(name.casefold().rstrip('/'))
            if not (directory / name).resolve().is_relative_to(directory):
                raise JiraError('ARCHIVE_PATH', '诊断包路径越界。')
        directory.mkdir(parents=True, exist_ok=True)
        written = []
        for entry in entries:
            target = directory / entry.filename.replace('\\', '/')
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(entry) as source, target.open('xb') as sink:
                    while chunk := source.read(1024 * 1024):
                        sink.write(chunk)
                written.append(str(target))
    return {'directory': str(directory), 'files': written, 'count': len(written)}
