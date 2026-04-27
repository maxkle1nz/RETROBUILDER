#!/usr/bin/env python3
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = 4444
BASE = f'http://127.0.0.1:{PORT}'
TARGET_URL = 'http://127.0.0.1:7777'


def http(method: str, path: str, payload=None):
    req = urllib.request.Request(BASE + path, method=method)
    body = None
    if payload is not None:
        body = json.dumps(payload).encode()
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, body, timeout=15) as resp:
        return json.loads(resp.read().decode())


def wait_status(timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
      try:
        data = http('GET', '/status')
        if data.get('value', {}).get('ready'):
          return True
      except Exception:
        pass
      time.sleep(0.25)
    return False


def main():
    proc = subprocess.Popen(['safaridriver', '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_status():
            print('FAIL safaridriver did not become ready')
            return 1

        try:
            session = http('POST', '/session', {
                'capabilities': {
                    'alwaysMatch': {
                        'browserName': 'safari'
                    }
                }
            })
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            if 'Allow remote automation' in body:
                print('SKIP Safari Remote Automation is disabled.')
                return 0
            print('FAIL could not create Safari WebDriver session')
            print(body)
            return 1

        session_id = session['value']['sessionId']

        def session_post(path, payload=None):
            return http('POST', f'/session/{session_id}{path}', payload)

        def session_get(path):
            return http('GET', f'/session/{session_id}{path}')

        session_post('/url', {'url': TARGET_URL})

        body = ''
        for _ in range(30):
            time.sleep(0.5)
            body = session_post('/execute/sync', {
                'script': 'return document.body ? document.body.innerText : "";',
                'args': []
            })['value']
            if 'M1ND // SYSTEM' in body or 'Choose a session' in body:
                break

        if 'M1ND // SYSTEM' not in body and 'Choose a session' not in body:
            print('FAIL app shell did not render expected text')
            print(body[:1200])
            return 1

        session_post('/execute/sync', {
            'script': '''
                const buttons = [...document.querySelectorAll('button')];
                const builder = buttons.find((button) => button.innerText.includes('BU1LDER'));
                if (!builder) return 'missing-builder';
                builder.click();
                return 'clicked-builder';
            ''',
            'args': []
        })
        time.sleep(0.75)
        body_after = session_post('/execute/sync', {
            'script': 'return document.body ? document.body.innerText : "";',
            'args': []
        })['value']

        if 'BU1LDER // LIVE' not in body_after:
            print('FAIL builder mode did not render expected header')
            print(body_after[:1200])
            return 1

        print('PASS ui shell rendered and builder mode activated in Safari WebDriver')
        return 0
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    sys.exit(main())
