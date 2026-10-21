import json
import mimetypes
import re
import uuid
from pathlib import Path

from core import JiraError, quote


ACTIONS = ('create', 'update', 'transition', 'assign', 'comment', 'link', 'unlink', 'attach', 'delete-attachment')


def require_value(request, name):
    value = request.get(name)
    if value is None or value == '' or value == [] or value == {}:
        raise JiraError('MISSING_INPUT', '操作缺少参数：' + name)
    return value


def validate_fields(fields, metadata, required=False):
    if not isinstance(fields, dict):
        raise JiraError('FIELDS_INVALID', 'fields 必须为 JSON 对象。')
    unknown = set(fields) - set(metadata)
    if unknown:
        raise JiraError('FIELD_UNAVAILABLE', '字段不在当前页面元数据中。', {'fields': sorted(unknown)})
    if required:
        missing = [key for key, definition in metadata.items()
                   if definition.get('required') and not definition.get('hasDefaultValue')
                   and fields.get(key) in (None, '', [], {})]
        if missing:
            raise JiraError('REQUIRED_FIELDS', '请补齐当前 Jira 要求的字段。',
                            {'fields': [{'id': key, 'name': metadata[key].get('name', key)} for key in missing]})


def matches_field(actual, expected):
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return False
        return all(matches_field(actual.get(key), value) for key, value in expected.items())
    if isinstance(expected, list):
        if actual is None and not expected:
            return True
        if not isinstance(actual, list) or len(actual) != len(expected):
            return False
        remaining = list(actual)
        for value in expected:
            position = next((index for index, candidate in enumerate(remaining) if matches_field(candidate, value)), None)
            if position is None:
                return False
            remaining.pop(position)
        return True
    return actual == expected or (isinstance(actual, (int, str)) and isinstance(expected, (int, str)) and str(actual) == str(expected))


