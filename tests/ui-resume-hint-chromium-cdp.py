#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from chromium_binary import CHROMIUM_BIN

BASE = os.environ.get('RETROBUILDER_TEST_BASE', 'http://127.0.0.1:7777').rstrip('/')
TARGET_URL = BASE
ROOT = Path(__file__).resolve().parents[1]
RUNTIME_ROOT = ROOT / '.retrobuilder' / 'runtime'


def free_port():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def http(method: str, path: str, payload=None):
    req = urllib.request.Request(BASE + path, method=method)
    body = None
    if payload is not None:
        body = json.dumps(payload).encode()
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, body, timeout=15) as resp:
        return json.loads(resp.read().decode())


def get_page_ws_url(port: int):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as resp:
        data = json.loads(resp.read().decode())
    pages = [entry for entry in data if entry.get('type') == 'page']
    if not pages:
        raise RuntimeError('No page targets exposed by Chromium CDP')
    return pages[0]['webSocketDebuggerUrl']


async def run():
    import websockets

    session = http('POST', '/api/sessions', {
        'name': 'UI Resume Hint Session',
        'source': 'manual',
        'manifesto': 'Resume hint smoke test',
        'architecture': 'Builder should suggest resume when a stopped OMX build exists.',
        'projectContext': 'ui resume hint',
        'graph': {
            'nodes': [{
                'id': 'ops-dashboard',
                'label': 'Ops Dashboard',
                'description': 'Resume-aware surface.',
                'status': 'pending',
                'type': 'frontend',
                'group': 1,
                'priority': 1,
                'data_contract': 'Input: { status: string } Output: { panels: string[] }',
                'acceptance_criteria': ['Shows state.', 'Shows action.'],
                'error_handling': ['Fallback copy.'],
                'designProfile': '21st',
                'referenceCandidates': [],
                'selectedReferenceIds': [],
                'variantCandidates': [],
                'selectedVariantId': 'seeded',
                'previewArtifact': {
                    'kind': 'tsx',
                    'componentName': 'OpsDashboardPreview',
                    'screenType': 'dashboard',
                    'summary': 'seeded preview',
                    'blocks': [
                        { 'id': 'hero', 'kind': 'hero', 'title': 'Ops Dashboard' },
                        { 'id': 'metrics', 'kind': 'metrics', 'title': 'Metrics', 'items': ['status'] },
                        { 'id': 'cta', 'kind': 'cta', 'title': 'Continue' },
                    ],
                    'tsx': 'export const OpsDashboardPreview = () => null;',
                },
                'previewState': { 'density': 'compact', 'emphasis': 'dashboard' },
                'designVerdict': { 'status': 'passed', 'score': 90, 'findings': [], 'evidence': ['seeded'] },
            }],
            'links': [],
        },
    })
    session_id = session['id']

    runtime_dir = RUNTIME_ROOT / session_id
    workspace_path = runtime_dir / 'build-resume-hint'
    (workspace_path / 'modules' / 'ops-dashboard').mkdir(parents=True, exist_ok=True)
    (workspace_path / 'modules' / 'ops-dashboard' / 'module.spec.json').write_text('{}', encoding='utf8')
    status_payload = {
        'sessionId': session_id,
        'buildId': 'resume-hint-build',
        'status': 'stopped',
        'workspacePath': str(workspace_path),
        'transport': { 'kind': 'codex-cli', 'command': 'codex exec --json --skip-git-repo-check --sandbox workspace-write', 'available': True },
        'source': 'persisted-session',
        'totalNodes': 1,
        'completedNodes': 0,
        'buildProgress': 0,
        'activeNodeId': None,
        'nodeStates': { 'ops-dashboard': 'queued' },
        'designProfile': '21st',
        'designGateStatus': 'passed',
        'designScore': 90,
        'designFindings': [],
        'designEvidence': ['seeded'],
        'terminalMessage': 'BUILD STOPPED — seed',
    }
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / 'omx-status.json').write_text(json.dumps(status_payload, indent=2), encoding='utf8')

    user_data_dir = tempfile.mkdtemp(prefix='retrobuilder-ui-resume-')
    port = free_port()
    proc = subprocess.Popen([
        CHROMIUM_BIN,
        f'--remote-debugging-port={port}',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        f'--user-data-dir={user_data_dir}',
        TARGET_URL,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    async def cdp(ws, method, params=None, msg_id=[0]):
        msg_id[0] += 1
        await ws.send(json.dumps({'id': msg_id[0], 'method': method, 'params': params or {}}))
        while True:
            data = json.loads(await ws.recv())
            if data.get('id') == msg_id[0]:
                return data

    try:
        ws_url = None
        for _ in range(40):
            try:
                ws_url = get_page_ws_url(port)
                break
            except Exception:
                await asyncio.sleep(0.25)
        if not ws_url:
            print('FAIL Chromium CDP did not expose a page target')
            return 1

        async with websockets.connect(ws_url, max_size=2**22) as ws:
            await cdp(ws, 'Page.enable')
            await cdp(ws, 'Runtime.enable')
            await cdp(ws, 'Runtime.evaluate', {
                'expression': f'localStorage.setItem("retrobuilder-state", JSON.stringify({{"state":{{"appMode":"builder","activeProvider":"xai","activeModel":null,"activeSessionId":"{session_id}","showSessionLauncher":false,"showEnvConfigModal":false}},"version":0}})); location.reload();',
                'returnByValue': True,
            })

            body = ''
            for _ in range(30):
                await asyncio.sleep(0.5)
                result = await cdp(ws, 'Runtime.evaluate', {
                    'expression': 'document.body ? document.body.innerText : ""',
                    'returnByValue': True,
                })
                body = result.get('result', {}).get('result', {}).get('value', '') or ''
                if 'Resume available:' in body and 'Resume stopped' in body:
                    break

            if 'Resume available:' not in body:
                print('FAIL builder chat did not surface resume hint automatically')
                print(body[:2000])
                return 1

            print('PASS Chromium CDP resume-hint smoke: builder chat surfaced resume availability')
            return 0
    finally:
        try:
            http('DELETE', f'/api/sessions/{session_id}')
        except Exception:
            pass
        shutil.rmtree(runtime_dir, ignore_errors=True)
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()
        shutil.rmtree(user_data_dir, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(asyncio.run(run()))
