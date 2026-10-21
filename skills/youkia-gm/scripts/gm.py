#!/usr/bin/env python3
"""Standalone youkia GM skill CLI, version 0.1.2."""
import argparse
import getpass
import json
import os
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
# The official embedded runtime uses isolated sys.path without the script folder.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import Client, PROTOCOL_PATH, form_schema, validate_url
from operations import api_plan, execute, menu_plan, poll, save_plan, status, targets_arg
from protocol import GMError
from storage import Store

VERSION = '0.1.2'
GM_BASE_URL = 'http://192.168.5.7:8080'


def default_state_dir():
    """Runtime state lives beside the extracted skill, outside the ZIP."""
    return Path(__file__).resolve().parents[1] / 'state'


def read_json(path, default=None):
    if not path:
        return default if default is not None else {}
    try:
        return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        raise GMError('JSON_INPUT', 'Unable to read a valid UTF-8 JSON input file') from exc


def redact(value):
    if isinstance(value, dict):
        return {k: '[REDACTED]' if any(s in k.lower() for s in ('password', 'pwd', 'token', 'cookie')) else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def parser():
    p = argparse.ArgumentParser(description='youkia GM 0.1.2 — JSON results; no writes without an explicit plan execution')
    p.add_argument('--state-dir', help='Override the package-local encrypted state directory')
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('doctor')
    sub.add_parser('startup')
    c = sub.add_parser('configure')
    c.add_argument('--username')
    c.add_argument('--password-env', help='Read password from this environment variable; otherwise hidden prompt')
    c.add_argument('--import-cache', help='Explicit existing gm_cli config.json to read; source is never changed')
    c.add_argument('--operator', help='Exact account key for import-cache')
    c.add_argument('--replace', action='store_true', help='Explicitly replace the bound account')
    sub.add_parser('account')
    sub.add_parser('projects')
    c = sub.add_parser('endpoints')
    c.add_argument('--query', default='')
    c = sub.add_parser('api-schema')
    c.add_argument('endpoint')
    def context(c):
        c.add_argument('--project', type=int, required=True)
        c.add_argument('--version', type=int, required=True)
        c.add_argument('--cluster', type=int, help='Omit together with server to reuse the selected target')
        c.add_argument('--server', type=int, help='Omit together with cluster to reuse the selected target')
    for name in ('select-server', 'permissions', 'menus', 'servers', 'scan-functions', 'menus-cached', 'menu-schema', 'menu-plan', 'api-read', 'api-plan'):
        c = sub.add_parser(name)
        context(c)
        if name in ('menus', 'servers', 'menus-cached'):
            c.add_argument('--query', default='')
        if name == 'servers':
            c.add_argument('--refresh', action='store_true')
        if name in ('menu-schema', 'menu-plan'):
            c.add_argument('--menu', type=int, required=True)
        if name == 'menu-plan':
            c.add_argument('--params-file', required=True)
            c.add_argument('--target', action='append', default=[])
            c.add_argument('--description', default='')
            c.add_argument('--unit', default='')
            c.add_argument('--record-uid', type=int, default=0)
        if name in ('api-read', 'api-plan'):
            c.add_argument('endpoint')
            c.add_argument('--data-file')
        if name == 'api-plan':
            c.add_argument('--menu', type=int, required=True)
            c.add_argument('--button', required=True)
            c.add_argument('--intent', required=True)
            c.add_argument('--expects-file')
    for name in ('execute', 'status', 'result'):
        c = sub.add_parser(name)
        c.add_argument('plan_id')
        if name == 'execute':
            c.add_argument('--yes', action='store_true', help='Confirm this exact reviewed plan is authorized')
        if name == 'result':
            c.add_argument('--wait', type=int, default=0, choices=range(0, 61), metavar='0..60')
    return p


def configure(args, store):
    current = store.read('account')
    if current and not args.replace:
        raise GMError('ACCOUNT_BOUND', 'Account already bound; use account to inspect, or explicit --replace to change it')
    if args.import_cache:
        if not args.operator:
            raise GMError('OPERATOR_REQUIRED', 'Import requires an exact --operator')
        cache = read_json(args.import_cache)
        accounts = cache.get('accounts', {})
        account = accounts.get(args.operator) if isinstance(accounts, dict) else next((a for a in accounts if a.get('name') == args.operator), None)
        if not account:
            raise GMError('ACCOUNT_UNKNOWN', 'Requested account is absent from that cache')
        cached_base, username, password = account.get('base_url'), account.get('username'), account.get('password')
        if str(cached_base or '').rstrip('/') != GM_BASE_URL:
            raise GMError('BASE_URL_MISMATCH', 'The selected cached account belongs to a different fixed GM address')
        base = GM_BASE_URL
    else:
        base, username = GM_BASE_URL, args.username
        if not base or not username:
            raise GMError('CONFIG_REQUIRED', 'Supply --username; the GM address is fixed in this skill')
        password = os.environ.get(args.password_env) if args.password_env else getpass.getpass('GM password (hidden): ')
    if not base or not username or not password:
        raise GMError('CREDENTIALS_REQUIRED', 'GM address, username and password are required')
    profile = {'base_url': validate_url(base), 'username': username, 'password': password, 'generation': uuid.uuid4().hex}
    # Validate before replacing an existing binding. Isolated scratch session, same store lock.
    client = Client(store, profile)
    previous_session = store.read('session', {})
    try:
        client.login()
    except BaseException:
        store.write('session', previous_session)
        raise
    store.write('account', profile)
    return {'configured': True, 'base_url': profile['base_url'], 'username': username,
            'credential_storage': 'Windows DPAPI current user', 'state_directory': str(store.root)}


def run(args):
    spec = json.loads(PROTOCOL_PATH.read_text(encoding='utf-8'))
    if args.command == 'doctor':
        return {'version': VERSION, 'python': sys.version.split()[0], 'windows': os.name == 'nt',
                'python_executable': sys.executable, 'runtime_source': os.environ.get('youkia_gm_runtime_source', 'direct'),
                'schemas': len(spec['schemas']), 'endpoints': len(spec['endpoints']),
                'requirements_ok': os.name == 'nt' and sys.version_info >= (3, 10),
                'gm_base_url': GM_BASE_URL, 'state_default': str(default_state_dir())}
    if args.command == 'endpoints':
        return [e for path, e in spec['endpoints'].items() if args.query.casefold() in path.casefold()]
    if args.command == 'api-schema':
        endpoint = spec['endpoints'].get(args.endpoint)
        if not endpoint:
            raise GMError('ENDPOINT_UNKNOWN', 'No registered endpoint')
        definitions = {}
        def visit(name):
            if not name or name in definitions:
                return
            definitions[name] = spec['schemas'][name]
            for field in definitions[name]['fields'].values():
                if field['type'] in spec['schemas']:
                    visit(field['type'])
        visit(endpoint['request'])
        visit(endpoint['response'])
        return {'endpoint': endpoint, 'schemas': definitions}
    state_path = Path(args.state_dir or os.environ.get('youkia_gm_state') or default_state_dir()).resolve()
    package = Path(__file__).resolve().parents[1]
    store = Store(state_path)
    with store.lock():
        if args.command == 'startup':
            profile = store.read('account')
            if not profile:
                return {'stage': 'bind_account', 'configured': False, 'gm_base_url': GM_BASE_URL,
                        'state_directory': str(store.root)}
            client = Client(store)
            selected = store.read('selection', {})
            context = selected.get('context') if selected.get('identity') == client.identity else None
            cached = None
            if context:
                client.context = context
                try:
                    cached = client.cached_functions()
                except GMError as exc:
                    if exc.code != 'FUNCTION_SCAN_REQUIRED':
                        raise
            return {'configured': True, 'username': profile['username'],
                    'stage': 'ready' if cached else 'select_project',
                    'context': context, 'menu_count': cached['menu_count'] if cached else 0,
                    'server_selected': bool(context and context.get('cluster') and context.get('server')),
                    'server_names': selected.get('names', {}) if context else {},
                    'accept_server_and_task_together': True,
                    'state_directory': str(store.root), 'cached_state_only': True}
        if args.command == 'configure':
            return configure(args, store)
        client = Client(store)
        if args.command == 'account':
            return {'username': client.profile['username'], 'base_url': client.base, 'bound': True,
                    'session_cached': bool(client.session), 'state_directory': str(store.root)}
        if args.command == 'projects':
            return client.projects()
        if args.command == 'execute':
            if not args.yes:
                raise GMError('EXECUTE_CONFIRMATION', 'Use --yes only for the exact operation authorized by the user')
            return execute(client, args.plan_id)
        if args.command == 'status':
            return status(client, args.plan_id)
        if args.command == 'result':
            return poll(client, args.plan_id, args.wait)
        context = client.resolve_context(args.project, args.version, args.cluster, args.server)
        if args.command == 'select-server':
            if args.cluster is None or args.server is None:
                raise GMError('SERVER_REQUIRED', 'Explicit cluster and server are required when changing the saved selection')
            return client.bind_server(context)
        if args.command == 'menus-cached':
            client.context = context
            result = client.cached_functions()
            q = args.query.casefold()
            result['menus'] = [m for m in result['menus'] if q in (m['parent'] + '/' + m['name']).casefold()]
            result['matched_count'] = len(result['menus'])
            result['cached_state_only'] = True
            return result
        client.select(context)
        if args.command == 'permissions':
            return client.auth
        if args.command == 'menus':
            q = args.query.casefold()
            return [m for m in client.auth['menus'] if q in (m['parent'] + '/' + m['name']).casefold()]
        if args.command == 'servers':
            result = client.servers(args.refresh)
            q = args.query.casefold()
            result['servers'] = [s for s in result['servers'] if q in (str(s['id']) + ' ' + s['name']).casefold()]
            return result
        if args.command == 'scan-functions':
            return client.scan_functions()
        if args.command == 'menu-schema':
            menu = client.menu(args.menu)
            return {'menu': menu, 'fields': form_schema(menu, client.codec)}
        if args.command == 'menu-plan':
            plan = menu_plan(client, args.menu, read_json(args.params_file), targets_arg(args.target), args.description, args.unit, args.record_uid)
            return save_plan(client, plan)
        data = read_json(args.data_file)
        if args.command == 'api-read':
            endpoint = client.endpoints.get(args.endpoint)
            if not endpoint or endpoint['mode'] != 'read':
                raise GMError('READ_ONLY', 'api-read accepts only registered read endpoints')
            return client.call(args.endpoint, data)
        if args.command == 'api-plan':
            plan = api_plan(client, args.endpoint, data, args.menu, args.button, args.intent, read_json(args.expects_file, []))
            return save_plan(client, plan)
        raise GMError('COMMAND', 'Unknown command')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        result = redact(run(parser().parse_args()))
        print(json.dumps({'ok': True, 'data': result}, ensure_ascii=False, indent=2))
        return 0
    except GMError as exc:
        # Do not propagate server/user input into the error output.
        message = str(exc) if exc.code != 'GM_REJECTED' else 'GM rejected the request; check permissions, parameters and current state'
        print(json.dumps({'ok': False, 'error': {'code': exc.code, 'message': message}}, ensure_ascii=False))
        return 2
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({'ok': False, 'error': {'code': 'INPUT_OR_PROTOCOL_ERROR', 'message': type(exc).__name__}}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
