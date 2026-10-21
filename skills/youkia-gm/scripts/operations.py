"""Reviewable plans, freshness checks, exactly-one local submission attempt."""
import copy
import json
import time
import uuid

from client import form_schema, normalize_params
from protocol import GMError
from storage import digest


def targets_arg(values):
    try:
        targets = [tuple(int(part) for part in value.split(':')) for value in values]
    except ValueError as exc:
        raise GMError('TARGET_FORMAT', 'Target format is cluster_uid:server_id') from exc
    if any(len(t) != 2 or min(t) <= 0 for t in targets):
        raise GMError('TARGET_FORMAT', 'Target format is positive cluster_uid:server_id')
    return targets


def grouped_targets(targets, known):
    names = {(s['cluster_uid'], s['id']): s['name'] for s in known}
    groups = {}
    for cluster, server in targets:
        groups.setdefault(cluster, {'cluster': cluster, 'servers': []})['servers'].append({'k': names[(cluster, server)], 'v': server})
    return list(groups.values())


def menu_plan(client, uid, params, targets, description='', unit='', record_uid=0):
    if not targets:
        targets = [(client.context['cluster'], client.context['server'])] if client.context['server'] else []
    if not targets:
        raise GMError('TARGET_REQUIRED', 'Specify exact server targets; all-server expansion is never implicit')
    known = client.validate_targets(targets, refresh=True)
    if any(s['status'] != 'RUN' for s in known):
        raise GMError('TARGET_NOT_RUNNING', 'One or more selected servers are not RUN')
    original_context = dict(client.context)
    primary_context = {**original_context, 'cluster': targets[0][0], 'server': targets[0][1]}
    if original_context != primary_context:
        client.select(primary_context)
    menu = client.menu(uid, fresh=True)
    kind = menu['type']
    if kind not in (2, 3):
        raise GMError('SPECIAL_PAGE', 'This menu is a dedicated page; use its registered API workflow')
    if kind == 2 and not menu['server'] and len(targets) != 1:
        raise GMError('TARGET_COUNT', 'Single-server menu requires exactly one target')
    kvs = normalize_params(menu, params, client.codec)
    schema_fingerprint = digest(menu)
    # Dynamic choices may vary by server. Validate every selected server before a batch.
    if menu['components'] and len(targets) > 1:
        for cluster, server in targets[1:]:
            client.select({**primary_context, 'cluster': cluster, 'server': server})
            other = client.menu(uid, fresh=True)
            if normalize_params(other, params, client.codec) != kvs:
                raise GMError('COMPONENT_VARIATION', 'Server-specific component values differ; split the operation')
        client.select(primary_context)
    groups = grouped_targets(targets, known)
    record_fingerprint = None
    if kind == 2:
        path, data = '/gm/menu_port/submit', {'uid': uid, 'kvs': kvs, 'servers': {'list': groups}}
    else:
        if not description.strip() or not unit.strip():
            raise GMError('RECORD_REQUIRED', 'Saved records require description and unit')
        if not menu['table']:
            raise GMError('TABLE_MISSING', 'Menu has no backing table')
        if record_uid:
            records = client.call('/gm/gtable_port/dyn_list', {'reply': menu['table']})['list']
            record = next((r for r in records if r['uid'] == record_uid and r['menu_uid'] == uid), None)
            if not record:
                raise GMError('RECORD_UNKNOWN', 'Record does not belong to this menu/table')
            if record['examine']:
                raise GMError('RECORD_APPROVED', 'Approved record cannot be edited through this workflow')
            record_fingerprint = digest(record)
        path = '/gm/gtable_port/dyn_update'
        data = {'uid': record_uid, 'desc': description, 'unit': unit, 'menu_uid': uid,
                'table_id': menu['table'], 'servers': groups, 'kvs': kvs}
    client.codec.encode(client.endpoints[path]['request'], data)
    return {'kind': 'menu', 'context': dict(client.context), 'endpoint': path, 'data': data,
            'menu_uid': uid, 'menu_name': menu['name'], 'menu_schema': schema_fingerprint,
            'params': params, 'targets': [list(t) for t in targets], 'description': description,
            'unit': unit, 'record_uid': record_uid, 'button': None, 'expects': [],
            'record_fingerprint': record_fingerprint,
            'expected_results': [[None, c, s] for c, s in targets] if kind == 2 else [],
            'stage': 'saved_record' if kind == 3 else 'task_submitted'}


def expectations(client, conditions):
    if not isinstance(conditions, list):
        raise GMError('GUARD_FORMAT', 'Expected state guards must be an array')
    for condition in conditions:
        endpoint = client.endpoints.get(condition.get('endpoint'))
        if not endpoint or endpoint['mode'] != 'read':
            raise GMError('GUARD_ENDPOINT', 'State guards must use a registered read endpoint')
        if 'equals' not in condition or not isinstance(condition.get('path'), list):
            raise GMError('GUARD_FORMAT', 'Guard requires a JSON path array and equals value')
        value = client.call(condition['endpoint'], condition.get('data', {}))
        try:
            for key in condition['path']:
                if isinstance(key, dict):
                    field, expected = next(iter(key.items()))
                    matches = [v for v in value if v.get(field) == expected]
                    if len(matches) != 1:
                        raise KeyError(field)
                    value = matches[0]
                else:
                    value = value[key]
        except (KeyError, TypeError, IndexError, StopIteration) as exc:
            raise GMError('GUARD_MISSING', 'Expected state could not be located') from exc
        if value != condition['equals'] or type(value) is not type(condition['equals']):
            raise GMError('STATE_CHANGED', 'Current state differs from the reviewed expectation')


