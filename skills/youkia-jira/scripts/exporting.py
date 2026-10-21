import hashlib
import json
import re
import shutil
from pathlib import Path

from core import JiraError, ROOT, VERSION


MODULES = ('operations', 'workflow', 'reports', 'diagnostics')
COMMON = ('jira.ps1', 'scripts/bootstrap.ps1', 'scripts/login.ps1', 'scripts/core.py',
          'scripts/jira.py', 'scripts/operations.py', 'scripts/exporting.py',
          'assets/python-3.14.8-embed-amd64.zip', 'assets/icon.svg',
          'references/usage.md', 'references/extension.md', 'references/integration.md',
          'references/coverage.md')
REFERENCES = {'operations': ('references/operations.md',), 'workflow': ('references/operations.md', 'references/workflows.md'),
              'reports': ('scripts/reports.py', 'references/reports.md', 'assets/demo.json'),
              'diagnostics': ('scripts/reports.py', 'references/diagnostics.md')}


def manifest(directory, module='assistant'):
    files = {}
    for path in sorted(directory.rglob('*')):
        if not path.is_file() or path.name == 'manifest.json' or any(part in ('state', 'runtime', '__pycache__') for part in path.relative_to(directory).parts):
            continue
        files[path.relative_to(directory).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    result = {'name': 'youkia JIRA助手', 'id': directory.name, 'version': VERSION, 'module': module,
              'platform': 'Windows x64', 'state_policy': 'credentials-only; no project or issue cache', 'sha256': files}
    (directory / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


def export_skills(destination, modules):
    if not modules or any(module not in MODULES + ('assistant',) for module in modules) or len(modules) != len(set(modules)):
        raise JiraError('MODULE_INVALID', '请选择不重复的 assistant、operations、workflow、reports 或 diagnostics。')
    destination = Path(destination).resolve()
    if destination == ROOT or destination.is_relative_to(ROOT):
        raise JiraError('EXPORT_LOCATION', '请导出到源包之外的项目技能目录。')
    outputs = [destination / ('youkia-jira' if module == 'assistant' else 'youkia-jira-' + module) for module in modules]
    if any(output.exists() for output in outputs):
        raise JiraError('OUTPUT_EXISTS', '目标技能已存在，本次不覆盖。')
    source_manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    for module in modules:
        paths = tuple(source_manifest['sha256']) if module == 'assistant' else COMMON + REFERENCES[module] + tuple('modules/' + template + '.md' for template in MODULES)
        for relative in paths:
            source = ROOT / relative
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(ROOT):
                raise JiraError('EXPORT_DEPENDENCY', '技能依赖文件缺失或路径不正确。', {'file': relative})
            if source_manifest['sha256'].get(relative) != hashlib.sha256(source.read_bytes()).hexdigest():
                raise JiraError('PACKAGE_CHANGED', '源包文件与清单不符，请确认修改并重新生成清单后导出。', {'file': relative})
    for module, output in zip(modules, outputs):
        paths = tuple(source_manifest['sha256']) if module == 'assistant' else COMMON + REFERENCES[module]
        for relative in paths:
            target = output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        if module != 'assistant':
            shutil.copy2(ROOT / 'modules' / (module + '.md'), output / 'SKILL.md')
            for template in MODULES:
                source = ROOT / 'modules' / (template + '.md')
                if source.exists():
                    target = output / 'modules' / (template + '.md')
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
            agents = output / 'agents'
            agents.mkdir(exist_ok=True)
            label = {'operations': '任务操作', 'workflow': '工作流', 'reports': '报告', 'diagnostics': '诊断'}[module]
            (agents / 'openai.yaml').write_text('interface:\n  display_name: "youkia JIRA助手 · ' + label + '"\n  short_description: "实时查询 Jira 并按当前元数据执行' + label + '，可独立集成到项目"\n  default_prompt: "使用 $youkia-jira-' + module + ' 处理当前 Jira 需求。"\n', encoding='utf-8')
        manifest(output, module)
    return {'state': 'exported', 'skills': [str(output) for output in outputs], 'credentials_copied': False,
            'note': '每个技能可独立部署。首次自行登录，或显式指定宿主的凭证目录；项目与任务不缓存。'}