def plan(client, request):
    if not isinstance(request, dict) or request.get('action') not in ACTIONS:
        raise JiraError('ACTION_UNSUPPORTED', '请选择已支持的操作。', {'actions': ACTIONS})
    action = request['action']
    prepared = {'action': action, 'base_url': client.base_url, 'request': request, 'state': 'prepared'}
    if action == 'create':
        project = require_value(request, 'project')
        issue_type = require_value(request, 'issue_type')
        meta = client.create_meta(project, issue_type)
        fields = dict(request.get('fields', {}))
        if 'project' in fields or 'issuetype' in fields:
            raise JiraError('DUPLICATE_SCOPE', 'project 和 issue_type 由顶层参数指定，不重复写入 fields。')
        fields['project'] = {'key': project}
        fields['issuetype'] = {'id': meta['issue_type']['id']}
        validate_fields(fields, meta['fields'], required=True)
        prepared.update(fields=fields, project=project, issue_type=meta['issue_type']['name'])
        return prepared
    if action == 'link':
        inward = require_value(request, 'inward_issue')
        outward = require_value(request, 'outward_issue')
        client.issue(inward, 'key')
        client.issue(outward, 'key')
        link_name = require_value(request, 'link_type')
        types = client.request('GET', '/rest/api/2/issueLinkType')['issueLinkTypes']
        selected = [item for item in types if item['name'] == link_name or str(item['id']) == str(link_name)]
        if len(selected) != 1:
            raise JiraError('LINK_TYPE_AMBIGUOUS', '关联类型不唯一或不存在。', {'types': types})
        prepared['link'] = {'type': {'id': selected[0]['id']}, 'inwardIssue': {'key': inward}, 'outwardIssue': {'key': outward}}
        prepared['issue'] = outward
        return prepared
    key = require_value(request, 'issue')
    current = client.issue(key, 'status,assignee,attachment,issuelinks,project')
    prepared.update(issue=current['key'], before_status=current['fields']['status']['id'])
    if request.get('expected_status') and str(request['expected_status']) != str(prepared['before_status']):
        raise JiraError('STALE_TARGET', '任务状态已变化，请重新核对操作目标。')
    if action == 'update':
        metadata = client.request('GET', '/rest/api/2/issue/' + quote(key) + '/editmeta')['fields']
        validate_fields(request.get('fields', {}), metadata)
        changes = request.get('update', {})
        if not isinstance(changes, dict):
            raise JiraError('UPDATE_INVALID', 'update 必须为字段操作对象。')
        if not request.get('fields') and not changes:
            raise JiraError('MISSING_INPUT', '请提供 fields 或 update。')
        for field, instructions in changes.items():
            if field not in metadata or not isinstance(instructions, list):
                raise JiraError('FIELD_UNAVAILABLE', 'update 字段或操作格式不正确。')
            for instruction in instructions:
                if not isinstance(instruction, dict) or len(instruction) != 1 or next(iter(instruction)) not in metadata[field].get('operations', []):
                    raise JiraError('UPDATE_UNSUPPORTED', '当前元数据不允许该字段操作。')
        if set(changes) & set(request.get('fields', {})):
            raise JiraError('DUPLICATE_FIELDS', '同一字段不能同时出现在 fields 和 update。')
        prepared['expected_update'] = {}
        if changes:
            before = client.issue(key, ','.join(changes))['fields']
            for field, instructions in changes.items():
                expected = before.get(field)
                supported = True
                for instruction in instructions:
                    operation, value = next(iter(instruction.items()))
                    if operation == 'set':
                        expected = value
                    elif operation in ('add', 'remove') and isinstance(expected, list):
                        if operation == 'add':
                            if not any(matches_field(item, value) for item in expected):
                                expected = expected + [value]
                        else:
                            expected = [item for item in expected if not matches_field(item, value)]
                    else:
                        supported = False
                        break
                prepared['expected_update'][field] = {'supported': supported, 'value': expected}
    elif action == 'transition':
        transition_id = str(require_value(request, 'transition_id'))
        transitions = client.transitions(key)
        selected = [item for item in transitions if str(item['id']) == transition_id]
        if len(selected) != 1:
            raise JiraError('TRANSITION_UNAVAILABLE', '当前状态下不可执行该流转。', {'transitions': transitions})
        validate_fields(request.get('fields', {}), selected[0].get('fields', {}), required=True)
        prepared['transition'] = selected[0]
    elif action == 'assign':
        username = require_value(request, 'assignee')
        users = client.request('GET', '/rest/api/2/user/assignable/search?issueKey=' + quote(key) + '&username=' + quote(username) + '&maxResults=1000')
        if not any(user.get('name') == username and user.get('active', True) for user in users):
            raise JiraError('ASSIGNEE_UNAVAILABLE', '目标稳定用户名不可分配到该任务。')
    elif action == 'comment':
        if not isinstance(require_value(request, 'body'), str):
            raise JiraError('COMMENT_INVALID', '备注 body 必须为文字。')
    elif action == 'attach':
        paths = require_value(request, 'files')
        if not isinstance(paths, list) or not all(isinstance(item, str) for item in paths):
            raise JiraError('FILES_INVALID', 'files 必须是文件绝对路径列表。')
        settings = client.request('GET', '/rest/api/2/attachment/meta')
        if not settings.get('enabled'):
            raise JiraError('ATTACHMENTS_DISABLED', '站点未启用附件。')
        for path in paths:
            source = Path(path)
            if not source.is_absolute() or not source.is_file() or source.is_symlink():
                raise JiraError('FILE_UNAVAILABLE', '附件必须为存在的普通文件绝对路径。')
            if source.stat().st_size > min(settings.get('uploadLimit', 256 * 1024 * 1024), 256 * 1024 * 1024):
                raise JiraError('UPLOAD_LIMIT', '附件超过站点或工具单文件限制。')
            if re.search(r'[\r\n"]', source.name):
                raise JiraError('FILENAME_INVALID', '附件名称含不支持的字符。')
    elif action == 'delete-attachment':
        attachment_id = str(require_value(request, 'attachment_id'))
        if not any(str(item['id']) == attachment_id for item in current['fields'].get('attachment', [])):
            raise JiraError('ATTACHMENT_NOT_FOUND', '附件不属于指定任务。')
    elif action == 'unlink':
        link_id = str(require_value(request, 'link_id'))
        if not any(str(item['id']) == link_id for item in current['fields'].get('issuelinks', [])):
            raise JiraError('LINK_NOT_FOUND', '关联不属于指定任务。')
    return prepared


