import os
import shutil


def find_chromium_binary() -> str:
    env_binary = os.environ.get("CHROMIUM_BIN")
    if env_binary:
        return env_binary

    for command in (
        "chromium",
        "chromium-browser",
        "google-chrome",
        "google-chrome-stable",
    ):
        resolved = shutil.which(command)
        if resolved:
            return resolved

    for candidate in (
        "/opt/homebrew/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ):
        if os.path.exists(candidate):
            return candidate

    return "chromium"


CHROMIUM_BIN = find_chromium_binary()
