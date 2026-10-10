#!/usr/bin/env python3
"""Private native Convex snapshots for the local trial. Never selects a default deployment."""
import argparse
import errno
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import secrets
import shutil
import socket
import shlex
import tarfile
import time
import urllib.request
from datetime import datetime, timezone
import zipfile

REPO = Path(__file__).resolve().parents[3]
CLI = REPO / 'apps/web/node_modules/.bin/convex'
SELECTORS = ('CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY')
# Reviewed additive schema at the first-load candidate. No other native differences
# are permitted when restoring an older owner snapshot against this application.
RESTORE_EMPTY_TABLE_ADDITIONS = (
    'catalogProducts', 'catalogReviews', 'catalogRevisions', 'catalogVariants',
    'outcomeAssessments', 'outcomeAssessmentRevisions', 'personalAdaptationPreferences',
    'personalPlanGuidance', 'personalPlanGuidanceEntries',
)
SNAPSHOT_ARTIFACTS = {'snapshot.zip', 'source.tar', 'configuration.env'}
RELEASE_ARTIFACTS = {'phone-build.tar', 'release-binding.json'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args, cwd, env=None, input_data=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=input_data, capture_output=True, timeout=180)
    if result.returncode:
        # Convex diagnostics may include credentials or private records.
        if len(args) > 1 and args[1].endswith('trial-recovery-access.mjs'):
            message = result.stderr.decode().strip().splitlines()[-1]
            if message.startswith('Restored application verification failed at '):
                raise ValueError(message)
        raise ValueError('Command failed; private command output suppressed: ' + args[0])
    return result.stdout


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


def private_root(path):
    path = Path(path).expanduser()
    if path.is_symlink():
        raise ValueError('Private recovery directory cannot be a symbolic link')
    path = path.resolve(strict=True)
    if path == REPO or REPO in path.parents or path == Path.home() or path == Path('/'):
        raise ValueError('Snapshots require a dedicated private directory outside the repository')
    if path.stat().st_mode & 0o077:
        raise ValueError('Private snapshot parent must have mode 0700')
    return path


def inventory(path):
    """Hash/count all native table/component records and stored file payloads without printing them."""
    tables, files = {}, {}
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError('Corrupt snapshot ZIP')
        for name in archive.namelist():
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('Unsafe snapshot entry')
            if name.endswith('/documents.jsonl'):
                rows = [json.loads(line) for line in archive.read(name).splitlines() if line.strip()]
                canonical = sorted(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)
                tables[name.removesuffix('/documents.jsonl')] = {'count': len(rows), 'sha256': digest('\n'.join(canonical).encode())}
            elif not name.endswith('/') and '/_storage/' in '/' + name:
                files[name] = digest(archive.read(name))
    return {'tables': tables, 'files': files}


def native(args, config, private_dir, web=None):
    env = {key: value for key, value in os.environ.items() if key not in SELECTORS}
    env['CONVEX_AGENT_MODE'] = 'anonymous'
    env_path = private_dir / 'selector.env'
    private_write(env_path, ('CONVEX_SELF_HOSTED_URL=http://127.0.0.1:' + str(config['ports']['cloud'])
                            + '\nCONVEX_SELF_HOSTED_ADMIN_KEY=' + config['adminKey'] + '\n').encode())
    try:
        return run([str(CLI), *args, '--env-file', str(env_path)], web or REPO / 'apps/web', env)
    finally:
        env_path.unlink()