def api_plan(client, endpoint, data, menu_uid, button, intent, expects):
    spec = client.endpoints.get(endpoint)
    if not spec or spec['mode'] != 'write':
        raise GMError('ENDPOINT_MODE', 'Plan requires a registered write endpoint')
    if endpoint == '/gm/menu_port/submit':
        raise GMError('USE_MENU_PLAN', 'Use menu-plan for menu submission and parameter validation')
    if not intent.strip():
        raise GMError('INTENT_REQUIRED', 'Describe the intended operation')
    if not menu_uid or not any(m['uid'] == menu_uid for m in client.auth['menus']):
        raise GMError('MENU_REQUIRED', 'Specify the discovered page menu UID for this operation')
    if not button or not button.replace('_', '').isalnum():
        raise GMError('BUTTON_REQUIRED', 'Specify the actual frontend permission button suffix')
    client.permit(menu_uid, button)
    if endpoint.rsplit('/', 1)[-1] in ('examine', 'dyn_examine', 'user_lock', 'project_seal', 'vsn_seal') and not expects:
        raise GMError('GUARD_REQUIRED', 'State-changing toggles require an expected-state guard')
    if endpoint == '/gm/gtable_port/dyn_examine':
        matched = any(g.get('endpoint') == '/gm/gtable_port/dyn_list'
                      and g.get('data') == {'reply': data.get('k')}
                      and g.get('path') == ['list', {'uid': data.get('v')}, 'examine']
                      and isinstance(g.get('equals'), bool) for g in expects)
        if not matched:
            raise GMError('GUARD_REQUIRED', 'Guard must match this table record and its examine state')
    if endpoint == '/gm/gactive_port/examine':
        matched = any(g.get('endpoint') == '/gm/gactive_port/active_list'
                      and g.get('path') == ['list', {'uid': data.get('item')}, 'examine']
                      and isinstance(g.get('equals'), bool) for g in expects)
        if not matched:
            raise GMError('GUARD_REQUIRED', 'Guard must match this activity and its examine state')
    client.codec.encode(spec['request'], data)
    expectations(client, expects)
    expected_results, records = [], []
    if endpoint in ('/gm/gactive_port/active_send', '/gm/gactive_port/active_send_quick'):
        targets = [(group['cluster'], server) for group in data.get('servers', []) for server in group.get('servers', [])]
        uids = data.get('uids', [])
        if not targets or not uids or len(set(uids)) != len(uids):
            raise GMError('TARGET_REQUIRED', 'Activity send requires distinct activity IDs and exact servers')
        client.validate_targets(targets, refresh=True)
        available = client.call('/gm/gactive_port/active_list')['list']
        records = [r for r in available if r['uid'] in uids]
        if {r['uid'] for r in records} != set(uids):
            raise GMError('RECORD_UNKNOWN', 'One or more activities are absent from the selected project')
        if endpoint.endswith('/active_send'):
            expected_results = [[uid, c, s] for uid in uids for c, s in targets]
    if endpoint in ('/gm/gtable_port/dyn_send', '/gm/gtable_port/dyn_send_quick'):
        for item in data.get('list', []):
            available = client.call('/gm/gtable_port/dyn_list', {'reply': item['k']})['list']
            record = next((r for r in available if r['uid'] == item['v1'] and r['menu_uid'] == item['v2']), None)
            if not record:
                raise GMError('RECORD_UNKNOWN', 'Record/menu/table combination is not present')
            targets = [(g['cluster'], s['v']) for g in record['servers'] for s in g['servers']]
            if not targets:
                raise GMError('TARGET_REQUIRED', 'Saved record has no explicit server targets')
            client.validate_targets(targets, refresh=True)
            records.append(record)
            if endpoint.endswith('/dyn_send'):
                expected_results.extend([[record['uid'], c, s] for c, s in targets])
        if not records:
            raise GMError('RECORD_REQUIRED', 'At least one saved record is required')
    stage = 'task_submitted' if spec['response'] == 'single_int' else 'platform_response'
    return {'kind': 'api', 'context': dict(client.context), 'endpoint': endpoint, 'data': data,
            'menu_uid': menu_uid, 'button': button, 'intent': intent, 'expects': expects,
            'expected_results': expected_results, 'records_fingerprint': digest(records),
            'resolved_records': records,
            'stage': stage, 'validation': 'protocol_types_and_permission; page_business_rules_require_review'}


