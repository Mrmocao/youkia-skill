import base64
import ctypes
import json
import os
import re
import socket
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_URL = 'http://log.youkia.com:8084'
ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.1.0'


class JiraError(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def payload(self):
        return {'code': self.code, 'message': self.message, 'details': self.details}


def validate_url(value):
    parsed = urllib.parse.urlsplit(value.strip())
    try:
        valid_port = parsed.port
    except ValueError:
        raise JiraError('INVALID_URL', '网站端口不正确。') from None
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or
            parsed.username or parsed.password or parsed.query or parsed.fragment or
            any(character.isspace() for character in value)):
        raise JiraError('INVALID_URL', '请填写不含账号、查询参数和片段的 HTTP/HTTPS 网站地址。')
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip('/'), '', ''))


def connection_info(base_url):
    parsed = urllib.parse.urlsplit(base_url)
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(parsed.hostname, None)})
    except OSError:
        addresses = []
    return {'base_url': base_url, 'resolved_ips': addresses,
            'port': parsed.port or (443 if parsed.scheme == 'https' else 80)}


class Blob(ctypes.Structure):
    _fields_ = [('size', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def protect(data, decrypt=False):
    if os.name != 'nt':
        raise JiraError('WINDOWS_REQUIRED', '此版本使用 Windows 当前用户的凭证加密。')
    source_buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    destination = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if decrypt:
        success = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(destination))
    else:
        success = crypt.CryptProtectData(ctypes.byref(source), 'youkia JIRA助手', None, None, None, 1, ctypes.byref(destination))
    if not success:
        raise JiraError('CREDENTIAL_UNAVAILABLE', '凭证无法解密，请由当前 Windows 用户重新登录。')
    try:
        return ctypes.string_at(destination.data, destination.size)
    finally:
        ctypes.memset(source_buffer, 0, len(data))
        kernel.LocalFree(ctypes.cast(destination.data, ctypes.c_void_p))


def load_profile(state_dir):
    connection = Path(state_dir) / 'connection.bin'
    if not connection.is_file():
        raise JiraError('LOGIN_REQUIRED', '尚未配置登录，请打开登录窗口。')
    try:
        profile = json.loads(protect(connection.read_bytes(), decrypt=True))
        profile['base_url'] = validate_url(profile['base_url'])
        if profile['auth_mode'] not in ('password', 'token') or not profile.get('secret'):
            raise ValueError()
        if profile['auth_mode'] == 'password' and not profile.get('auth_username'):
            raise ValueError()
        return profile
    except JiraError:
        raise
    except Exception:
        raise JiraError('CREDENTIAL_UNAVAILABLE', '登录配置损坏或无法读取，请重新登录。') from None


def save_profile(state_dir, profile):
    allowed = ('base_url', 'username', 'auth_mode', 'auth_username', 'secret')
    clean = {key: profile.get(key, '') for key in allowed}
    clean['base_url'] = validate_url(clean['base_url'])
    directory = Path(state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(dir=directory, suffix='.tmp')
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(protect(json.dumps(clean, ensure_ascii=False).encode('utf-8')))
        os.replace(name, directory / 'connection.bin')
    finally:
        if os.path.exists(name):
            os.unlink(name)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def quote(value):
    return urllib.parse.quote(str(value), safe='')


def redact(value, secrets=()):
    if isinstance(value, dict):
        return {key: '[REDACTED]' if re.search(r'password|token|authorization|cookie|protected_secret|^secret$', key, re.I)
                else redact(item, secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, '[REDACTED]')
    return value


class JiraClient:
    def __init__(self, profile, timeout=30):
        self.base_url = validate_url(profile['base_url'])
        self.secret = profile['secret']
        if profile['auth_mode'] == 'token':
            self.authorization = 'Bearer ' + self.secret
        else:
            material = (profile['auth_username'] + ':' + self.secret).encode('utf-8')
            self.authorization = 'Basic ' + base64.b64encode(material).decode('ascii')
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect())

    def _url(self, path):
        if not path.startswith('/rest/') or path.startswith('//') or '\\' in path:
            raise JiraError('INVALID_API_PATH', '接口路径必须为本站 /rest/ 相对路径。')
        parsed = urllib.parse.urlsplit(path)
        decoded = urllib.parse.unquote(parsed.path)
        if parsed.netloc or parsed.scheme or parsed.fragment or '\\' in decoded or '%' in decoded or any(part in ('.', '..') for part in decoded.split('/')):
            raise JiraError('INVALID_API_PATH', '接口路径包含不允许的跳转或相对目录。')
        if any(ord(character) < 32 for character in path):
            raise JiraError('INVALID_API_PATH', '接口路径含无效字符。')
        return self.base_url + path

    def request(self, method, path, payload=None, raw=None, content_type=None, binary=False):
        url = self._url(path)
        return self._request_url(method, url, payload, raw, content_type, binary)

    def _request_url(self, method, url, payload=None, raw=None, content_type=None, binary=False):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else raw
        headers = {'Authorization': self.authorization, 'Accept': 'application/json', 'User-Agent': 'youkia-jira/' + VERSION}
        if body is not None:
            headers['Content-Type'] = content_type or 'application/json; charset=utf-8'
        if content_type and content_type.startswith('multipart/'):
            headers['X-Atlassian-Token'] = 'no-check'
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                limit = 256 * 1024 * 1024 if binary else 32 * 1024 * 1024
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise JiraError('RESPONSE_LIMIT', '响应超出单次处理大小限制。')
                if binary:
                    return data
                if not data:
                    return None
                try:
                    return json.loads(data.decode('utf-8-sig'))
                except (ValueError, UnicodeError):
                    code = 'OUTCOME_UNKNOWN' if method != 'GET' else 'INVALID_RESPONSE'
                    raise JiraError(code, '服务未返回可识别的 JSON；写请求需核查，不自动重试。') from None
        except urllib.error.HTTPError as error:
            status = error.code
            if method != 'GET' and status >= 500:
                error.close()
                raise JiraError('OUTCOME_UNKNOWN', '服务器异常，写入结果未知；先回读核查，不重试提交。', {'http_status': status}) from None
            details = {'http_status': status}
            if status in (400, 409, 422):
                try:
                    rejected = json.loads(error.read(65536))
                    details['validation'] = redact({key: rejected[key] for key in ('errors', 'errorMessages') if key in rejected}, (self.secret, self.authorization))
                except (ValueError, OSError):
                    pass
            error.close()
            if status == 401:
                code, message = 'LOGIN_REQUIRED', '登录已失效，请重新登录。'
            elif status == 403:
                code, message = 'PERMISSION_DENIED', '当前账号无权执行本请求，或站点要求额外登录验证。'
            elif status == 404:
                code, message = 'NOT_FOUND', '目标不存在、已不可见或接口不受支持，请实时重新发现。'
            elif 300 <= status < 400:
                code, message = 'REDIRECT_BLOCKED', '网站发生重定向，请确认正确网址后重新登录。'
            else:
                code, message = 'REQUEST_REJECTED', 'Jira 拒绝请求，请核对实时元数据和参数。'
            raise JiraError(code, message, details) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            code = 'NETWORK_ERROR' if method == 'GET' else 'OUTCOME_UNKNOWN'
            message = '无法连接 Jira，请检查网站和网络。' if method == 'GET' else '请求连接中断，写入结果未知；先回读核查，不重复提交。'
            raise JiraError(code, message) from None

    def read(self, path):
        decoded = urllib.parse.unquote(urllib.parse.urlsplit(path).path).lower()
        if not decoded.startswith(('/rest/api/2/', '/rest/agile/1.0/')) or re.search(r'/(password|session|token|tokens|pat)(/|$)', decoded):
            raise JiraError('READ_PATH_UNSUPPORTED', '仅探索 Jira 核心或敏捷 API 的只读资源，不访问凭证与会话接口。')
        return self.request('GET', path)

    def issue(self, key, fields=None, history=False):
        query = {}
        if fields:
            query['fields'] = fields
        if history:
            query['expand'] = 'changelog'
        suffix = '?' + urllib.parse.urlencode(query) if query else ''
        return self.request('GET', '/rest/api/2/issue/' + quote(key) + suffix)

    def search(self, jql, fields=None, limit=100, all_pages=False):
        if not 1 <= limit <= 10000:
            raise JiraError('LIMIT_INVALID', '查询上限应在 1–10000 之间。')
        collected = []
        offset = 0
        total = 0
        while len(collected) < limit:
            query = {'jql': jql, 'startAt': offset, 'maxResults': min(100, limit - len(collected))}
            if fields:
                query['fields'] = fields
            result = self.request('GET', '/rest/api/2/search?' + urllib.parse.urlencode(query))
            page = result.get('issues', [])
            total = result.get('total', len(page))
            collected.extend(page)
            offset += len(page)
            if not all_pages or not page or offset >= total:
                break
        unique = {issue['key']: issue for issue in collected}
        return {'jql': jql, 'total': total, 'returned': len(unique), 'complete': offset >= total,
                'issues': list(unique.values()), 'note': '实时分页查询期间 Jira 可能变化；关键操作前重新读取目标。'}

    def pages(self, path):
        values = []
        offset = 0
        for iteration in range(100):
            separator = '&' if '?' in path else '?'
            page = self.request('GET', path + separator + urllib.parse.urlencode({'startAt': offset, 'maxResults': 100}))
            batch = page.get('values', [])
            values.extend(batch)
            offset += len(batch)
            if page.get('isLast') or not batch or offset >= page.get('total', 1000000):
                return values
        raise JiraError('PAGINATION_LIMIT', '元数据分页达到处理上限，请缩小范围。')

    def create_meta(self, project, issue_type=None):
        path = '/rest/api/2/issue/createmeta/' + quote(project) + '/issuetypes'
        types = self.pages(path)
        if issue_type is None:
            return {'project': project, 'issue_types': types}
        selected = [item for item in types if str(item['id']) == str(issue_type) or item['name'].casefold() == str(issue_type).casefold()]
        if len(selected) != 1:
            raise JiraError('ISSUE_TYPE_AMBIGUOUS', '请从项目当前任务类型中选择唯一类型。', {'types': types})
        fields = self.pages(path + '/' + quote(selected[0]['id']))
        return {'project': project, 'issue_type': selected[0], 'fields': {item['fieldId']: item for item in fields}}

    def transitions(self, key):
        return self.request('GET', '/rest/api/2/issue/' + quote(key) + '/transitions?expand=transitions.fields')['transitions']

    def download(self, attachment_id, destination):
        metadata = self.request('GET', '/rest/api/2/attachment/' + quote(attachment_id))
        content = metadata['content']
        parsed = urllib.parse.urlsplit(content)
        base = urllib.parse.urlsplit(self.base_url)
        expected_path = base.path.rstrip('/') + '/secure/attachment/'
        if (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc) or not parsed.path.startswith(expected_path) or parsed.username:
            raise JiraError('ATTACHMENT_ORIGIN', '附件地址不属于当前 Jira，未发送登录凭证。')
        target = Path(destination).resolve()
        if target.exists():
            raise JiraError('OUTPUT_EXISTS', '目标文件已存在，请提供新路径。')
        data = self._request_url('GET', content, binary=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
        return {'id': str(attachment_id), 'path': str(target), 'bytes': len(data)}