def restored_content(source_path, target_path, permitted_empty_tables=()):
    """Preserve exact captured rows/files; permit only reviewed empty root-table additions."""
    source, target = inventory(source_path), inventory(target_path)
    additions = set(target['tables']) - set(source['tables'])
    if (source['files'] != target['files'] or set(source['tables']) - set(target['tables'])
            or not additions.issubset(permitted_empty_tables)):
        raise ValueError('Restored table/component/file content differs from the captured snapshot')
    empty = {'count': 0, 'sha256': digest(b'')}
    if any(target['tables'][name] != empty for name in additions):
        raise ValueError('Added restore table contains uncaptured rows')
    for name, coverage in source['tables'].items():
        if name == '_tables' and additions:
            continue
        if target['tables'][name] != coverage:
            raise ValueError('Restored captured rows differ in ' + name)
    if additions:
        def registry(path):
            with zipfile.ZipFile(path) as archive:
                rows = [json.loads(line) for line in archive.read('_tables/documents.jsonl').splitlines() if line.strip()]
            if any(set(row) != {'id', 'name'} for row in rows):
                raise ValueError('Unreviewed native table registry format')
            if len({row['name'] for row in rows}) != len(rows):
                raise ValueError('Duplicate native table registry entry')
            if len({json.dumps(row['id'], sort_keys=True) for row in rows}) != len(rows):
                raise ValueError('Duplicate native table registry ID')
            return {row['name']: row for row in rows}
        old_registry, new_registry = registry(source_path), registry(target_path)
        if (any(new_registry.get(name) != row for name, row in old_registry.items())
                or set(new_registry) - set(old_registry) != additions):
            raise ValueError('Restored native table registry differs beyond reviewed additions')
    return {'capturedTables': len(source['tables']), 'restoredTables': len(target['tables']),
            'addedEmptyTables': sorted(additions), 'capturedRowsAndFilesMatched': True}


def source_config(web):
    web = Path(web).resolve(strict=True)
    if (web / '.convex/local/default').is_symlink() or (web / '.convex/local/default/config.json').is_symlink():
        raise ValueError('Source deployment configuration cannot be a symbolic link')
    config = json.loads((web / '.convex/local/default/config.json').read_text())
    if config['deploymentName'] != 'anonymous-agent' or config['ports'] != {'cloud': 3220, 'site': 3221}:
        raise ValueError('Source must be the designated anonymous-agent backend on 3220/3221')
    return web, config


def archive_hashes(data):
    """Inspect an archive without extracting paths, links or duplicate entries."""
    hashes = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        names = set()
        for member in archive:
            path = Path(member.name)
            if (path.is_absolute() or '..' in path.parts or str(path) != member.name.rstrip('/')
                    or member.name.rstrip('/') in names or not (member.isfile() or member.isdir())):
                raise ValueError('Unsafe release archive entry')
            names.add(member.name.rstrip('/'))
            if member.isfile():
                hashes[member.name] = digest(archive.extractfile(member).read())
    return hashes


def bound_files(root, hashes):
    if not hashes:
        raise ValueError('Release file bindings are empty')
    result = {}
    for name, expected in sorted(hashes.items()):
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or str(relative) != name or name == '.':
            raise ValueError('Unsafe release file binding')
        path = root / relative
        if path.resolve(strict=True) != path or not path.is_file():
            raise ValueError('Release files must be regular and nonlinked')
        data = path.read_bytes()
        if digest(data) != expected:
            raise ValueError('Release file binding differs: ' + name)
        result[name] = data
    return result


def build_archive(root, hashes):
    files = bound_files(root, hashes)
    actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file() or path.is_symlink()}
    if actual != set(files):
        raise ValueError('Phone build contains unbound files')
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(data), 0o600
            archive.addfile(member, io.BytesIO(data))
    return output.getvalue()


