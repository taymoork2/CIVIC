#!/usr/bin/env python3
"""The trial's phone runtime: a build of `main` on the ports the tailnet already serves (web 3006, Convex 3220/3221).

prepare : archive main into .data/phone-runtime/<commit>/ and build the phone frontend
start   : create that folder's own Convex deployment, configure it, start it and the phone web server
resume  : after a restart, start the recorded backend state and build again on the same ports
update  : push the prepared build's functions to the running backend (its data stays) and swap the web server
check   : phone page, auth endpoint, backend identity and the served build files

Each runtime folder holds its code and build; the backend keeps the state of the folder that started it.
`start` refuses while any of the three ports is in use; stop the running runtime first
(its pids are in .data/phone-runtime/current.json).
"""
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tarfile
import time
import urllib.request

REPO = Path(__file__).resolve().parents[3]
RUNTIME = REPO / '.data/phone-runtime'
CURRENT = RUNTIME / 'current.json'
PHONE = 'https://macbook-pro.tail221f42.ts.net'
PORTS = (3006, 3220, 3221)
SELECTORS = ('CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.run(['git', *args], cwd=REPO, capture_output=True, check=True).stdout


def private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)


def listening(port):
    return subprocess.run(['lsof', '-nP', '-t', f'-iTCP:{port}', '-sTCP:LISTEN'], capture_output=True).stdout.split()


def wait_for(url, process, label):
    for _ in range(240):
        if process.poll() is not None:
            raise SystemExit(f'{label} exited; see its log in the runtime folder')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                return response.status
        except OSError:
            time.sleep(0.5)
    raise SystemExit(f'{label} did not become ready; left running for inspection')


def runtime_root():
    return RUNTIME / git('rev-parse', '--short', 'main').decode().strip()


def convex(web, args, env_file=None):
    env = {k: v for k, v in os.environ.items() if k not in SELECTORS}
    if env_file is None:
        env['CONVEX_AGENT_MODE'] = 'anonymous'
    extra = ['--env-file', str(env_file)] if env_file else []
    return subprocess.run([str(web / 'node_modules/.bin/convex'), *args, *extra], cwd=web, env=env,
                          capture_output=True, timeout=300)


def prepare():
    head = git('rev-parse', 'main').decode().strip()
    if git('rev-parse', 'HEAD').decode().strip() != head or git('diff', '--name-only', 'HEAD').strip():
        raise SystemExit('The main checkout must be on a clean main')
    root = runtime_root()
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    root.mkdir(mode=0o700)
    source = git('archive', '--format=tar', head)
    with tarfile.open(fileobj=io.BytesIO(source)) as archive:
        archive.extractall(root / 'code', filter='data')
    code = root / 'code'
    for name in ['node_modules', 'convex/node_modules', 'packages/planner/node_modules']:
        (code / name).symlink_to(REPO / name, target_is_directory=True)
    modules = code / 'apps/web/node_modules'
    modules.mkdir()
    for dependency in (REPO / 'apps/web/node_modules').iterdir():
        if dependency.name.startswith('.') and dependency.name != '.bin':
            continue
        (modules / dependency.name).symlink_to(dependency, target_is_directory=dependency.is_dir())
    build_id = 'phone-' + head[:7] + '-' + str(time.time_ns())
    build = subprocess.run([str(modules / '.bin/vite'), 'build', '--configLoader', 'native'], cwd=code / 'apps/web',
                           env={**os.environ, 'VITE_CONVEX_URL': 'http://127.0.0.1:3220', 'VITE_CONVEX_SITE_URL': 'http://127.0.0.1:3221',
                                'VITE_CONVEX_REMOTE_PORT': '10444', 'WASHCLOSET_BUILD_ID': build_id,
                                # The owner's trial build marks where dose and care thinking is unfinished.
                                'VITE_TRIAL_NOTES': '1'},
                           capture_output=True, timeout=300)
    private(root / 'build.log', build.stdout + build.stderr)
    if build.returncode:
        raise SystemExit('Build failed; see build.log')
    client = code / 'apps/web/dist/client'
    served = {str(p.relative_to(client)): sha(p.read_bytes()) for p in client.rglob('*')
              if p.is_file() and (p.suffix in ('.js', '.css') or p.name in ('manifest.webmanifest', 'offline-assets.json', 'app-version.json'))}
    private(root / 'runtime.json', json.dumps({'head': head, 'buildId': build_id, 'served': served}, indent=1).encode())
    print(json.dumps({'root': str(root), 'head': head, 'buildId': build_id, 'servedFiles': len(served)}))


