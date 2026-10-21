"""youkia protocol transport, session reuse, discovery, and form validation."""
import base64
import hashlib
import json
import re
import time
from datetime import datetime
from http.cookiejar import Cookie, CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener

from protocol import Codec, GMError
from storage import digest


PROTOCOL_PATH = Path(__file__).resolve().parents[1] / 'references' / 'protocol.json'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise GMError('HTTP_REDIRECT', 'Redirect rejected; configure the final GM origin')


class Client:
    def __init__(self, store, profile=None):
        self.store = store
        self.profile = profile or store.read('account')
        if not self.profile:
            raise GMError('NOT_CONFIGURED', 'Run configure to bind a GM account')
        self.spec = json.loads(PROTOCOL_PATH.read_text(encoding='utf-8'))
        self.codec = Codec(self.spec['schemas'])
        self.endpoints = self.spec['endpoints']
        self.base = self.profile['base_url'].rstrip('/')
        self.identity = digest({'url': self.base, 'username': self.profile['username'],
                                'generation': self.profile['generation']})
        self.session = store.read('session', {})
        if self.session.get('identity') != self.identity:
            self.session = {}
        self.cookies = CookieJar()
        for item in self.session.get('cookies', []):
            self.cookies.set_cookie(Cookie(**item))
        self.opener = build_opener(HTTPCookieProcessor(self.cookies), NoRedirect())
        self.context = None
        self.auth = None

    def save_session(self):
        cookies = []
        for item in self.cookies:
            cookies.append({name: getattr(item, name) for name in (
                'version', 'name', 'value', 'port', 'port_specified', 'domain',
                'domain_specified', 'domain_initial_dot', 'path', 'path_specified',
                'secure', 'expires', 'discard', 'comment', 'comment_url', 'rfc2109')})
            cookies[-1]['rest'] = dict(item._rest)
        self.session.update(identity=self.identity, cookies=cookies)
        self.store.write('session', self.session)

    def post(self, path, request_type=None, response_type=None, data=None):
        headers = {'Content-Type': 'application/octet-stream'}
        token = self.session.get('user_token')
        if token:
            headers['user_token'] = token
        raw = self.codec.encode(request_type, data or {})
        try:
            with self.opener.open(Request(self.base + path, data=raw, headers=headers, method='POST'), timeout=30) as response:
                envelope = self.codec.decode('gm_reply', response.read())
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise GMError('TRANSPORT_ERROR', 'GM request failed or timed out; a submitted operation may have executed') from exc
        payload = base64.b64decode(envelope['info'])
        if envelope['status'] in (2, 3):
            message = self.codec.decode('single_str', payload)['reply']
            if message == 'relogin':
                raise GMError('SESSION_EXPIRED', 'GM session expired')
            # Avoid returning arbitrary backend details that may contain credential material.
            raise GMError('GM_REJECTED', 'GM rejected the request: ' + message[:240])
        if envelope['status'] not in (0, 1):
            raise GMError('PROTOCOL_STATUS', 'Unknown GM envelope status')
        return self.codec.decode(response_type, payload) if response_type else {}

    def login(self):
        self.session = {}
        self.cookies.clear()
        try:
            with self.opener.open(self.base + '/', timeout=30) as response:
                response.read()
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise GMError('LOGIN_UNREACHABLE', 'GM login page is unreachable') from exc
        response = self.post('/gm/login', 'login_req', 'login_resp', {
            'user': self.profile['username'],
            'pwd': hashlib.md5(self.profile['password'].encode(), usedforsecurity=False).hexdigest()})
        if response['msg'] != 'ok' or not response['user_token']:
            raise GMError('LOGIN_REQUIRED', 'Login was not accepted or a password change is required')
        self.session = {**response, 'identity': self.identity}
        self.save_session()

    def ensure_login(self):
        if not self.session.get('user_token'):
            self.login()

    def call(self, path, data=None, read=True):
        endpoint = self.endpoints.get(path)
        if not endpoint:
            raise GMError('ENDPOINT_UNKNOWN', 'Endpoint is absent from the verified protocol snapshot')
        self.ensure_login()
        try:
            result = self.post(path, endpoint['request'], endpoint['response'], data)
        except GMError as exc:
            if exc.code != 'SESSION_EXPIRED' or not read:
                raise
            # Only a server-explicit relogin response on a read permits one retry.
            previous = self.context
            self.login()
            if previous:
                self.context = None
                self.select(previous)
            result = self.post(path, endpoint['request'], endpoint['response'], data)
        self.save_session()
        return result

    def projects(self):
        return self.call('/gm/project_port/list').get('values', [])

    def resolve_context(self, project, version, cluster=None, server=None):
        """Inherit a user-selected target only inside the same account/project/version."""
        selected = self.store.read('selection', {})
        previous = selected.get('context', {}) if selected.get('identity') == self.identity else {}
        same_project = previous.get('project') == project and previous.get('version') == version
        if (cluster is None) != (server is None):
            raise GMError('TARGET_INVALID', 'Supply both cluster and server, or omit both to reuse the selected server')
        if cluster is None:
            cluster = previous.get('cluster', 0) if same_project else 0
            server = previous.get('server', 0) if same_project else 0
        if cluster < 0 or server < 0 or bool(cluster) != bool(server):
            raise GMError('TARGET_INVALID', 'Use an exact positive cluster/server pair; 0/0 means no server')
        return {'project': project, 'version': version, 'cluster': cluster, 'server': server}

    def bind_server(self, context):
        """Validate and remember an explicit user choice, without executing a business task."""
        if context.get('cluster', 0) <= 0 or context.get('server', 0) <= 0:
            raise GMError('SERVER_REQUIRED', 'Select a real cluster and server; zero is not a default server')
        self.select(context)
        target = self.validate_targets([(context['cluster'], context['server'])], refresh=True)[0]
        clusters = self.servers()['clusters']
        cluster = next((c for c in clusters if c['uid'] == context['cluster']), {})
        names = {'cluster': cluster.get('name', ''), 'server': target['name']}
        self.store.write('selection', {'identity': self.identity, 'context': dict(self.context), 'names': names})
        return {'context': dict(self.context), 'names': names, 'server_status': target['status'],
                'selection_saved': True, 'business_submissions': 0}

    def select(self, context):
        project, version = int(context['project']), int(context['version'])
        if (project == 0) != (version == 0) or project < 0 or version < 0:
            raise GMError('CONTEXT_INVALID', 'Project and version must be a discovered pair')
        if project:
            projects = self.projects()
            if not any(p['uid'] == project and any(v['uid'] == version for v in p['vsns']) for p in projects):
                raise GMError('PROJECT_DENIED', 'Account has no discovered project/version pair')
        self.context = None
        if project == 0:
            self.call('/gm/project_port/project_exit', read=True)
            manager = False
        else:
            manager = self.call('/gm/project_port/project_select', {'project': project, 'vsn': version, 'server': 0})['item'] == 1
        self.context = {'project': project, 'version': version,
                        'cluster': int(context.get('cluster', 0)), 'server': int(context.get('server', 0))}
        if bool(self.context['cluster']) != bool(self.context['server']):
            raise GMError('TARGET_INVALID', 'Cluster and server must be supplied together')
        if self.context['server']:
            self.validate_targets([(self.context['cluster'], self.context['server'])])
            self.call('/gm/gserver_port/server_select', {'k': self.context['cluster'], 'v': self.context['server']})
        keys = self.call('/gm/group_port/menus_ids').get('item', [])
        visible = self.call('/gm/menu_port/format_menus').get('menu_summarys', [])
        self.auth = {'manager': self.session.get('manager', False), 'project_manager': manager,
                     'keys': keys, 'menus': visible}
        return self.auth

    def servers(self, refresh=False):
        key = 'servers-' + digest({'identity': self.identity, 'context': {k: self.context[k] for k in ('project', 'version')}})
        cached = self.store.read(key)
        if not refresh and cached and time.time() - cached['time'] < 60:
            return cached['data']
        clusters = self.call('/gm/gserver_port/list').get('clusters', [])
        ids = [c['uid'] for c in clusters]
        servers = self.call('/gm/gserver_port/refresh', {'item': ids}).get('servers', []) if ids else []
        result = {'clusters': clusters, 'servers': servers}
        self.store.write(key, {'time': time.time(), 'data': result})
        return result

    def validate_targets(self, targets, refresh=False):
        if len(set(targets)) != len(targets):
            raise GMError('TARGET_DUPLICATE', 'Duplicate server targets')
        known = {(s['cluster_uid'], s['id']): s for s in self.servers(refresh)['servers']}
        for target in targets:
            if target not in known:
                raise GMError('TARGET_UNKNOWN', 'Target is not in the current account server list')
        return [known[t] for t in targets]

    def permit(self, menu_uid, button=None):
        if not self.auth:
            raise GMError('CONTEXT_REQUIRED', 'Select project before checking permissions')
        if self.auth['manager'] or self.auth['project_manager']:
            return
        key = str(menu_uid) + ('_' + button if button else '')
        if key not in self.auth['keys']:
            raise GMError('PERMISSION_DENIED', 'Missing effective permission: ' + key)

    def menu(self, uid, fresh=False):
        self.permit(uid)
        key = 'functions-' + digest({'identity': self.identity, 'project': self.context['project'], 'version': self.context['version']}) if self.context else ''
        cached = None if fresh or not key else self.store.read(key)
        if cached:
            cached_menu = next((m for m in cached.get('menus', []) if m.get('uid') == uid), None)
            if cached_menu:
                ids = {int(w['ty']) for w in cached_menu.get('widgets', [])
                       if str(w.get('ty', '')).isdigit() and int(w['ty']) >= 1000}
                same_server = all(cached.get('context', {}).get(k) == self.context.get(k)
                                  for k in ('cluster', 'server'))
                if not ids or (same_server and cached.get('dynamic_status') == 'resolved'):
                    return {**cached_menu, 'components': [c for c in cached.get('dynamic_components', []) if c['uid'] in ids]}
        menu = self.call('/gm/menu_port/format_menu', {'item': uid})
        ids = sorted({int(w['ty']) for w in menu['widgets'] if w['ty'].isdigit() and int(w['ty']) >= 1000})
        components = []
        if ids:
            if not self.context['server']:
                raise GMError('SERVER_REQUIRED', 'Dynamic options require an explicit cluster and server')
            components = self.call('/gm/assembly_port/assembly_serialize', {'item': ids})['list']
            if {a['uid'] for a in components} != set(ids):
                raise GMError('COMPONENT_MISSING', 'GM did not return all required components')
        menu['components'] = components
        return menu

    def scan_functions(self):
        """Read and cache project function definitions without submitting GM work."""
        if not self.context:
            raise GMError('CONTEXT_REQUIRED', 'Select a project before scanning functions')
        visible = {m['uid'] for m in self.auth.get('menus', [])} if self.auth else set()
        try:
            menus = self.call('/gm/menu_port/list').get('values', [])
        except GMError as exc:
            if exc.code != 'GM_REJECTED':
                raise
            menus = [self.call('/gm/menu_port/format_menu', {'item': uid}) for uid in sorted(visible)]
        menus = [m for m in menus if m['uid'] in visible]
        dynamic_ids = sorted({int(w['ty']) for m in menus for w in m.get('widgets', [])
                              if str(w.get('ty', '')).isdigit() and int(w['ty']) >= 1000})
        components, dynamic_status = [], 'deferred_until_server_selection' if dynamic_ids else 'not_required'
        if dynamic_ids and self.context.get('server'):
            components = self.call('/gm/assembly_port/assembly_serialize', {'item': dynamic_ids}).get('list', [])
            if {c['uid'] for c in components} != set(dynamic_ids):
                raise GMError('COMPONENT_MISSING', 'GM did not return all requested component definitions')
            dynamic_status = 'resolved'
        catalog = {'identity': self.identity, 'context': dict(self.context), 'menus': menus,
                   'visible_menu_uids': sorted(visible), 'dynamic_component_ids': dynamic_ids,
                   'dynamic_components': components, 'dynamic_status': dynamic_status,
                   'scanned_at': time.time()}
        key = 'functions-' + digest({'identity': self.identity, 'project': self.context['project'], 'version': self.context['version']})
        self.store.write(key, catalog)
        selected = self.store.read('selection', {})
        same = selected.get('identity') == self.identity and all(
            selected.get('context', {}).get(k) == self.context[k] for k in ('project', 'version'))
        # A definition refresh does not change an explicit server selection.
        if not same:
            self.store.write('selection', {'identity': self.identity, 'context': dict(self.context)})
        return {'cache_key': key, 'project': self.context['project'], 'version': self.context['version'],
                'menu_count': len(menus), 'visible_menu_count': len(visible),
                'dynamic_component_count': len(dynamic_ids), 'dynamic_status': dynamic_status,
                'cache_directory': str(self.store.root)}

    def cached_functions(self):
        if not self.context:
            raise GMError('CONTEXT_REQUIRED', 'Select a project before reading cached functions')
        key = 'functions-' + digest({'identity': self.identity, 'project': self.context['project'], 'version': self.context['version']})
        catalog = self.store.read(key)
        if not catalog:
            raise GMError('FUNCTION_SCAN_REQUIRED', 'Scan this project before reading its cached functions')
        return {'cache_key': key, 'scanned_at': catalog['scanned_at'],
                'menu_count': len(catalog['menus']), 'visible_menu_count': len(catalog['visible_menu_uids']),
                'dynamic_component_count': len(catalog['dynamic_component_ids']),
                'dynamic_status': catalog['dynamic_status'], 'menus': catalog['menus']}