def release_source(web, config, release):
    """Bind the explicit release bundle to its reviewed commit and phone acceptance receipt."""
    release = private_root(release)
    names = ['prepared.json', 'phone-verified.json', 'deployed.json', 'cutover.json', 'source.tar']
    for name in names:
        path = release / name
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            raise ValueError('Release receipt must be a private regular file')
    prepared, accepted, deployed, serving = (json.loads((release / name).read_text()) for name in names[:4])
    head = prepared['candidate']
    if len(head) != 40 or any(character not in '0123456789abcdef' for character in head):
        raise ValueError('Release requires an exact commit hash')
    if (prepared['root'] != str(release) or prepared['backend'] != config['deploymentName']
            or prepared['ports'] != config['ports']
            or prepared['ownerConfigSha256'] != digest((web / '.convex/local/default/config.json').read_bytes())):
        raise ValueError('Release owner/backend binding differs')
    for receipt in [accepted, deployed, serving]:
        if receipt['candidate'] != head or receipt['backendPid'] != serving['backendPid']:
            raise ValueError('Release deployment/acceptance binding differs')
    for key in ['buildId', 'phoneOrigin', 'webPid', 'backend']:
        if accepted[key] != serving[key]:
            raise ValueError('Release serving/acceptance binding differs')
    if (accepted['sourceFiles'] != prepared['sourceFiles'] or accepted['buildFiles'] != prepared['buildFiles']
            or accepted['buildId'] != prepared['buildId'] or accepted['phoneOrigin'] != prepared['phoneOrigin']
            or accepted['ports'] != config['ports'] or serving['backend'] != config['deploymentName']
            or serving['webPort'] != 3006 or prepared['remoteBackendPort'] != 10444
            or prepared['phoneOrigin'] not in {'https://macbook-pro.tail221f42.ts.net:10443', 'https://macbook-pro.tail221f42.ts.net'}
            or not accepted['publicBuildAssetsMatched'] or not accepted['ownerConfigUnchanged']
            or not accepted['authConfigurationUnchanged']):
        raise ValueError('Release source/build acceptance differs')
    source = (release / 'source.tar').read_bytes()
    if (digest(source) != accepted['sourceArchiveSha256'] or digest(source) != deployed['sourceArchiveSha256']
            or source != run(['git', 'archive', '--format=tar', head], REPO)
            or archive_hashes(source) != prepared['sourceFiles']):
        raise ValueError('Release source archive differs from its reviewed commit')
    code = release / 'code'
    bound_files(code, prepared['sourceFiles'])
    actual_source = {str(path.relative_to(code)) for path in code.rglob('*')
                     if (path.is_file() or path.is_symlink()) and 'node_modules' not in path.relative_to(code).parts
                     and 'dist' not in path.relative_to(code).parts}
    # Deployment creates this selector locally; its secrets never enter the code archive.
    if actual_source - {'apps/web/.env.local'} != set(prepared['sourceFiles']):
        raise ValueError('Release source contains unbound files')
    build = build_archive(release / 'code/apps/web/dist', prepared['buildFiles'])
    binding = {'releaseDirectory': str(release), 'head': head, 'buildId': prepared['buildId'],
               'backend': config['deploymentName'], 'ports': config['ports'], 'phoneOrigin': prepared['phoneOrigin'],
               'backendPid': serving['backendPid'], 'webPid': serving['webPid'], 'webPort': serving['webPort'],
               'sourceFiles': prepared['sourceFiles'], 'buildFiles': prepared['buildFiles'],
               'receiptsSha256': {name: digest((release / name).read_bytes()) for name in names[:4]}}
    return source, build, binding


def check_serving(web, config, binding):
    code = Path(binding['releaseDirectory']) / 'code'
    command = shlex.split(run(['ps', '-p', str(binding['backendPid']), '-o', 'command='], REPO).decode())
    binary = Path.home() / '.cache/convex/binaries' / config['backendVersion'] / 'convex-local-backend'
    expected = {'--port': '3220', '--site-proxy-port': '3221', '--instance-name': config['deploymentName'],
                '--local-storage': str(web / '.convex/local/default/convex_local_storage')}
    if not command or command[0] != str(binary) or any(
            key not in command or command.index(key) + 1 >= len(command) or command[command.index(key) + 1] != value
            for key, value in expected.items()):
        raise ValueError('Live owner backend differs from the release binding')
    listener = run(['lsof', '-nP', '-iTCP:3006', '-sTCP:LISTEN', '-F', 'pn'], REPO).decode().splitlines()
    cwd = run(['lsof', '-nP', '-a', '-p', str(binding['webPid']), '-d', 'cwd', '-F', 'pn'], REPO).decode().splitlines()
    if ([line for line in listener if line.startswith('p')] != ['p' + str(binding['webPid'])]
            or 'n127.0.0.1:3006' not in listener or 'n' + str(code / 'apps/web') not in cwd):
        raise ValueError('Live phone preview differs from the release binding')
    with urllib.request.urlopen('http://127.0.0.1:3220/instance_name', timeout=10) as response:
        if response.read().decode() != config['deploymentName']:
            raise ValueError('Live owner backend identity differs')
    for name in ['offline-assets.json', 'manifest.webmanifest']:
        with urllib.request.urlopen(binding['phoneOrigin'] + '/' + name, timeout=10) as response:
            if digest(response.read()) != binding['buildFiles']['client/' + name]:
                raise ValueError('Served phone build differs from the release binding')
    with urllib.request.urlopen(binding['phoneOrigin'] + '/api/auth/ok', timeout=10) as response:
        if response.status != 200:
            raise ValueError('Phone authentication endpoint unavailable')