def start():
    root = runtime_root()
    runtime = json.loads((root / 'runtime.json').read_text())
    web = root / 'code/apps/web'
    state = web / '.convex/local/default'
    if state.exists():
        raise SystemExit('This runtime folder already has a deployment; inspect it first')
    if any(listening(port) for port in PORTS):
        raise SystemExit('A phone port is in use; stop the running runtime first')
    logs = root / 'logs'
    logs.mkdir(mode=0o700)

    # A fresh deployment with the functions pushed; the CLI stops its own backend when --once ends.
    result = convex(web, ['dev', '--once', '--local-cloud-port', '3220', '--local-site-port', '3221',
                          '--typecheck', 'disable', '--tail-logs', 'disable'])
    private(logs / 'deploy.log', result.stdout + result.stderr)
    if result.returncode:
        raise SystemExit('Deployment failed; see logs/deploy.log')
    for _ in range(40):
        if not any(listening(port) for port in PORTS[1:]):
            break
        time.sleep(0.25)
    else:
        raise SystemExit('The deploy step left a backend running; inspect it before starting')

    config = json.loads((state / 'config.json').read_text())
    if config['ports'] != {'cloud': 3220, 'site': 3221}:
        raise SystemExit('The deployment picked unexpected ports')
    backend = start_backend(state, config, logs, web)

    selector = root / 'selector.env'
    private(selector, f"CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220\nCONVEX_SELF_HOSTED_ADMIN_KEY={config['adminKey']}\n".encode())
    key = json.loads(subprocess.run(['node', '--input-type=module', '-e',
        "const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);"
        "const p=await crypto.subtle.exportKey('raw',k.publicKey);const j=await crypto.subtle.exportKey('jwk',k.privateKey);"
        "process.stdout.write(JSON.stringify({publicKey:Buffer.from(p).toString('base64url'),privateKey:j.d}));"],
        capture_output=True, check=True).stdout)
    settings = {
        'BETTER_AUTH_SECRET': secrets.token_hex(32),
        'WASHCLOSET_PHOTO_URL_SECRET': secrets.token_hex(32),
        'SITE_URL': PHONE,
        'WASHCLOSET_TRUSTED_ORIGINS': ','.join([PHONE, PHONE + ':10443', 'http://127.0.0.1:3006', 'http://localhost:3006']),
        # Tailnet only: every request arrives through the local proxy, so all callers would share one bucket.
        'WASHCLOSET_AUTH_RATE_LIMIT': 'disabled',
        'WEB_PUSH_PUBLIC_KEY': key['publicKey'],
        'WEB_PUSH_PRIVATE_KEY': key['privateKey'],
        'WEB_PUSH_SUBJECT': PHONE + '/',
    }
    settings_file = root / 'settings.env'
    private(settings_file, ''.join(f'{k}={v}\n' for k, v in settings.items()).encode())
    result = convex(web, ['env', 'set', '--from-file', str(settings_file)], selector)
    settings_file.unlink()
    if result.returncode:
        raise SystemExit('Could not configure the deployment; backend left running for inspection')

    web_pid, awake_pid = serve_web(web, logs)
    record_current({'root': str(root), 'head': runtime['head'], 'buildId': runtime['buildId'], 'state': str(state),
                    'backendPid': backend.pid, 'webPid': web_pid, 'awakePid': awake_pid, 'phoneOrigin': PHONE,
                    'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')})


def resume():
    """After the Mac restarts: the recorded backend state and build come back on the same ports."""
    record = json.loads(CURRENT.read_text())
    if any(listening(port) for port in PORTS):
        raise SystemExit('A phone port is in use; nothing started')
    state = Path(record['state'])
    web = Path(record['root']) / 'code/apps/web'
    logs = Path(record['root']) / 'logs'
    backend = start_backend(state, json.loads((state / 'config.json').read_text()), logs, web)
    web_pid, awake_pid = serve_web(web, logs)
    record_current({**record, 'backendPid': backend.pid, 'webPid': web_pid, 'awakePid': awake_pid,
                    'resumedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')})