def upload(client, key, path):
    source = Path(path)
    boundary = 'youkia-' + uuid.uuid4().hex
    file_type = mimetypes.guess_type(source.name)[0] or 'application/octet-stream'
    header = ('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + source.name + '"\r\nContent-Type: ' + file_type + '\r\n\r\n').encode('utf-8')
    body = header + source.read_bytes() + ('\r\n--' + boundary + '--\r\n').encode('ascii')
    return client.request('POST', '/rest/api/2/issue/' + quote(key) + '/attachments', raw=body,
                          content_type='multipart/form-data; boundary=' + boundary)


def execute(client, request):
    prepared = plan(client, request)
    action = request['action']
    key = prepared.get('issue')
    path = '/rest/api/2/issue/' + quote(key) if key else None
    response = None
    completed_uploads = []
    try:
        if action == 'create':
            response = client.request('POST', '/rest/api/2/issue', {'fields': prepared['fields']})
            key = response['key']
        elif action == 'update':
            response = client.request('PUT', path, {name: request[name] for name in ('fields', 'update') if name in request})
        elif action == 'transition':
            response = client.request('POST', path + '/transitions', {'transition': {'id': prepared['transition']['id']}, 'fields': request.get('fields', {})})
        elif action == 'assign':
            response = client.request('PUT', path + '/assignee', {'name': request['assignee']})
        elif action == 'comment':
            response = client.request('POST', path + '/comment', {'body': request['body']})
        elif action == 'link':
            response = client.request('POST', '/rest/api/2/issueLink', prepared['link'])
        elif action == 'unlink':
            response = client.request('DELETE', '/rest/api/2/issueLink/' + quote(request['link_id']))
        elif action == 'delete-attachment':
            response = client.request('DELETE', '/rest/api/2/attachment/' + quote(request['attachment_id']))
        elif action == 'attach':
            for source in request['files']:
                result = upload(client, key, source)
                completed_uploads.extend(result)
        current = client.issue(key)
        fields = current['fields']
        verified = True
        checks = {}
        if action in ('create', 'update', 'transition'):
            requested_fields = prepared['fields'] if action == 'create' else request.get('fields', {})
            for field, expected in requested_fields.items():
                checks[field] = matches_field(fields.get(field), expected)
            if action == 'transition':
                checks['status'] = fields['status']['id'] == prepared['transition']['to']['id']
            for field, expectation in prepared.get('expected_update', {}).items():
                checks['update.' + field] = expectation['supported'] and matches_field(fields.get(field), expectation['value'])
            verified = all(checks.values())
        elif action == 'assign':
            verified = (fields.get('assignee') or {}).get('name') == request['assignee']
        elif action == 'comment':
            comment = client.request('GET', '/rest/api/2/issue/' + quote(key) + '/comment/' + quote(response['id']))
            verified = comment.get('body') == request['body']
        elif action == 'attach':
            attachment_ids = {str(item['id']) for item in fields.get('attachment', [])}
            verified = bool(completed_uploads) and all(str(item['id']) in attachment_ids for item in completed_uploads)
        elif action == 'delete-attachment':
            verified = str(request['attachment_id']) not in {str(item['id']) for item in fields.get('attachment', [])}
        elif action == 'unlink':
            verified = str(request['link_id']) not in {str(item['id']) for item in fields.get('issuelinks', [])}
        elif action == 'link':
            verified = any(str(item.get('type', {}).get('id')) == str(prepared['link']['type']['id'])
                           and item.get('inwardIssue', {}).get('key') == request['inward_issue'] for item in fields.get('issuelinks', []))
        return {'state': 'completed' if verified else 'needs_verification', 'action': action, 'issue': key,
                'url': client.base_url + '/browse/' + quote(key), 'verified': verified, 'checks': checks,
                'response': response, 'attachments': completed_uploads,
                'note': 'update 增量操作需结合回读内容复核。' if request.get('update') else None}
    except JiraError as error:
        return {'state': 'outcome_unknown' if error.code == 'OUTCOME_UNKNOWN' else 'incomplete',
                'action': action, 'issue': key, 'error': error.payload(), 'attachments_completed': completed_uploads,
                'note': '已发出的写请求不要自动重试；先回读确认具体完成步骤。'}
    except (KeyError, TypeError, AttributeError, ValueError, OSError):
        return {'state': 'outcome_unknown', 'action': action, 'issue': key,
                'attachments_completed': completed_uploads,
                'error': {'code': 'OUTCOME_UNKNOWN', 'message': '提交或回读格式异常；先检查目标，不重复执行写请求。'}}


def batch(client, requests, authorized=False):
    if not isinstance(requests, list) or not 1 <= len(requests) <= 100:
        raise JiraError('BATCH_INVALID', '批处理需提供 1–100 项明确操作。')
    plans = [plan(client, request) for request in requests]
    if not authorized:
        return {'state': 'prepared', 'count': len(plans), 'plans': plans}
    results = []
    for index, request in enumerate(requests):
        try:
            result = execute(client, request)
        except JiraError as error:
            result = {'state': 'blocked', 'error': error.payload()}
        results.append(result)
        if result['state'] != 'completed':
            return {'state': 'partial', 'results': results, 'not_attempted': len(requests) - index - 1}
    return {'state': 'completed', 'results': results, 'not_attempted': 0}