def capture(web, output, release=None, phone_origin=None):
    if phone_origin is not None and (not release or phone_origin != 'https://macbook-pro.tail221f42.ts.net'):
        raise ValueError('Unsupported phone origin; requires the reviewed served release and approved portless address')
    web, config = source_config(web)
    source_repo = web.parents[1]
    if release:
        source, build, binding = release_source(web, config, release)
        serving_binding = binding if phone_origin is None else {
            **binding, 'phoneOrigin': phone_origin, 'acceptedPhoneOrigin': binding['phoneOrigin'],
        }
        check_serving(web, config, serving_binding)
        head = binding['head']
        schema = (Path(binding['releaseDirectory']) / 'code/convex/schema.ts').read_bytes()
    else:
        if run(['git', 'diff', '--name-only', 'HEAD'], source_repo).strip():
            raise ValueError('Capture requires a clean tracked checkout or an explicit verified served release')
        head = run(['git', 'rev-parse', 'HEAD'], source_repo).decode().strip()
        source = run(['git', 'archive', '--format=tar', head], source_repo)
        schema = (source_repo / 'convex/schema.ts').read_bytes()
    directory = Path(tempfile.mkdtemp(prefix='snapshot-', dir=private_root(output)))
    native(['export', '--include-file-storage', '--path', str(directory / 'snapshot.zip')], config, directory)
    os.chmod(directory / 'snapshot.zip', 0o600)
    configuration = native(['env', 'list'], config, directory)
    private_write(directory / 'configuration.env', configuration)
    private_write(directory / 'source.tar', source)
    artifacts = set(SNAPSHOT_ARTIFACTS)
    if release:
        after = release_source(web, config, release)
        if after != (source, build, binding):
            raise ValueError('Release changed during capture')
        check_serving(web, config, serving_binding)
        private_write(directory / 'phone-build.tar', build)
        private_write(directory / 'release-binding.json', json.dumps(serving_binding, indent=2).encode())
        artifacts.update(RELEASE_ARTIFACTS)
    if native(['env', 'list'], config, directory) != configuration:
        raise ValueError('Backend configuration changed during capture')
    manifest = {
        'format': 'washcloset-trial-recovery/v1',
        'capturedAt': datetime.now(timezone.utc).isoformat(),
        'source': {'deploymentName': config['deploymentName'], 'ports': config['ports'], 'principalIssuer': 'http://127.0.0.1:3221',
                   'backendVersion': config['backendVersion'], 'checkout': str(source_repo), 'head': head},
        'toolVersions': {'convex': run([str(CLI), '--version'], REPO / 'apps/web').decode().strip(),
                         'python': sys.version.split()[0]},
        'captureToolSha256': digest(Path(__file__).read_bytes()),
        'sha256': {name: digest((directory / name).read_bytes()) for name in sorted(artifacts)},
        'schemaSha256': digest(schema),
        'coverage': inventory(directory / 'snapshot.zip'),
        'excluded': ['pending scheduled functions', 'environment configuration inside snapshot', 'application code inside snapshot'],
        'scope': 'deployment-wide private snapshot; not a household export',
    }
    if release:
        manifest['source']['runtimeSourceDirectory'] = str(Path(binding['releaseDirectory']) / 'code')
        manifest['source']['buildId'] = binding['buildId']
        manifest['source']['servedReleaseVerifiedBeforeAndAfterCapture'] = True
    private_write(directory / 'manifest.json', json.dumps(manifest, indent=2).encode())
    private_write(directory / 'manifest.sha256', (digest((directory / 'manifest.json').read_bytes()) + '\n').encode())
    verify(directory)
    print(json.dumps({'snapshotDirectory': str(directory), 'sourceHead': head,
                      'tables': len(manifest['coverage']['tables']), 'files': len(manifest['coverage']['files']),
                      'authComponentIncluded': any('betterAuth/' in name for name in manifest['coverage']['tables']),
                      'servedReleaseCaptured': release is not None}))


