"""Register Sentinel's native messaging host with Chrome on Windows.

Usage:
    python mcp-server/install_host.py <extension-id>

Find your extension ID at chrome://extensions/ or in Sentinel's Settings tab.
"""

import sys
import os
import json

HOST_NAME = 'com.sentinel.launcher'


def main() -> None:
    if sys.platform != 'win32':
        print('This installer currently supports Windows only.')
        print('For macOS/Linux, register the host manually (see README).')
        sys.exit(1)

    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    ext_id = sys.argv[1].strip()
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Write a .bat wrapper (Chrome native messaging requires an executable on Windows)
    bat_path = os.path.join(script_dir, 'sentinel_launcher.bat')
    launcher_py = os.path.join(script_dir, 'launcher.py')
    with open(bat_path, 'w') as f:
        f.write(f'@echo off\n"{sys.executable}" "{launcher_py}"\n')

    # Write the host manifest
    manifest = {
        'name': HOST_NAME,
        'description': 'Sentinel MCP server launcher',
        'path': bat_path,
        'type': 'stdio',
        'allowed_origins': [f'chrome-extension://{ext_id}/'],
    }
    manifest_path = os.path.join(script_dir, f'{HOST_NAME}.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    # Register in the Windows registry
    import winreg
    key_path = rf'Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, '', 0, winreg.REG_SZ, manifest_path)

    print(f'  Manifest : {manifest_path}')
    print(f'  Launcher : {bat_path}')
    print(f'  Registry : HKCU\\{key_path}')
    print()
    print('Done. Reload the extension in Chrome, then use the Start button in Settings.')


if __name__ == '__main__':
    main()
