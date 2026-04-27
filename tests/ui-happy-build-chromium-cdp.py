#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import subprocess
import tempfile
import urllib.request

from chromium_binary import CHROMIUM_BIN

BASE = os.environ.get('RETROBUILDER_TEST_BASE', 'http://127.0.0.1:7777').rstrip('/')
TARGET_URL = BASE


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
    with urllib.request.urlopen(req, body, timeout=20) as resp:
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
      'name': 'UI Happy Build Session',
      'source': 'manual',
      'manifesto': 'Happy-path UI build smoke test',
      'architecture': 'Frontend passes design gate and enters builder mode.',
      'projectContext': 'ui happy smoke',
      'graph': {
        'nodes': [{
          'id': 'ops-dashboard',
          'label': 'Ops Dashboard',
          'description': 'A control surface for operators to inspect status and intervene safely.',
          'status': 'pending',
          'type': 'frontend',
          'group': 1,
          'priority': 1,
          'data_contract': 'Input: { status: string, incidents: number, owner: string } Output: { panels: string[], actions: string[] }',
          'acceptance_criteria': [
            'Operators can see live status in one glance.',
            'Operators can trigger the main corrective action without searching.',
          ],
          'error_handling': [
            'Render degraded-state copy when incident feeds fail.',
          ],
        }],
        'links': [],
      },
    })
    session_id = session['id']

    specular = http('POST', '/api/specular/generate', {
      'sessionId': session_id,
      'nodeId': 'ops-dashboard',
    })

    node_patch = {
      'designProfile': specular['designProfile'],
      'referenceCandidates': specular['referenceCandidates'],
      'selectedReferenceIds': specular['selectedReferenceIds'],
      'variantCandidates': specular['variantCandidates'],
      'selectedVariantId': specular['selectedVariantId'],
      'previewArtifact': specular['previewArtifact'],
      'previewState': specular['previewState'],
      'designVerdict': specular['designVerdict'],
    }

    http('PUT', f'/api/sessions/{session_id}', {
      'graph': {
        **session['graph'],
        'nodes': [
          {
            **session['graph']['nodes'][0],
            **node_patch,
          }
        ],
      }
    })

    user_data_dir = tempfile.mkdtemp(prefix='retrobuilder-ui-happy-')
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
          'expression': f'localStorage.setItem("retrobuilder-state", JSON.stringify({{"state":{{"appMode":"architect","activeProvider":"xai","activeModel":null,"activeSessionId":"{session_id}","showSessionLauncher":false,"showEnvConfigModal":false}},"version":0}})); location.reload();',
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
          if 'UI Happy Build Session' in body and 'Build with OMX' in body:
            break

        if 'UI Happy Build Session' not in body:
          print('FAIL session did not hydrate in UI')
          return 1

        await cdp(ws, 'Runtime.evaluate', {
          'expression': '''(() => {
            const buttons = [...document.querySelectorAll('button')];
            const m1nd = buttons.find((button) => ((button.textContent || '').toLowerCase()).includes('m1nd'));
            if (!m1nd) return 'missing-m1nd';
            m1nd.click();
            return 'clicked-m1nd';
          })()''',
          'returnByValue': True,
        })
        await asyncio.sleep(1)

        click_build = await cdp(ws, 'Runtime.evaluate', {
          'expression': '''(() => {
            const buttons = [...document.querySelectorAll('button')];
            const build = buttons.find((button) => ((button.textContent || '').toLowerCase()).includes('build with omx'));
            if (!build) return 'missing-build';
            build.click();
            return `clicked-build disabled=${build.disabled}`;
          })()''',
          'returnByValue': True,
        })
        click_value = click_build.get('result', {}).get('result', {}).get('value', '')
        if 'clicked-build' not in click_value:
          print('FAIL could not trigger Build with OMX from UI')
          print(click_value)
          return 1

        body_after = ''
        for _ in range(30):
          await asyncio.sleep(0.5)
          after = await cdp(ws, 'Runtime.evaluate', {
            'expression': 'document.body ? document.body.innerText : ""',
            'returnByValue': True,
          })
          body_after = after.get('result', {}).get('result', {}).get('value', '') or ''
          if 'BU1LDER // LIVE' in body_after:
            break

        if 'BU1LDER // LIVE' not in body_after:
          print('FAIL happy-path build did not enter BU1LDER mode')
          print(body_after[:2500])
          return 1

        print('PASS Chromium CDP happy-build smoke: valid UIX session entered BU1LDER mode')
        return 0
    finally:
      try:
        http('DELETE', f'/api/sessions/{session_id}')
      except Exception:
        pass
      proc.terminate()
      try:
        proc.wait(timeout=3)
      except Exception:
        proc.kill()
      shutil.rmtree(user_data_dir, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(asyncio.run(run()))
