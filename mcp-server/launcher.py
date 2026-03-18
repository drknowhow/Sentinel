"""Sentinel Launcher — Native messaging host for Chrome extension.

Receives one-shot JSON commands from the extension via Chrome's native
messaging protocol (4-byte length prefix + UTF-8 JSON on stdio) and
manages the MCP server process via a PID file so it outlives this process.
"""

import sys
import os
import json
import struct
import subprocess
import ctypes

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MCP_SCRIPT  = os.path.join(SCRIPT_DIR, 'sentinel_mcp.py')
PID_FILE    = os.path.join(SCRIPT_DIR, 'sentinel_mcp.pid')


# ── Helpers ──

def send(msg: dict) -> None:
    data = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def recv() -> dict | None:
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack('<I', raw)[0]
    return json.loads(sys.stdin.buffer.read(length))


def _is_running(pid: int) -> bool:
    """Check if a PID is alive without signalling it."""
    try:
        if sys.platform == 'win32':
            STILL_ACTIVE = 259
            handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
            if not handle:
                return False
            code = ctypes.c_ulong()
            ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
            ctypes.windll.kernel32.CloseHandle(handle)
            return code.value == STILL_ACTIVE
        else:
            os.kill(pid, 0)
            return True
    except (OSError, PermissionError):
        return False


def _kill(pid: int) -> None:
    if sys.platform == 'win32':
        subprocess.run(['taskkill', '/F', '/PID', str(pid)], capture_output=True)
    else:
        import signal
        os.kill(pid, signal.SIGTERM)


def read_pid() -> int | None:
    try:
        with open(PID_FILE) as f:
            pid = int(f.read().strip())
        if _is_running(pid):
            return pid
        os.unlink(PID_FILE)
    except Exception:
        pass
    return None


def write_pid(pid: int) -> None:
    with open(PID_FILE, 'w') as f:
        f.write(str(pid))


# ── Commands ──