def verify(directory):
    directory = private_root(directory)
    for name in ['manifest.json', 'manifest.sha256', 'snapshot.zip', 'source.tar', 'configuration.env']:
        path = directory / name
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Private artifact must be a regular nonlinked file with mode 0600')
    if digest((directory / 'manifest.json').read_bytes()) != (directory / 'manifest.sha256').read_text().strip():
        raise ValueError('Manifest checksum mismatch')
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != 'washcloset-trial-recovery/v1':
        raise ValueError('Unsupported manifest format')
    artifacts = set(manifest['sha256'])
    if artifacts not in [SNAPSHOT_ARTIFACTS, SNAPSHOT_ARTIFACTS | RELEASE_ARTIFACTS]:
        raise ValueError('Unsupported recovery artifact set')
    for name in artifacts:
        path = directory / name
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            raise ValueError('Private artifact must be a regular nonlinked file with mode 0600')
        if digest((directory / name).read_bytes()) != manifest['sha256'][name]:
            raise ValueError('Artifact checksum mismatch: ' + name)
    if RELEASE_ARTIFACTS.issubset(artifacts):
        binding = json.loads((directory / 'release-binding.json').read_text())
        if (binding['head'] != manifest['source']['head'] or binding['buildId'] != manifest['source']['buildId']
                or binding['backend'] != manifest['source']['deploymentName'] or binding['ports'] != manifest['source']['ports']
                or binding['sourceFiles']['convex/schema.ts'] != manifest['schemaSha256']
                or archive_hashes((directory / 'source.tar').read_bytes()) != binding['sourceFiles']
                or archive_hashes((directory / 'phone-build.tar').read_bytes()) != binding['buildFiles']):
            raise ValueError('Archived release bindings differ')
    if inventory(directory / 'snapshot.zip') != manifest['coverage']:
        raise ValueError('Snapshot coverage mismatch')
    return manifest


def target_config(config):
    if (not config['deploymentName'].startswith('washcloset-restore-')
            or config['ports'] != {'cloud': 3230, 'site': 3231}):
        raise ValueError('Restore target must be an isolated washcloset-restore-* backend on 3230/3231')
    return config


def personal_checks(principal, household_id, preferences, guidance, entries):
    """Bind a bounded application sample to the caller's exported rows and exact garment references."""
    own = [row for row in preferences if row['principalKey'] == principal and row['householdId'] == household_id]
    global_scope = next((row for row in own if row['textileId'] is None),
                        {'enabled': True, 'resetAt': 0, 'revision': 0})
    preference_checks = []
    for row in sorted(own, key=lambda row: row['textileId'] or '')[:3]:
        preference_checks.append({'textileId': row['textileId'], 'expected': {
            'scope': {key: row[key] for key in ['enabled', 'resetAt', 'revision']},
            'effective': {'enabled': global_scope['enabled'] and row['enabled'],
                          'resetAt': max(global_scope['resetAt'], row['resetAt'])}}})
    saved = sorted((row for row in guidance if row['principalKey'] == principal and row['householdId'] == household_id),
                   key=lambda row: (-row['savedAt'], row['_id']))[:2]
    for row in saved:
        references = [entry['textileId'] for entry in entries if entry['guidanceId'] == row['_id']]
        if sorted(references) != sorted(row['personalInput']['textileIds']):
            raise ValueError('Captured private guidance garment references differ')
    return {'preferences': preference_checks, 'guidance': saved}


def private_check_candidates(candidates, preferences, guidance, entries):
    """Sample controls and recent guidance independently; older stale rows cannot monopolize proof."""
    checked = [(row, personal_checks(row[2], row[3], preferences, guidance, entries)) for row in candidates]
    selected = {}
    controls = max(checked, key=lambda item: len(item[1]['preferences']))
    if controls[1]['preferences']:
        selected[controls[0][1:4]] = controls
    elif preferences:
        raise ValueError('Populated private table lacks an authorized restored application sample')
    saved = [item for item in checked if item[1]['guidance']]
    if guidance and not saved:
        raise ValueError('Populated private table lacks an authorized restored application sample')
    saved.sort(key=lambda item: (-max(row['savedAt'] for row in item[1]['guidance']), item[0][1:4]))
    for item in saved[:3]:
        selected[item[0][1:4]] = item
    return list(selected.values())


def require_free_recovery_ports():
    for port in (3230, 3231):
        with socket.socket() as probe:
            result = probe.connect_ex(('127.0.0.1', port))
        if result == 0:
            raise ValueError('Isolated recovery port already occupied')
        if result != errno.ECONNREFUSED:
            raise ValueError('Cannot determine isolated recovery port availability')


