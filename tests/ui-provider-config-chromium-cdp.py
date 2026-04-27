#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request

from chromium_binary import CHROMIUM_BIN

TARGET_URL = os.environ.get('RETROBUILDER_TEST_BASE', 'http://127.0.0.1:7777').rstrip('/')


def free_port():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def get_page_ws_url(port: int):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as resp:
        data = json.loads(resp.read().decode())
    pages = [entry for entry in data if entry.get('type') == 'page']
    if not pages:
        raise RuntimeError('No page targets exposed by Chromium CDP')
    return pages[0]['webSocketDebuggerUrl']


async def run():
    import websockets

    user_data_dir = tempfile.mkdtemp(prefix='retrobuilder-ui-providers-')
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
                'expression': '''(() => {
                  localStorage.setItem("retrobuilder-state", JSON.stringify({
                    state: {
                      appMode: "architect",
                      activeProvider: "bridge",
                      activeModel: null,
                      activeAuthProfile: "github-copilot:github",
                      showSessionLauncher: false,
                      showEnvConfigModal: true
                    },
                    version: 0
                  }));
                  location.reload();
                })()''',
                'returnByValue': True,
            })

            body = ''
            for _ in range(40):
                await asyncio.sleep(0.5)
                result = await cdp(ws, 'Runtime.evaluate', {
                    'expression': 'document.body ? document.body.innerText : ""',
                    'returnByValue': True,
                })
                body = result.get('result', {}).get('result', {}).get('value', '') or ''
                if 'Project Keys & Provider Config' in body and 'THE BRIDGE' in body:
                    break

            normalized = body.upper()

            if 'PROJECT KEYS & PROVIDER CONFIG' not in normalized:
                print('FAIL provider config modal did not render')
                print(body[:1600])
                return 1

            if 'THE BRIDGE' not in normalized:
                print('FAIL provider config modal did not render THE BRIDGE provider card')
                print(body[:2200])
                return 1

            switch_result = await cdp(ws, 'Runtime.evaluate', {
                'expression': '''(() => {
                  const select = [...document.querySelectorAll('select')][0];
                  if (!select) return 'missing-provider-select';
                  select.value = 'bridge';
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  return 'switched-provider';
                })()''',
                'returnByValue': True,
            })
            if switch_result.get('result', {}).get('result', {}).get('value') != 'switched-provider':
                print('FAIL could not switch provider select to bridge')
                return 1

            bridge_profile_visible = False
            for _ in range(20):
                await asyncio.sleep(0.3)
                result = await cdp(ws, 'Runtime.evaluate', {
                    'expression': 'document.body ? document.body.innerText : ""',
                    'returnByValue': True,
                })
                body = result.get('result', {}).get('result', {}).get('value', '') or ''
                if 'BRIDGE AUTH PROFILE' in body.upper():
                    bridge_profile_visible = True
                    break

            if not bridge_profile_visible:
                print('FAIL bridge auth profile selector did not render after choosing bridge provider')
                print(body[:2200])
                return 1

            print('PASS Chromium CDP provider-config smoke: bridge card and auth profile selector rendered')
            return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()
        shutil.rmtree(user_data_dir, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(asyncio.run(run()))
