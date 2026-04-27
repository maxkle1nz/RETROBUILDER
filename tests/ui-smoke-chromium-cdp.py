#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

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

    user_data_dir = tempfile.mkdtemp(prefix='retrobuilder-chromium-')
    port = free_port()
    proc = subprocess.Popen([
        CHROMIUM_BIN,
        f'--remote-debugging-port={port}',
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
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
        deadline = time.time() + 12
        ws_url = None
        while time.time() < deadline:
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

            body = ''
            for _ in range(40):
                result = await cdp(ws, 'Runtime.evaluate', {
                    'expression': 'document.body ? document.body.innerText : ""',
                    'returnByValue': True,
                })
                body = result.get('result', {}).get('result', {}).get('value', '') or ''
                if 'M1ND // SYSTEM' in body or 'Choose a session' in body:
                    break
                await asyncio.sleep(0.5)

            if 'M1ND // SYSTEM' not in body and 'Choose a session' not in body:
                print('FAIL app shell did not render expected text')
                print(body[:1200])
                return 1

            click_result = await cdp(ws, 'Runtime.evaluate', {
                'expression': '''(() => {
                    const buttons = [...document.querySelectorAll('button')];
                    const builder = buttons.find((button) => button.innerText.includes('BU1LDER'));
                    if (!builder) return 'missing-builder';
                    builder.click();
                    return 'clicked-builder';
                })()''',
                'returnByValue': True,
            })
            if click_result.get('result', {}).get('result', {}).get('value') != 'clicked-builder':
                print('FAIL could not click BU1LDER mode button')
                return 1

            await asyncio.sleep(0.8)
            after = await cdp(ws, 'Runtime.evaluate', {
                'expression': 'document.body ? document.body.innerText : ""',
                'returnByValue': True,
            })
            body_after = after.get('result', {}).get('result', {}).get('value', '') or ''

            if 'BU1LDER // LIVE' not in body_after:
                print('FAIL builder mode did not render expected header')
                print(body_after[:1200])
                return 1

            print('PASS Chromium CDP smoke: shell rendered and BU1LDER mode activated')
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