def component_options(component, codec):
    if component.get('childs'):
        return [{'key': c['desc'], 'value': c['name']} for c in component['childs']]
    if component.get('adata'):
        data = codec.decode('data', base64.b64decode(component['adata']))
        choices = codec.decode('list_kv_string', base64.b64decode(data['binary']))['list']
        return [{'key': c['k'], 'value': c['v']} for c in choices]
    return [{'key': c['k'], 'value': c['v']} for c in component.get('kvs', [])]


def form_schema(menu, codec):
    components = {c['uid']: c for c in menu.get('components', [])}
    def expand(comp):
        return {'type': comp['ty'], 'name': comp['name'], 'title': comp['desc'],
                'options': component_options(comp, codec),
                'children': [expand(c) for c in comp.get('childs', [])]}
    fields = []
    for w in sorted(menu['widgets'], key=lambda item: item['seq']):
        result = {'argument': w['arg'], 'title': w['title'], 'note': w['note'],
                  'required': w['exist'], 'type': w['ty'], 'options': w['kvs']}
        if w['ty'].isdigit() and int(w['ty']) >= 1000:
            result['component'] = expand(components[int(w['ty'])])
        fields.append(result)
    return fields


def normalize_params(menu, params, codec):
    if not isinstance(params, dict):
        raise GMError('PARAM_TYPE', 'Parameters must be a JSON object')
    fields = form_schema(menu, codec)
    unknown = set(params) - {f['argument'] for f in fields}
    if unknown:
        raise GMError('PARAM_UNKNOWN', 'Unknown menu parameters: ' + ', '.join(sorted(unknown)))

    def value_for(ty, value, options, required):
        if value is None or value == '' or value == []:
            if required:
                raise GMError('PARAM_REQUIRED', 'A required menu parameter is empty')
            return ''
        if ty == 'table':
            rows = json.loads(value) if isinstance(value, str) else value
            if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
                raise GMError('PARAM_TABLE', 'Table value must be an array of row objects')
            columns = {o['value']: o for o in options if o.get('value')}
            for row in rows:
                if set(row) - set(columns):
                    raise GMError('PARAM_TABLE', 'Unknown table column')
                for name, col in columns.items():
                    if col.get('default') and (name not in row or row[name] is None or str(row[name]).strip() == ''):
                        raise GMError('PARAM_TABLE', 'Required table cell is empty: ' + name)
            return json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
        if ty == 'datapicker':
            try:
                datetime.strptime(str(value), '%Y-%m-%d %H:%M:%S')
            except ValueError as exc:
                raise GMError('PARAM_DATE', 'Date must be yyyy-MM-dd HH:mm:ss (GM server timezone)') from exc
        if ty in ('select', 'radio', 'checkbox'):
            selected = value if isinstance(value, list) else str(value).split(',') if ty == 'checkbox' else [value]
            valid = {str(o['value']) for o in options}
            if any(str(v) not in valid for v in selected):
                raise GMError('PARAM_OPTION', 'Use actual option values from menu schema, not labels')
            if ty != 'checkbox' and len(selected) != 1:
                raise GMError('PARAM_OPTION', 'Single-select requires one value')
            return ','.join(str(v) for v in selected)
        if ty not in ('input', 'textarea', 'hidden', 'datapicker'):
            raise GMError('WIDGET_UNSUPPORTED', 'Unsupported widget: ' + ty)
        if isinstance(value, (dict, list, bool)):
            raise GMError('PARAM_TYPE', 'Text input requires a string or number')
        return str(value)

    def dynamic(comp, value, required):
        if isinstance(value, dict):
            if set(value) - {'value', 'child'} or 'value' not in value:
                raise GMError('PARAM_COMPONENT', 'Dynamic value requires value and optional child')
            selected, child_value = value['value'], value.get('child')
        else:
            selected, child_value = value, None
        val = value_for(comp['type'], selected, comp['options'], required)
        if comp['children'] and val:
            child = next((c for c in comp['children'] if c['name'] == val), None)
            if child is None or child_value is None:
                raise GMError('PARAM_COMPONENT', 'Selected branch requires its child value')
            val += ':' + dynamic(child, child_value, True)
        elif child_value is not None:
            raise GMError('PARAM_COMPONENT', 'Unexpected child value')
        return val

    result = []
    for field in fields:
        key, ty = field['argument'], field['type']
        if ty == 'hidden':
            if key in params and str(params[key]) != field['title']:
                raise GMError('PARAM_HIDDEN', 'Hidden field cannot be overridden')
            value = field['title']
        else:
            value = params.get(key)
            if value is None and not field['required']:
                value = next((o['value'] for o in field['options'] if o.get('default')), '')
        normalized = dynamic(field['component'], value, field['required']) if 'component' in field else value_for(ty, value, field['options'], field['required'])
        result.append({'k': key, 'v': normalized})
    return result


def validate_url(value):
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise GMError('BASE_URL', 'Use the GM origin only, for example https://gm.example.com')
    return value.rstrip('/')