def save_plan(client, plan):
    plan.update(id=uuid.uuid4().hex, identity=client.identity, created=time.time(),
                expires=time.time() + 900, protocol_hash=digest(client.spec), state='prepared')
    client.store.write('plan-' + plan['id'], plan)
    return {'plan_id': plan['id'], 'state': 'prepared', 'expires_in_seconds': 900,
            'context': plan['context'], 'endpoint': plan['endpoint'],
            'request': '[REDACTED: credential operation]' if any(x in plan['endpoint'] for x in ('pwd', 'user_create')) else plan['data'],
            'resolved_records': plan.get('resolved_records', []),
            'next_stage': plan['stage'], 'business_success': 'not_executed',
            'validation': plan.get('validation', 'menu_schema_options_targets_permission')}


def execute(client, plan_id):
    plan = client.store.read('plan-' + plan_id)
    if not plan:
        raise GMError('PLAN_UNKNOWN', 'Plan not found')
    if plan['state'] != 'prepared':
        raise GMError('ALREADY_ATTEMPTED', 'This plan was already attempted; inspect status/result instead of resubmitting')
    if plan['identity'] != client.identity:
        raise GMError('ACCOUNT_CHANGED', 'Plan belongs to a different account binding')
    if time.time() > plan['expires']:
        raise GMError('PLAN_EXPIRED', 'Plan expired; prepare and review a new plan')
    if plan['protocol_hash'] != digest(client.spec):
        raise GMError('PROTOCOL_CHANGED', 'Protocol snapshot changed after preflight')
    client.select(plan['context'])
    if plan['kind'] == 'menu':
        fresh = menu_plan(client, plan['menu_uid'], plan['params'], [tuple(t) for t in plan['targets']],
                          plan['description'], plan['unit'], plan['record_uid'])
        if fresh['menu_schema'] != plan['menu_schema'] or fresh['data'] != plan['data'] or fresh['record_fingerprint'] != plan.get('record_fingerprint'):
            raise GMError('SCHEMA_CHANGED', 'Menu or dynamic options changed; prepare a new plan')
    else:
        fresh = api_plan(client, plan['endpoint'], plan['data'], plan['menu_uid'], plan['button'], plan['intent'], plan['expects'])
        if fresh['records_fingerprint'] != plan['records_fingerprint'] or fresh['expected_results'] != plan['expected_results']:
            raise GMError('STATE_CHANGED', 'Selected records or their server targets changed after preflight')
    # Persist before the only mutation request. A crash/timeout must never reset this state.
    plan['state'], plan['attempted_at'] = 'attempting', time.time()
    client.store.write('plan-' + plan_id, plan)
    try:
        response = client.call(plan['endpoint'], plan['data'], read=False)
        plan['response'] = response
        plan['state'] = plan['stage']
        if client.endpoints[plan['endpoint']]['response'] == 'single_int':
            if response.get('item', 0) <= 0:
                plan['state'] = 'response_needs_review'
            else:
                plan['task_uid'] = response['item']
        elif client.endpoints[plan['endpoint']]['response'] == 'single_str' and response.get('reply') != 'ok':
            plan['state'] = 'response_needs_review'
    except BaseException as exc:
        plan['state'] = 'outcome_unknown'
        plan['error_code'] = getattr(exc, 'code', 'INTERRUPTED')
        client.store.write('plan-' + plan_id, plan)
        raise
    client.store.write('plan-' + plan_id, plan)
    return status(client, plan_id)


def status(client, plan_id):
    plan = client.store.read('plan-' + plan_id)
    if not plan or plan['identity'] != client.identity:
        raise GMError('PLAN_UNKNOWN', 'No plan exists for this account binding')
    return {key: plan[key] for key in ('id', 'state', 'context', 'endpoint', 'task_uid', 'response', 'error_code') if key in plan} | {'business_success': 'not_verified'}


def poll(client, plan_id, wait=0):
    plan = client.store.read('plan-' + plan_id)
    if not plan or plan['identity'] != client.identity or not plan.get('task_uid'):
        raise GMError('TASK_UNKNOWN', 'This account plan has no returned task UID')
    client.select(plan['context'])
    deadline = time.monotonic() + wait
    while True:
        result = client.call('/gm/gmanager_port/get_result', {'item': plan['task_uid']})
        # Response item UID is an entity/record ID, not necessarily the submitted task UID.
        received = {(item['uid'], group['cluster_id'], server['v'])
                    for item in result.get('items', []) for group in item.get('items', [])
                    for server in group.get('server_result', [])}
        expected = plan.get('expected_results', [])
        complete = bool(expected) and all(
            any((uid is None or uid == ruid) and cluster == rc and server == rs
                for ruid, rc, rs in received) for uid, cluster, server in expected)
        plan['last_result'] = result
        if complete:
            plan['state'] = 'transport_complete'
        client.store.write('plan-' + plan_id, plan)
        if complete or time.monotonic() >= deadline:
            return {'plan_id': plan_id, 'task_uid': plan['task_uid'], 'complete': complete,
                    'completion_verifiable': bool(expected), 'received_results': len(received),
                    'expected_results': len(expected) if expected else None,
                    'state': plan['state'], 'business_success': 'not_verified', 'result': result}
        time.sleep(min(1.0, max(0, deadline - time.monotonic())))