def cmd_start() -> dict:
    pid = read_pid()
    if pid:
        return {'success': True, 'status': 'running', 'pid': pid}
    try:
        kwargs: dict = {
            'stdin':  subprocess.DEVNULL,
            'stdout': subprocess.DEVNULL,
            'stderr': subprocess.DEVNULL,
        }
        if sys.platform == 'win32':
            kwargs['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        proc = subprocess.Popen([sys.executable, MCP_SCRIPT, '--ws-only'], **kwargs)
        write_pid(proc.pid)
        return {'success': True, 'status': 'started', 'pid': proc.pid}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def cmd_stop() -> dict:
    pid = read_pid()
    if not pid:
        return {'success': True, 'status': 'stopped'}
    try:
        _kill(pid)
        if os.path.exists(PID_FILE):
            os.unlink(PID_FILE)
        return {'success': True, 'status': 'stopped'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def cmd_status() -> dict:
    pid = read_pid()
    return {'success': True, 'status': 'running' if pid else 'stopped', 'pid': pid}


def cmd_remove_local(payload: dict) -> dict:
    """Remove only the sentinel entry from .mcp.json in the specified project folder."""
    project_path = payload.get('project_path', '').strip()
    if not project_path:
        return {'success': False, 'error': 'project_path is required'}

    output_path = os.path.join(project_path, '.mcp.json')
    if not os.path.isfile(output_path):
        return {'success': True, 'status': 'not_found'}

    try:
        with open(output_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except Exception as e:
        return {'success': False, 'error': f'Could not read {output_path}: {e}'}

    servers = config.get('mcpServers', {})
    if 'sentinel' not in servers:
        return {'success': True, 'status': 'already_removed'}

    del servers['sentinel']
    config['mcpServers'] = servers

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        return {'success': True, 'path': output_path}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def cmd_install_local(payload: dict) -> dict:
    """Merge sentinel into .mcp.json in the specified project folder, preserving existing servers."""
    project_path = payload.get('project_path', '').strip()
    if not project_path:
        return {'success': False, 'error': 'project_path is required'}
    if not os.path.isdir(project_path):
        return {'success': False, 'error': f'Directory not found: {project_path}'}

    sentinel_script = MCP_SCRIPT.replace('\\', '/')
    output_path = os.path.join(project_path, '.mcp.json')

    # Load existing config if present, preserving all other MCP servers
    config: dict = {}
    if os.path.isfile(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception:
            pass  # Corrupt/empty file — start fresh

    if 'mcpServers' not in config or not isinstance(config['mcpServers'], dict):
        config['mcpServers'] = {}

    # Upsert only the sentinel entry
    config['mcpServers']['sentinel'] = {
        'command': 'python',
        'args': [sentinel_script],
    }

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        return {'success': True, 'path': output_path}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _kill_port(port: int) -> list[int]:
    """Kill any process listening on the given port. Returns list of killed PIDs."""
    killed = []
    try:
        if sys.platform == 'win32':
            out = subprocess.run(['netstat', '-ano'], capture_output=True, text=True).stdout
            for line in out.splitlines():
                if f'127.0.0.1:{port}' in line and 'LISTENING' in line:
                    pid = int(line.split()[-1])
                    subprocess.run(
                        ['powershell', '-Command', f'Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue'],
                        capture_output=True,
                    )
                    killed.append(pid)
        else:
            out = subprocess.run(['lsof', '-ti', f'tcp:{port}'], capture_output=True, text=True).stdout
            for pid_str in out.strip().splitlines():
                pid = int(pid_str)
                os.kill(pid, 9)
                killed.append(pid)
    except Exception:
        pass
    return killed


def cmd_force_restart() -> dict:
    """Kill every process holding port 18925 (including stale --ws-only servers
    and any competing MCP instances) then start a fresh --ws-only server."""
    import time

    # Kill the PID-tracked server if any
    pid = read_pid()
    if pid:
        _kill(pid)
        if os.path.exists(PID_FILE):
            os.unlink(PID_FILE)

    # Force-kill anything else holding the port
    killed = _kill_port(18925)

    # Brief pause for the port to release
    if killed:
        time.sleep(0.8)

    # Start fresh
    return cmd_start()


def cmd_uninstall() -> dict:
    """Remove the native host registration and generated files."""
    HOST_NAME = 'com.sentinel.launcher'
    errors: list[str] = []

    # Stop the server if running
    cmd_stop()

    # Remove registry key (Windows)
    if sys.platform == 'win32':
        try:
            import winreg
            key_path = rf'Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}'
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
        except Exception as e:
            errors.append(f'registry: {e}')

    # Remove generated files
    for fname in [f'{HOST_NAME}.json', 'sentinel_launcher.bat']:
        fpath = os.path.join(SCRIPT_DIR, fname)
        try:
            if os.path.exists(fpath):
                os.unlink(fpath)
        except Exception as e:
            errors.append(f'{fname}: {e}')

    if errors:
        return {'success': False, 'error': '; '.join(errors)}
    return {'success': True, 'status': 'uninstalled'}


# ── Main ──

def main() -> None:
    msg = recv()
    if not msg:
        send({'success': False, 'error': 'No message received'})
        return
    cmd = msg.get('command', '')
    payload = msg.get('payload', {})
    handlers = {
        'start':          lambda: cmd_start(),
        'stop':           lambda: cmd_stop(),
        'status':         lambda: cmd_status(),
        'force_restart':  lambda: cmd_force_restart(),
        'uninstall':      lambda: cmd_uninstall(),
        'install_local':  lambda: cmd_install_local(payload),
        'remove_local':   lambda: cmd_remove_local(payload),
    }
    handler = handlers.get(cmd)
    if handler:
        send(handler())
    else:
        send({'success': False, 'error': f'Unknown command: {cmd}'})


if __name__ == '__main__':
    main()