def rehearse(directory):
    directory = private_root(directory)
    manifest = verify(directory)
    if not any('betterAuth/' in name for name in manifest['coverage']['tables']):
        raise ValueError('Snapshot lacks Better Auth component coverage')
    require_free_recovery_ports()
    rehearsal = Path(tempfile.mkdtemp(prefix='restore-', dir=directory.parent))
    # Tracked source only. Never copy .env, .data, local databases or custom harness directories.
    code = rehearsal / 'code'
    for relative in run(['git', 'ls-files', '-z'], REPO).decode().split('\0'):
        if not relative:
            continue
        source, target = REPO / relative, code / relative
        if source.is_symlink():
            raise ValueError('Tracked source links are unsupported for the drill')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    for relative in ['node_modules', 'apps/web/node_modules', 'convex/node_modules', 'packages/planner/node_modules']:
        if (REPO / relative).exists():
            (code / relative).symlink_to(REPO / relative, target_is_directory=True)
    binary = Path.home() / '.cache/convex/binaries' / manifest['source']['backendVersion'] / 'convex-local-backend'
    config = target_config({'deploymentName': 'washcloset-restore-' + secrets.token_hex(6),
                            'ports': {'cloud': 3230, 'site': 3231}, 'instanceSecret': secrets.token_hex(32)})
    config['adminKey'] = run([str(binary), 'keygen', 'admin-key', '--instance-name', config['deploymentName'],
                              '--instance-secret', config['instanceSecret']], rehearsal).decode().strip()
    private_write(rehearsal / 'target.json', json.dumps(config).encode())
    log = open(rehearsal / 'backend.log', 'xb')
    os.chmod(log.name, 0o600)
    def start_backend(database, storage):
        return subprocess.Popen([str(binary), '--interface', '127.0.0.1', '--port', '3230', '--site-proxy-port', '3231',
                                '--instance-name', config['deploymentName'], '--instance-secret', config['instanceSecret'],
                                '--disable-beacon',
                                '--local-storage', str(rehearsal / storage), str(rehearsal / database)],
                               cwd=rehearsal, stdout=log, stderr=log)
    def ready():
        for _ in range(60):
            if backend.poll() is not None:
                raise ValueError('Isolated backend stopped; inspect its private log')
            try:
                urllib.request.urlopen('http://127.0.0.1:3230/version', timeout=1).close()
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise ValueError('Isolated backend did not become ready')
    backend = start_backend('database.sqlite3', 'storage')
    try:
        ready()
        # Restore only secrets required for account/file validation; never push keys or contacts.
        parse_env = 'process.stdout.write(JSON.stringify(require("util").parseEnv(require("fs").readFileSync(process.argv[1], "utf8"))));'
        captured = json.loads(run(['node', '-e', parse_env, str(directory / 'configuration.env')], REPO))
        settings = {key: captured[key] for key in ['BETTER_AUTH_SECRET', 'WASHCLOSET_PHOTO_URL_SECRET'] if key in captured}
        settings.update({'WASHCLOSET_RECOVERY_MODE': 'rehearsal',
                         'WASHCLOSET_PRINCIPAL_ISSUER': captured.get('WASHCLOSET_PRINCIPAL_ISSUER', manifest['source']['principalIssuer']),
                         'SITE_URL': 'http://127.0.0.1:3231', 'WASHCLOSET_TRUSTED_ORIGINS': 'http://127.0.0.1:3231',
                         'WASHCLOSET_AUTH_RATE_LIMIT': 'disabled', 'WASHCLOSET_TEST_UTILS': 'enabled'})
        settings_file = rehearsal / 'configuration.env'
        private_write(settings_file, ''.join(key + '=' + json.dumps(value) + '\n' for key, value in settings.items()).encode())
        native(['env', 'set', '--from-file', str(settings_file)], config, rehearsal)
        native(['dev', '--once', '--typecheck', 'disable'], config, rehearsal, code / 'apps/web')
        native(['import', '--replace-all', '--yes', str(directory / 'snapshot.zip')], config, rehearsal)
        restored = rehearsal / 'restored.zip'
        native(['export', '--include-file-storage', '--path', str(restored)], config, rehearsal)
        os.chmod(restored, 0o600)
        native_comparison = restored_content(directory / 'snapshot.zip', restored, RESTORE_EMPTY_TABLE_ADDITIONS)
        with zipfile.ZipFile(directory / 'snapshot.zip') as archive:
            def rows(table):
                if table + '/documents.jsonl' not in archive.namelist():
                    return []
                return [json.loads(line) for line in archive.read(table + '/documents.jsonl').splitlines() if line.strip()]
            users, memberships, textiles, sessions, records = (rows(table) for table in
                ['_components/betterAuth/user', 'memberships', 'textiles', 'sessions', 'washRecords'])
            preferences, guidance, entries = (rows(table) for table in
                ['personalAdaptationPreferences', 'personalPlanGuidance', 'personalPlanGuidanceEntries'])
        issuer = settings['WASHCLOSET_PRINCIPAL_ISSUER']
        candidates = []
        for user in users:
            principal = 'principal:v1:' + digest(json.dumps([issuer, user['_id']], separators=(',', ':')).encode())
            for member in memberships:
                if member['principalKey'] != principal:
                    continue
                owned = [item for item in textiles if item['householdId'] == member['householdId'] and 'trashedAt' not in item]
                active = [item for item in sessions if item['householdId'] == member['householdId'] and item['status'] == 'running']
                history_ids = sorted(set(record['textileId'] for record in records if record['textileId'] in {item['_id'] for item in owned}))
                candidates.append((len(active) * 1000 + len(history_ids) * 10 + len(owned), user['_id'], principal, member['householdId'], owned, active, history_ids))
        if not candidates:
            raise ValueError('No restored auth account matches captured household membership; check the source issuer')
        _, user_id, principal, household_id, owned, active, history_ids = max(candidates, key=lambda candidate: candidate[0])
        cookies = json.loads(native(['run', 'testing:recoveredSignedInUser', json.dumps({'userId': user_id, 'domain': '127.0.0.1'})], config, rehearsal, code / 'apps/web'))
        access_input = {**cookies, 'principalKey': principal, 'householdId': household_id,
                        'textileIds': [item['_id'] for item in owned], 'sessions': active, 'historyTextileIds': history_ids}
        def application_check(data):
            return json.loads(run(['node', str(REPO / 'apps/web/scripts/trial-recovery-access.mjs')], REPO,
                                  input_data=json.dumps(data).encode()))
        application = application_check(access_input)
        history_candidate = max(candidates, key=lambda candidate: len(candidate[6]))
        _, history_user, history_principal, history_household, history_owned, history_active, history_ids = history_candidate
        history_cookies = json.loads(native(['run', 'testing:recoveredSignedInUser', json.dumps({'userId': history_user, 'domain': '127.0.0.1'})], config, rehearsal, code / 'apps/web'))
        history_application = application_check({**history_cookies, 'principalKey': history_principal, 'householdId': history_household,
                                                 'textileIds': [item['_id'] for item in history_owned], 'sessions': history_active,
                                                 'historyTextileIds': history_ids})
        private_applications = []
        # Native equality covers every row. API checks sample up to three recent
        # guidance accounts plus the richest controls account, with explicit counts.
        private_candidates = private_check_candidates(candidates, preferences, guidance, entries)
        for candidate, checks in private_candidates:
            _, private_user, private_principal, private_household, private_owned, private_active, private_history = candidate
            private_cookies = json.loads(native(['run', 'testing:recoveredSignedInUser', json.dumps({'userId': private_user, 'domain': '127.0.0.1'})], config, rehearsal, code / 'apps/web'))
            private_applications.append(application_check({**private_cookies, 'principalKey': private_principal,
                'householdId': private_household, 'textileIds': [item['_id'] for item in private_owned],
                'sessions': private_active, 'historyTextileIds': private_history, 'privateChecks': checks}))
        first = json.loads(native(['run', 'reminders:reconstruct', '{}'], config, rehearsal, code / 'apps/web'))
        second = json.loads(native(['run', 'reminders:reconstruct', '{}'], config, rehearsal, code / 'apps/web'))
        if second['scheduled']:
            raise ValueError('Reminder reconstruction was not idempotent')
        if not active or not owned:
            raise ValueError('Snapshot lacks a readable active load for native timer reconstruction drill')
        fixture = json.loads(native(['run', 'testing:recoveryFixture', json.dumps({'textileId': owned[0]['_id'], 'sessionId': active[0]['_id']})], config, rehearsal, code / 'apps/web'))
        synthetic = rehearsal / 'synthetic.zip'
        native(['export', '--include-file-storage', '--path', str(synthetic)], config, rehearsal)
        os.chmod(synthetic, 0o600)
        synthetic_coverage = inventory(synthetic)
        if not synthetic_coverage['files']:
            raise ValueError('Native export did not include the synthetic stored file')
        backend.terminate()
        backend.wait(timeout=10)
        # A fresh database has no original native schedules; preserve the first drill database.
        backend = start_backend('file-timer-drill.sqlite3', 'file-timer-storage')
        ready()
        native(['env', 'set', '--from-file', str(settings_file)], config, rehearsal)
        native(['dev', '--once', '--typecheck', 'disable'], config, rehearsal, code / 'apps/web')
        native(['import', '--replace-all', '--yes', str(synthetic)], config, rehearsal)
        native(['export', '--include-file-storage', '--path', str(rehearsal / 'synthetic-restored.zip')], config, rehearsal)
        os.chmod(rehearsal / 'synthetic-restored.zip', 0o600)
        if inventory(rehearsal / 'synthetic-restored.zip') != synthetic_coverage:
            raise ValueError('Native synthetic file/table restore differs')
        drill_first = json.loads(native(['run', 'reminders:reconstruct', '{}'], config, rehearsal, code / 'apps/web'))
        drill_second = json.loads(native(['run', 'reminders:reconstruct', '{}'], config, rehearsal, code / 'apps/web'))
        if drill_first['scheduled'] < 1 or drill_second['scheduled'] != 0 or drill_second['alreadyScheduled'] < 1:
            raise ValueError('Native active-reminder reconstruction failed')
        file_application = application_check({**access_input, 'photoId': fixture['photoId']})
        receipt = {'sourceHead': manifest['source']['head'], 'target': config['deploymentName'], 'ports': config['ports'],
                   'nativeContentMatched': True, 'tables': len(manifest['coverage']['tables']),
                   'nativeComparison': native_comparison,
                   'fileCount': len(manifest['coverage']['files']), 'reminders': [first, second],
                   'applicationAccessVerified': True, 'application': [application, history_application],
                   'privateData': {'tableCounts': {name: len(values) for name, values in
                       [('personalAdaptationPreferences', preferences), ('personalPlanGuidance', guidance), ('personalPlanGuidanceEntries', entries)]},
                       'application': private_applications},
                   'syntheticFileTimerDrill': {'contentMatched': True, 'application': file_application,
                                              'reminders': [drill_first, drill_second]}, 'externalSendsDisabled': True,
                   'targetSchemaSha256': digest((code / 'convex/schema.ts').read_bytes())}
        source_files = {str(path.relative_to(code)): digest(path.read_bytes()) for path in sorted(code.rglob('*'))
                        if path.is_file() and 'node_modules' not in path.parts and '.env' not in path.name and '.convex' not in path.parts}
        private_write(rehearsal / 'source-hashes.json', json.dumps(source_files, sort_keys=True, indent=2).encode())
        receipt['targetSourceSha256'] = digest(json.dumps(source_files, sort_keys=True).encode())
        receipt['recoveryToolSha256'] = digest(Path(__file__).read_bytes())
        receipt['completedAt'] = datetime.now(timezone.utc).isoformat()
        private_write(rehearsal / 'receipt.json', json.dumps(receipt, indent=2).encode())
        print(json.dumps({'rehearsalDirectory': str(rehearsal), **receipt}))
    finally:
        backend.terminate()
        try:
            backend.wait(timeout=10)
        except subprocess.TimeoutExpired:
            backend.kill()
            backend.wait()
        log.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    capture_parser = actions.add_parser('capture')
    capture_parser.add_argument('--source-web', required=True)
    capture_parser.add_argument('--private-root', required=True)
    capture_parser.add_argument('--served-release', help='Explicit private owner-phone bundle with reviewed deployment and acceptance receipts')
    capture_parser.add_argument('--phone-origin', help='Owner-approved portless address after the origin cutover; original acceptance remains recorded')
    verify_parser = actions.add_parser('verify')
    verify_parser.add_argument('directory')
    rehearsal_parser = actions.add_parser('rehearse')
    rehearsal_parser.add_argument('directory')
    args = parser.parse_args()
    if args.action == 'capture':
        capture(args.source_web, args.private_root, args.served_release, args.phone_origin)
    elif args.action == 'rehearse':
        rehearse(args.directory)
    else:
        manifest = verify(args.directory)
        print(json.dumps({'verified': True, 'sourceHead': manifest['source']['head']}))


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyError, TypeError, subprocess.TimeoutExpired, zipfile.BadZipFile, tarfile.TarError):
        print('Recovery operation refused or failed. No private command output was printed.', file=sys.stderr)
        sys.exit(1)