def update():
    record = json.loads(CURRENT.read_text())
    root = runtime_root()
    if str(root) == record['root']:
        raise SystemExit('The phone already serves this build')
    runtime = json.loads((root / 'runtime.json').read_text())
    web = root / 'code/apps/web'
    config = json.loads((Path(record['state']) / 'config.json').read_text())
    logs = root / 'logs'
    logs.mkdir(mode=0o700)
    selector = root / 'selector.env'
    private(selector, f"CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220\nCONVEX_SELF_HOSTED_ADMIN_KEY={config['adminKey']}\n".encode())
    # New functions and schema go to the running backend; its data and settings stay as they are.
    result = convex(web, ['dev', '--once', '--typecheck', 'disable', '--tail-logs', 'disable'], selector)
    private(logs / 'deploy.log', result.stdout + result.stderr)
    if result.returncode:
        raise SystemExit('The function push failed; the previous build is still serving. See logs/deploy.log')
    stop_web(record['webPid'])
    web_pid, awake_pid = serve_web(web, logs)
    record_current({**record, 'root': str(root), 'head': runtime['head'], 'buildId': runtime['buildId'],
                    'webPid': web_pid, 'awakePid': awake_pid, 'previousRoot': record['root'],
                    'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')})


def start_backend(state, config, logs, cwd):
    """The deployment's own backend binary on 3220/3221, serving the state folder as it is."""
    binary = Path.home() / '.cache/convex/binaries' / config['backendVersion'] / 'convex-local-backend'
    backend = subprocess.Popen([str(binary), '--port', '3220', '--site-proxy-port', '3221',
                                '--instance-name', config['deploymentName'], '--instance-secret', config['instanceSecret'],
                                '--disable-beacon', '--local-storage', str(state / 'convex_local_storage'),
                                str(state / 'convex_local_backend.sqlite3')],
                               cwd=cwd, stdout=open(logs / 'backend.log', 'ab'), stderr=subprocess.STDOUT, start_new_session=True)
    wait_for('http://127.0.0.1:3220/version', backend, 'Backend')
    return backend


def serve_web(web, logs):
    """The phone web server on 3006, with the Mac kept awake while it runs."""
    preview = subprocess.Popen([str(web / 'node_modules/.bin/vite'), 'preview', '--configLoader', 'native',
                                '--host', '127.0.0.1', '--port', '3006', '--strictPort'], cwd=web,
                               env={**os.environ, 'NODE_ENV': 'production', 'VITE_CONVEX_URL': 'http://127.0.0.1:3220',
                                    'VITE_CONVEX_SITE_URL': 'http://127.0.0.1:3221'},
                               stdout=open(logs / 'web.log', 'ab'), stderr=subprocess.STDOUT, start_new_session=True)
    wait_for('http://127.0.0.1:3006/api/auth/ok', preview, 'Phone web')
    awake = subprocess.Popen(['/usr/bin/caffeinate', '-dimsu', '-w', str(preview.pid)], start_new_session=True,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return preview.pid, awake.pid


def stop_web(pid):
    command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
    if 'vite' not in command or 'preview' not in command:
        raise SystemExit(f'pid {pid} is not the phone web server; nothing stopped')
    os.kill(pid, 15)
    for _ in range(80):
        if not listening(3006):
            return
        time.sleep(0.25)
    raise SystemExit('Port 3006 is still served; no new web server started')


def record_current(record):
    if CURRENT.exists():
        os.replace(CURRENT, RUNTIME / f'previous-{int(time.time())}.json')
    private(CURRENT, json.dumps(record, indent=1).encode())
    print(json.dumps({k: record[k] for k in ('root', 'head', 'backendPid', 'webPid', 'awakePid')}))


def check():
    record = json.loads(CURRENT.read_text())
    runtime = json.loads((Path(record['root']) / 'runtime.json').read_text())
    result = {'listening': {port: bool(listening(port)) for port in PORTS}}
    for name, url in [('phonePage', PHONE + '/sign-in'), ('phoneAuth', PHONE + '/api/auth/ok')]:
        with urllib.request.urlopen(url, timeout=10) as response:
            result[name] = response.status
    with urllib.request.urlopen('http://127.0.0.1:3220/instance_name', timeout=5) as response:
        result['backend'] = response.read().decode()
    mismatched = []
    for name, digest in runtime['served'].items():
        with urllib.request.urlopen(PHONE + '/' + name, timeout=10) as response:
            if sha(response.read()) != digest:
                mismatched.append(name)
    result.update(head=record['head'], buildId=record['buildId'], servedFilesChecked=len(runtime['served']), mismatched=mismatched)
    print(json.dumps(result))
    if mismatched or not all(result['listening'].values()):
        sys.exit(1)


if __name__ == '__main__':
    actions = {'prepare': prepare, 'start': start, 'resume': resume, 'update': update, 'check': check}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit('prepare | start | resume | update | check')
    actions[sys.argv[1]]()
