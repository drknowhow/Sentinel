"""Sentinel MCP Server — bridges AI tools to the Sentinel Chrome extension via WebSocket."""

import asyncio
import json
import sys
import uuid
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol
from mcp.server.fastmcp import FastMCP

# ── State ──

mcp = FastMCP("sentinel")
_ws_client: WebSocketServerProtocol | None = None
_pending: dict[str, asyncio.Future[dict]] = {}
_client_connected = asyncio.Event()

# ── WebSocket Server (extension connects here) ──

async def _ws_handler(websocket: WebSocketServerProtocol) -> None:
    global _ws_client
    _ws_client = websocket
    _client_connected.set()
    print("[sentinel-mcp] Extension connected")
    try:
        async for raw in websocket:
            msg = json.loads(raw)
            # A new stdio-mode instance taking over the port sends this signal
            if msg.get("command") == "SHUTDOWN":
                print("[sentinel-mcp] Shutdown signal received — releasing port for new instance")
                sys.exit(0)
            msg_id = msg.get("id")
            if msg_id and msg_id in _pending:
                _pending[msg_id].set_result(msg)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        _ws_client = None
        _client_connected.clear()
        print("[sentinel-mcp] Extension disconnected")


def _port_in_use(port: int) -> bool:
    """Return True if something is listening on 127.0.0.1:<port>."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _force_kill_port(port: int) -> None:
    """Kill whichever process is listening on <port>."""
    import platform, subprocess
    try:
        if platform.system() == "Windows":
            out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True).stdout
            for line in out.splitlines():
                if f"127.0.0.1:{port}" in line and "LISTENING" in line:
                    pid = line.split()[-1]
                    subprocess.run(
                        ["powershell", "-Command", f"Stop-Process -Id {pid} -Force"],
                        capture_output=True,
                    )
                    print(f"[sentinel-mcp] Force-killed PID {pid} holding port {port}")
                    break
        else:
            # macOS / Linux
            out = subprocess.run(
                ["lsof", "-ti", f"tcp:{port}"], capture_output=True, text=True
            ).stdout.strip()
            for pid in out.splitlines():
                subprocess.run(["kill", "-9", pid], capture_output=True)
                print(f"[sentinel-mcp] Force-killed PID {pid} holding port {port}")
    except Exception as e:
        print(f"[sentinel-mcp] Force-kill failed: {e}")


async def _try_shutdown_existing() -> None:
    """Release port 18925 so this instance can take over.

    1. Try a graceful SHUTDOWN message (works if the other server is up to date).
    2. If the port is still held afterwards, force-kill the owning process.
    The extension reconnects automatically within a few seconds.
    """
    if not _port_in_use(18925):
        return  # nothing to evict

    # Graceful attempt
    try:
        ws = await asyncio.wait_for(websockets.connect("ws://127.0.0.1:18925"), timeout=1.5)
        await ws.send(json.dumps({"command": "SHUTDOWN"}))
        await ws.close()
        await asyncio.sleep(1.0)
        print("[sentinel-mcp] Sent SHUTDOWN to existing server")
    except Exception:
        pass

    # If still occupied, force-kill
    if _port_in_use(18925):
        print("[sentinel-mcp] Port still held — force-killing")
        _force_kill_port(18925)
        await asyncio.sleep(0.5)


async def _start_ws_server() -> None:
    # Retry a few times in case the previous server is still releasing the port
    for attempt in range(6):
        try:
            server = await websockets.serve(_ws_handler, "127.0.0.1", 18925)
            print("[sentinel-mcp] WebSocket server listening on ws://127.0.0.1:18925")
            await server.wait_closed()
            return
        except OSError:
            if attempt < 5:
                await asyncio.sleep(0.5)
    print("[sentinel-mcp] ERROR: Could not bind port 18925 after retries")


async def _send_command(command: str, payload: dict | None = None, timeout: float = 30.0) -> dict:
    """Send a command to the extension and wait for a response."""
    if not _ws_client:
        # Wait up to 35s for the extension to connect (covers full reconnect backoff window)
        try:
            await asyncio.wait_for(_client_connected.wait(), timeout=35.0)
        except asyncio.TimeoutError:
            return {"success": False, "error": "Extension not connected — open Chrome, load the Sentinel extension, and ensure the side panel is enabled"}

    msg_id = str(uuid.uuid4())
    future: asyncio.Future[dict] = asyncio.get_event_loop().create_future()
    _pending[msg_id] = future

    try:
        await _ws_client.send(json.dumps({"id": msg_id, "command": command, "payload": payload or {}}))  # type: ignore[union-attr]
        result = await asyncio.wait_for(future, timeout=timeout)
        if result.get("success"):
            return result.get("data", {})
        else:
            raise Exception(result.get("error", "Unknown error from extension"))
    except asyncio.TimeoutError:
        raise Exception(f"Timeout waiting for {command} response")
    finally:
        _pending.pop(msg_id, None)


# ── Navigation & Status Tools ──

@mcp.tool()
async def sentinel_navigate(url: str) -> dict[str, Any]:
    """Navigate the active browser tab to a URL and wait for it to load.

    Args:
        url: The URL to navigate to (e.g. "https://example.com")
    """
    return await _send_command("API_NAVIGATE", {"url": url})


@mcp.tool()
async def sentinel_screenshot() -> dict[str, Any]:
    """Capture a screenshot of the current browser tab. Returns a base64-encoded JPEG data URL."""
    return await _send_command("API_SCREENSHOT")


@mcp.tool()
async def sentinel_status() -> dict[str, Any]:
    """Get the current Sentinel extension status and project context.

    Returns:
      isRecording, isErrorTracking, actionCount, errorCount, issueCount — extension state.
      currentUrl — the active browser tab's URL.
      project.name — human name for the project set in Settings.
      project.path — filesystem path to the project source folder. Use this with
                     your file-reading tools to understand the codebase before acting.
      project.devUrl — the dev server URL for this project. Navigate here at the
                       start of any task unless the user specifies otherwise.

    Always call this first at the start of a task to load project context.
    """
    return await _send_command("API_GET_STATUS")


# ── Guide Creation Tools ──

@mcp.tool()
async def sentinel_start_recording() -> dict[str, Any]:
    """Start recording user interactions in the active tab. Clears any previous session."""
    return await _send_command("API_START_RECORDING")


@mcp.tool()
async def sentinel_stop_recording() -> dict[str, Any]:
    """Stop recording and return the number of captured actions."""
    return await _send_command("API_STOP_RECORDING")


@mcp.tool()
async def sentinel_inject_action(type: str, selector: str, value: str = "") -> dict[str, Any]:
    """Execute a synthetic DOM action on the page.

    Args:
        type: Action type — one of: click, dblclick, input, keydown, submit, scroll
        selector: CSS selector for the target element
        value: Value for input (text to type), keydown (key name), or scroll (x,y)
    """
    return await _send_command("API_INJECT_ACTION", {"type": type, "selector": selector, "value": value})


@mcp.tool()
async def sentinel_get_session() -> dict[str, Any]:
    """Get all recorded actions from the current session (without screenshot data)."""
    return await _send_command("API_GET_SESSION")


@mcp.tool()
async def sentinel_export_guide(title: str = "", intro: str = "", conclusion: str = "") -> dict[str, Any]:
    """Generate an HTML guide from the current recorded session.

    Args:
        title: Optional guide title
        intro: Optional introduction text
        conclusion: Optional conclusion text
    """
    return await _send_command("API_GENERATE_GUIDE", {"title": title, "intro": intro, "conclusion": conclusion}, timeout=120.0)


# ── Investigation Tools ──

@mcp.tool()
async def sentinel_start_error_tracking() -> dict[str, Any]:
    """Start capturing JavaScript errors, console errors, network failures, and CSP violations."""
    return await _send_command("API_START_ERROR_TRACKING")


@mcp.tool()
async def sentinel_stop_error_tracking() -> dict[str, Any]:
    """Stop error tracking."""
    return await _send_command("API_STOP_ERROR_TRACKING")


@mcp.tool()
async def sentinel_get_errors() -> dict[str, Any]:
    """Get all captured errors from the current error tracking session."""
    return await _send_command("API_GET_ERRORS")


@mcp.tool()
async def sentinel_save_issue(type: str = "bug", title: str = "", notes: str = "", severity: str = "medium") -> dict[str, Any]:
    """Save an issue with a screenshot of the current page.

    Args:
        type: Issue type — "bug" or "feature-request"
        title: Issue title
        notes: Description / notes about the issue
        severity: One of: low, medium, high, critical
    """
    return await _send_command("API_SAVE_ISSUE", {"type": type, "title": title, "notes": notes, "severity": severity})


@mcp.tool()
async def sentinel_get_issues() -> dict[str, Any]:
    """Get all saved issues (without screenshot data)."""
    return await _send_command("API_GET_ISSUES")


@mcp.tool()
async def sentinel_export_issues() -> dict[str, Any]:
    """Generate an HTML issue report from all saved issues."""
    return await _send_command("API_GENERATE_REPORT", timeout=120.0)


# ── DOM Inspection Tools ──

@mcp.tool()
async def sentinel_wait_for_element(selector: str, timeout: int = 10000) -> dict[str, Any]:
    """Wait for a CSS selector to appear in the DOM.

    Args:
        selector: CSS selector to wait for
        timeout: Maximum wait time in milliseconds (default 10000)
    """
    return await _send_command("API_WAIT_FOR_ELEMENT", {"selector": selector, "timeout": timeout}, timeout=timeout / 1000 + 5)


@mcp.tool()
async def sentinel_evaluate_selector(selector: str) -> dict[str, Any]:
    """Check if a CSS selector exists and get element info (text, tagName, visibility, bounding rect).

    Args:
        selector: CSS selector to evaluate
    """
    return await _send_command("API_EVALUATE_SELECTOR", {"selector": selector})


# ── Compound Tools ──

@mcp.tool()
async def sentinel_create_guide(url: str, steps: list[dict[str, str]], title: str = "Guide") -> dict[str, Any]:
    """One-shot: navigate to a URL, perform a sequence of actions, and export an HTML guide.

    Args:
        url: Starting URL to navigate to
        steps: List of action dicts, each with keys: type, selector, and optionally value.
               Example: [{"type": "click", "selector": "#login-btn"}, {"type": "input", "selector": "#email", "value": "test@example.com"}]
        title: Guide title
    """
    # Navigate
    nav = await _send_command("API_NAVIGATE", {"url": url})

    # Start recording
    await _send_command("API_START_RECORDING")

    # Execute each step
    results = []
    for step in steps:
        try:
            r = await _send_command("API_INJECT_ACTION", {
                "type": step.get("type", "click"),
                "selector": step.get("selector", ""),
                "value": step.get("value", ""),
            })
            results.append(r)
            await asyncio.sleep(0.5)  # Brief pause between actions
        except Exception as e:
            results.append({"success": False, "error": str(e)})

    # Stop recording
    await _send_command("API_STOP_RECORDING")

    # Export guide
    guide = await _send_command("API_GENERATE_GUIDE", {"title": title})
    return {"url": nav.get("url", url), "stepResults": results, "html": guide.get("html", "")}


@mcp.tool()
async def sentinel_investigate(url: str, duration: int = 5) -> dict[str, Any]:
    """One-shot: navigate to a URL, track errors for a duration, capture a screenshot, and return findings.

    Args:
        url: URL to investigate
        duration: Seconds to monitor for errors (default 5)
    """
    await _send_command("API_NAVIGATE", {"url": url})
    await _send_command("API_START_ERROR_TRACKING")
    await asyncio.sleep(duration)
    await _send_command("API_STOP_ERROR_TRACKING")

    errors = await _send_command("API_GET_ERRORS")
    screenshot = await _send_command("API_SCREENSHOT")

    return {"errors": errors.get("errors", []), "screenshot": screenshot.get("screenshot", "")}


# ── Entrypoint ──

async def _main() -> None:
    """Normal mode: WebSocket server + MCP stdio transport (spawned by AI client).
    Sends a shutdown signal to any running --ws-only server first so it releases
    port 18925. The extension reconnects to our new server automatically."""
    await _try_shutdown_existing()
    asyncio.create_task(_start_ws_server())
    await mcp.run_stdio_async()


async def _ws_only_main() -> None:
    """Standalone mode: WebSocket server only (launched via extension Start button).
    Keeps the bridge alive so the Chrome extension stays Connected without an AI client."""
    await _start_ws_server()


if __name__ == "__main__":
    if "--ws-only" in sys.argv:
        asyncio.run(_ws_only_main())
    else:
        asyncio.run(_main())
