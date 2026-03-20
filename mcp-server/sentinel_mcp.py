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
async def sentinel_attach() -> dict[str, Any]:
    """Attach Sentinel to the currently active browser tab without reloading the page.

    Use this instead of sentinel_navigate when the page is already open and you want
    to start recording, inspecting, or interacting with it in place.

    Returns: attached (bool), url, title of the active tab.
    If the tab is already attached (content script running), this is a no-op and returns immediately.
    """
    return await _send_command("API_ATTACH")


@mcp.tool()
async def sentinel_navigate(url: str) -> dict[str, Any]:
    """Navigate the active browser tab to a URL and wait for it to load.

    Args:
        url: The URL to navigate to (e.g. "https://example.com")
    """
    return await _send_command("API_NAVIGATE", {"url": url})


@mcp.tool()
async def sentinel_screenshot() -> dict[str, Any]:
    """Capture a screenshot of the current browser tab. Returns a base64-encoded JPEG (max 800px wide, ~20-25K chars).

    Use this for quick visual checks in-context. If you need to save the image to disk,
    reference it later, or compare before/after states, use sentinel_screenshot_save instead.
    """
    return await _send_command("API_SCREENSHOT")


@mcp.tool()
async def sentinel_status() -> dict[str, Any]:
    """Get the current Sentinel extension status and project context.

    Returns:
      isRecording, isErrorTracking, isAttached — extension state.
      actionCount, errorCount, issueCount — current session counts.
      currentUrl — the active browser tab's URL.
      project.name — human name for the project set in Settings.
      project.path — filesystem path to the project source folder. Use this with
                     your file-reading tools to understand the codebase before acting.
      project.devUrl — the dev server URL for this project. Navigate here at the
                       start of any task unless the user specifies otherwise.

    isAttached indicates whether the content script is injected in the active tab.
    Most tools auto-attach, so you rarely need to call sentinel_attach manually.

    Always call this first at the start of a task to load project context.
    """
    return await _send_command("API_GET_STATUS")


# ── Guide Creation Tools ──

@mcp.tool()
async def sentinel_start_recording(append: bool = False) -> dict[str, Any]:
    """Start recording user interactions in the active tab.

    Args:
        append: If True, keep existing steps and append new actions. If False (default),
                clear the current session before recording.
    """
    return await _send_command("API_START_RECORDING", {"append": append})


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
async def sentinel_inject_actions(steps: list[dict], screenshot_every: int = 1) -> dict[str, Any]:
    """Inject multiple actions in one call — faster than calling sentinel_inject_action repeatedly.

    Args:
        steps: List of action dicts with keys: type (click/input/dblclick/submit/scroll/keydown),
               selector (CSS), value (optional). Example: [{"type":"click","selector":"#btn"}]
        screenshot_every: Screenshot frequency for click/submit actions (1=every, 2=every other, 0=none).
    """
    results = []
    sig_idx = 0
    for step in steps:
        action_type = step.get("type", "click")
        selector = step.get("selector", "")
        value = step.get("value", "")
        # For non-screenshot actions, temporarily patch the type to skip 400ms settle wait
        # by sending a lightweight flag (extension checks for this)
        is_sig = action_type in ("click", "dblclick", "submit")
        skip_ss = is_sig and screenshot_every > 0 and (sig_idx % screenshot_every != 0)
        if is_sig:
            sig_idx += 1
        try:
            payload: dict = {"type": action_type, "selector": selector, "value": value}
            if skip_ss:
                payload["skipScreenshot"] = True
            r = await _send_command("API_INJECT_ACTION", payload)
            results.append({"selector": selector, "type": action_type, "success": True})
        except Exception as e:
            results.append({"selector": selector, "type": action_type, "success": False, "error": str(e)})
        await asyncio.sleep(0.1)
    return {"steps": len(steps), "results": results}


@mcp.tool()
async def sentinel_edit_guide(
    title: str = "",
    intro: str = "",
    conclusion: str = "",
    step_edits: list[dict] | None = None,
    sections: list[dict] | None = None,
) -> dict[str, Any]:
    """Pre-configure guide content before exporting. Call this before sentinel_export_guide.

    All parameters are optional — only provided values are applied.

    Args:
        title: Guide title (e.g. "How to Add a Task")
        intro: Introduction paragraph shown before step 1
        conclusion: Closing paragraph shown after the last step
        step_edits: Per-step overrides — list of {"index": 0, "title": "...", "notes": "...",
                    "includeScreenshot": true, "included": true}
        sections: Sections injected between steps:
                  [{"type": "note|warning|tip|heading|html", "content": "...", "afterStep": -1}]
                  afterStep: -1 = before all steps, 0 = after step 0, N = after step N.
    """
    edits: dict = {}
    if title: edits["guideTitle"] = title
    if intro: edits["introText"] = intro
    if conclusion: edits["conclusionText"] = conclusion
    if sections: edits["sections"] = sections
    if step_edits:
        edits["steps"] = [
            {
                "originalIndex": s["index"],
                "title": s.get("title", ""),
                "notes": s.get("notes", ""),
                "includeScreenshot": s.get("includeScreenshot", True),
                "included": s.get("included", True),
            }
            for s in step_edits
        ]
    return await _send_command("API_SET_GUIDE_EDITS", {"edits": edits})


@mcp.tool()
async def sentinel_get_session() -> dict[str, Any]:
    """Get all recorded actions from the current session (without screenshot data).

    Returns a flat list of actions with type, selector, value, description, url, and timestamp.
    Use this to read step content before composing a guide.
    To also get screenshot data for specific steps, use sentinel_get_session_with_screenshots.
    """
    return await _send_command("API_GET_SESSION")


@mcp.tool()
async def sentinel_analyze_session() -> dict[str, Any]:
    """Analyze the current session. Call this FIRST before writing a custom guide.

    Returns: totalSteps, stepsWithScreenshots (indices — only use these for {{screenshot:N}}),
    stepsWithoutScreenshots, actionTypeCounts, uniqueUrls, byPage, hasMultiPageFlow,
    chapters [{title, pageUrl, stepIndices, suggestedAfterStep}] (multi-page only),
    durationMs, recommendedTitle, suggestedIntro.
    """
    return await _send_command("API_ANALYZE_SESSION")


@mcp.tool()
async def sentinel_get_session_with_screenshots(indices: list[int] | None = None) -> dict[str, Any]:
    """Get actions with base64 screenshot data. Use stepsWithScreenshots from
    sentinel_analyze_session to know which indices exist — pass only what you need.

    Args:
        indices: 0-based step indices to fetch. Omit for all steps.
    """
    return await _send_command("API_GET_SESSION_WITH_SCREENSHOTS", {"indices": indices})


@mcp.tool()
async def sentinel_set_step_description(index: int, description: str) -> dict[str, Any]:
    """Set a human-readable description for a specific recorded step.

    Use this to annotate individual steps before calling sentinel_export_guide or
    sentinel_export_custom_guide. The description appears as the step title in the
    exported guide, without needing to build a full GuideEdits JSON payload.

    Args:
        index: 0-based step index (from sentinel_analyze_session or sentinel_get_session)
        description: Human-readable label, e.g. "Click the Save button"
    """
    return await _send_command("API_SET_STEP_DESCRIPTION", {"index": index, "description": description})


@mcp.tool()
async def sentinel_export_guide(title: str = "", intro: str = "", conclusion: str = "", output_path: str = "") -> dict[str, Any]:
    """Generate an HTML guide from the current recorded session and save it to a file.

    Returns the path to the saved HTML file. Open it in a browser or tell the user where it is.
    Do NOT try to save the HTML yourself — the file is written by this tool.

    Args:
        title: Optional guide title
        intro: Optional introduction text
        conclusion: Optional conclusion text
        output_path: Where to save the file. Defaults to a timestamped file in the OS temp directory.
    """
    import tempfile, time, os
    result = await _send_command("API_GENERATE_GUIDE", {"title": title, "intro": intro, "conclusion": conclusion}, timeout=120.0)
    html = result.get("html", "")
    if not html:
        return {"success": False, "error": "No HTML returned from extension"}
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-guide-{ts}.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": output_path, "size": len(html)}


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
    """Get all saved issues (lightweight — no screenshots or context).

    Returns a flat list of issues with: id, type, title, notes, severity, pageUrl, selector,
    capturedError, correlatedStepIndices, createdAt.

    Screenshots and runtime context (network/console logs) are stripped to keep payloads small.
    Use sentinel_get_issues_with_screenshots for images.
    Use sentinel_get_issue_context for network/console logs of a specific issue.
    """
    return await _send_command("API_GET_ISSUES")


@mcp.tool()
async def sentinel_analyze_issues() -> dict[str, Any]:
    """Analyze all saved issues. Call this FIRST before writing a report.

    Returns: totalCount, bugCount, featureCount, criticalCount, highCount, mediumCount, lowCount,
    issuesWithScreenshots (IDs — use as {{screenshot:ID}} placeholders),
    issuesWithErrors, byPage [{pageUrl, issueIds, criticalCount, highCount}],
    bySeverity [{severity, issueIds, count}], patterns [{pattern, issueIds, type}],
    recommendedTitle, executiveSummary.
    """
    return await _send_command("API_ANALYZE_ISSUES")


@mcp.tool()
async def sentinel_get_issues_with_screenshots(ids: list[str] | None = None) -> dict[str, Any]:
    """Get issues with base64 screenshot data. Use issuesWithScreenshots from
    sentinel_analyze_issues to know which IDs exist — pass only what you need.

    Args:
        ids: Issue IDs to fetch. Omit for all issues.
    """
    return await _send_command("API_GET_ISSUES_WITH_SCREENSHOTS", {"ids": ids})


@mcp.tool()
async def sentinel_update_issue(id: str, title: str = "", notes: str = "", severity: str = "", type: str = "") -> dict[str, Any]:
    """Update an existing issue. Only provided fields are changed.

    Args:
        id: Issue ID (from sentinel_get_issues)
        title: New title
        notes: New notes
        severity: low, medium, high, or critical
        type: New type — bug or feature-request (omit to keep existing)
    """
    updates: dict = {}
    if title: updates["title"] = title
    if notes: updates["notes"] = notes
    if severity: updates["severity"] = severity
    if type: updates["type"] = type
    if not updates:
        return {"success": False, "error": "No fields to update provided"}
    return await _send_command("API_UPDATE_ISSUE", {"id": id, "updates": updates})


@mcp.tool()
async def sentinel_delete_issue(id: str) -> dict[str, Any]:
    """Delete an issue by ID.

    Args:
        id: Issue ID (from sentinel_get_issues)
    """
    return await _send_command("API_DELETE_ISSUE", {"id": id})


@mcp.tool()
async def sentinel_clear_session() -> dict[str, Any]:
    """Clear the entire current session — steps, errors, issues, assertions, and guide edits.

    Use this to reset to a clean state without starting a new recording.
    """
    return await _send_command("API_CLEAR_SESSION")


@mcp.tool()
async def sentinel_get_issue_context(id: str) -> dict[str, Any]:
    """Get the runtime context captured when an issue was saved.

    Returns the network log (last 20 XHR/fetch requests with url, method, status, duration),
    console log (last 30 entries with level and message), and captured JS errors at the time
    the issue was created. Use this to include evidence like failing API calls or error stacks
    in reports.

    Args:
        id: Issue ID (from sentinel_get_issues)
    """
    return await _send_command("API_GET_ISSUE_CONTEXT", {"id": id})


@mcp.tool()
async def sentinel_get_test_results() -> dict[str, Any]:
    """Get results from the last playback/test run.

    Returns:
      results — list of assertion results with: assertion (type, selector, expected),
                passed (bool), actual, error, attempts, durationMs.
      summary — PlaybackRunSummary with: totalSteps, completedSteps, recoveredSteps,
                failedSteps, averageConfidence, assertionPassCount, assertionFailCount,
                flaky (bool), stepMetrics [{index, selector, resolution, confidence,
                attempts, durationMs, warning}], startedAt, completedAt.
      sessionId — ID of the session that was played back.

    Call this after sentinel_run_saved_session completes (or use wait=True on that tool).
    Use the data to build test run reports with sentinel_export_custom_report.
    """
    return await _send_command("API_GET_TEST_RESULTS")


@mcp.tool()
async def sentinel_export_issues(output_path: str = "") -> dict[str, Any]:
    """Generate an HTML issue report from all saved issues and save it to a file.

    Returns the path to the saved HTML file. Do NOT try to save the HTML yourself.

    Args:
        output_path: Where to save the file. Defaults to a timestamped file in the OS temp directory.
    """
    import tempfile, time, os
    result = await _send_command("API_GENERATE_REPORT", timeout=120.0)
    html = result.get("html", "")
    if not html:
        return {"success": False, "error": "No HTML returned from extension"}
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-report-{ts}.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": output_path, "size": len(html)}


# ── Custom Guide / Report Generators ──

_CSS_REFERENCE = """
AVAILABLE CSS CLASSES (from the Sentinel design system):

LAYOUT
  .page          — max-width 960px centered wrapper (already applied by shell)
  .two-col       — 2-column responsive grid
  .three-col     — 3-column responsive grid
  .card-grid     — auto-fill card grid (min 260px columns)

HERO BANNER
  .hero          — full-width gradient banner (blue→purple), white text
  .hero h1       — large white title inside hero
  .hero .subtitle — secondary line, 80% opacity
  .hero .meta    — small dim metadata line

CARDS
  .card          — white card, rounded, subtle shadow
  .card-accent             — blue left border
  .card-accent-green       — green left border
  .card-accent-red         — red left border
  .card-accent-yellow      — yellow left border
  .card-accent-purple      — purple left border

STEPS (use for numbered instructions)
  .step          — white step card with shadow
  .step-header   — flex row: step-num + h3
  .step-num      — blue circle number (add class "done" for green)
  .step-notes    — blue-left-bordered note box inside a step
  .substep       — indented sub-action line

CALLOUTS
  .callout .callout-note    — blue info callout
  .callout .callout-warning — yellow warning callout
  .callout .callout-tip     — green tip callout
  .callout .callout-danger  — red danger callout
  .callout .callout-success — green success callout
  Structure: <div class="callout callout-note"><span class="callout-icon">ℹ️</span><div class="callout-body"><strong>Title</strong> Body text</div></div>

KEYBOARD BADGES
  .kbd           — styled keyboard key, e.g. <kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">S</kbd>

TABLES
  .table         — full-width styled table (use on <table> element)
  <table class="table"><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>

CHECKLISTS
  .checklist     — styled <ul> with checkmarks
  .checklist li.pending — gray circle (not done)
  .checklist li.warn    — yellow ! (warning)

STATS ROW
  .stats         — flex row of stat cards
  .stat          — individual stat card
  .stat .num     — big number
  .stat .label   — small label beneath
  Color modifiers: .stat-red .stat-orange .stat-yellow .stat-green .stat-blue .stat-purple

BADGES
  .badge .badge-critical   — red
  .badge .badge-high       — orange
  .badge .badge-medium     — yellow
  .badge .badge-low        — green
  .badge .badge-bug        — indigo
  .badge .badge-feature    — cyan
  .badge .badge-blue       — blue
  .badge .badge-gray       — gray

TIMELINE
  .timeline      — vertical timeline container
  .timeline-item — single event
  .timeline-item .tl-time  — small timestamp
  .timeline-item .tl-title — bold event name
  .timeline-item .tl-body  — description

TYPOGRAPHY / MISC
  h1 h2 h3 p a code pre  — styled by default
  .muted         — gray small text
  .bold          — font-weight 700
  .center        — text-align center
  .divider       — <hr class="divider"> horizontal rule
  .mt-8 .mt-16 .mb-8 .mb-16  — spacing utilities
  .intro .conclusion — padded info boxes

GUIDE-SPECIFIC (use these in guides)
  .chapter-heading    — blue left-bar chapter heading for multi-page guides
                        Use: <h2 class="chapter-heading">Dashboard</h2>
                        Distinct from h2 (bottom border only) and .section-divider (centered rule)
  .step-count-strip   — small right-aligned "Step N of M" counter inside .step
                        Use: <p class="step-count-strip">Step 3 of 12</p> (for guides with 8+ steps)
  .step-skipped       — dashed-border placeholder for intentionally omitted steps
                        Use: <div class="step-skipped">Step omitted</div>

ISSUE REPORT CARDS (use these in reports instead of generic .card)
  .issue-card             — base issue card (white, rounded, subtle shadow)
  .issue-card-critical    — red left border + light red background
  .issue-card-high        — orange left border + light orange background
  .issue-card-medium      — yellow left border + light yellow background
  .issue-card-low         — green left border + light green background
  .issue-card-header      — flex row: badges + h3 title
  .issue-card-meta        — small gray metadata line (page URL, element selector)
  .issue-card-notes       — semi-transparent notes block inside a card

SECTION DIVIDERS (use between severity groups)
  .section-divider        — labeled horizontal rule with centered text
  Structure: <div class="section-divider"><span>Critical Issues</span></div>

PAGE IMPACT TABLE (use in "Affected Pages" section)
  .page-impact-row        — apply to <tr> in affected-pages table
  .page-impact-badge      — count badge inside table cell (gray by default)
  .page-impact-badge.critical — red badge
  .page-impact-badge.high     — orange badge

SCREENSHOTS
  Use placeholder {{screenshot:N}} where N is the 0-based step index.
  For issue reports use {{screenshot:ISSUE_ID}} where ISSUE_ID is the issue's id field.
  Placeholders are replaced with expandable thumbnail+full-size image widgets automatically.
"""


@mcp.tool()
async def sentinel_design_system() -> dict[str, Any]:
    """Return the Sentinel CSS design system reference — all available class names and usage.

    Call this before sentinel_export_custom_guide or sentinel_export_custom_report when
    you need to know which CSS classes are available. Loaded on demand, not at startup.
    """
    return {"reference": _CSS_REFERENCE}


@mcp.tool()
async def sentinel_export_custom_guide(body: str, title: str = "Sentinel Guide", output_path: str = "") -> dict[str, Any]:
    """Generate a custom HTML guide. Write the body HTML — CSS is injected automatically.
    Body is wrapped in <div class="page">...</div>. No html/head/body/style tags needed.
    Call sentinel_design_system() for available CSS classes.

    WORKFLOW: sentinel_analyze_session → sentinel_get_session →
    [sentinel_get_session_with_screenshots(indices)] → [sentinel_set_step_description] →
    sentinel_export_custom_guide(body, title=analysis.recommendedTitle)

    STRUCTURE:
      .hero (title + suggestedIntro as .subtitle + date as .meta)
      [hasMultiPageFlow: <h2 class="chapter-heading"> before each page's first step]
      Per step: <div class="step"><div class="step-header"><span class="step-num">N</span>
        <h3>desc</h3></div>[step-notes][callout]
        [{{screenshot:N}} — only if N in stepsWithScreenshots]</div>
      [<div class="conclusion">...</div>]

    SCREENSHOT PLACEHOLDERS: {{screenshot:N}} — only valid for N in stepsWithScreenshots.

    Args:
        body: Full HTML body markup
        title: Page title (use analysis.recommendedTitle)
        output_path: Where to save (defaults to temp dir)
    """
    import tempfile, time, os
    result = await _send_command("API_GENERATE_CUSTOM_GUIDE", {"body": body, "title": title}, timeout=30.0)
    html = result.get("html", "")
    if not html:
        return {"success": False, "error": result.get("error", "No HTML returned")}
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-guide-{ts}.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": output_path, "size": len(html)}


@mcp.tool()
async def sentinel_export_custom_report(body: str, title: str = "Sentinel Issue Report", output_path: str = "") -> dict[str, Any]:
    """Generate a custom HTML issue report. Write the body HTML — CSS is injected automatically.
    Body is wrapped in <div class="page">...</div>. No html/head/body/style tags needed.
    Call sentinel_design_system() for available CSS classes.

    WORKFLOW: sentinel_analyze_issues → sentinel_get_issues →
    [sentinel_get_issues_with_screenshots(ids)] →
    sentinel_export_custom_report(body, title=analysis.recommendedTitle)

    STRUCTURE:
      .hero (title + executiveSummary as .subtitle + date as .meta)
      .stats row (.stat per severity with count > 0, colored .stat-red/.stat-orange/.stat-yellow/.stat-blue)
      Per severity group (critical→high→medium→low, skip empty):
        <div class="section-divider"><span>Critical Issues</span></div>
        Per issue: <div class="issue-card issue-card-{severity}">
          .issue-card-header: .badge.badge-{severity} + .badge.badge-bug/badge-feature + h3 title
          .issue-card-meta: page URL | .issue-card-notes: notes
          [{{screenshot:ISSUE_ID}} — only if ID in issuesWithScreenshots]
      [patterns → h2 "Patterns" + .callout.callout-warning per pattern]
      [byPage entries ≥3 → h2 "Affected Pages" + .table with .page-impact-row rows]

    SCREENSHOT PLACEHOLDERS: {{screenshot:ISSUE_ID}} — only valid for IDs in issuesWithScreenshots.

    Args:
        body: Full HTML body markup
        title: Page title (use analysis.recommendedTitle)
        output_path: Where to save (defaults to temp dir)
    """
    import tempfile, time, os
    result = await _send_command("API_GENERATE_CUSTOM_REPORT", {"body": body, "title": title}, timeout=30.0)
    html = result.get("html", "")
    if not html:
        return {"success": False, "error": result.get("error", "No HTML returned")}
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-report-{ts}.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": output_path, "size": len(html)}


@mcp.tool()
async def sentinel_render_blocks(
    title: str,
    blocks: list[dict],
    output_path: str = "",
) -> dict[str, Any]:
    """Compose an HTML report from typed content blocks. Each block is auto-rendered using the
    Sentinel design system — no raw HTML needed. Mix and match block types freely.

    This is the PREFERRED way to create reports. Instead of writing HTML, describe what to show.
    The renderer has access to all stored data (issues, session steps, test results) and renders
    them with full styling, screenshots, and evidence automatically.

    Args:
        title: Page/document title
        blocks: List of block dicts. Each must have a "type" key. Supported types:

            hero        — Banner.     Keys: title, subtitle (optional), meta (optional, defaults to date)
            stats       — Stats row.  Keys: items [{label, value, color}]  color: red|orange|yellow|green|blue|purple
            divider     — Section break. Keys: label (optional — omit for plain <hr>)
            heading     — Section heading. Keys: text
            text        — Paragraph.  Keys: content
            issue_card  — Auto-render a saved issue with screenshot + error detail. Keys: issue_id
            step_card   — Auto-render a recorded step with screenshot. Keys: step_index (0-based)
            test_results — Auto-render full assertion table + playback summary stats. No extra keys needed.
            context     — Auto-render network/console evidence for an issue. Keys: issue_id
            callout     — Callout box. Keys: style (note|warning|tip|danger|success), title (optional), body
            table       — Data table. Keys: headers [str], rows [[str]]
            checklist   — Check list. Keys: items [{text, status}]  status: done (default)|pending|warn
            timeline    — Event timeline. Keys: events [{time, title, body (optional)}]
            html        — Raw HTML passthrough. Keys: content

        output_path: Where to save the HTML file (defaults to temp dir)

    Example:
        sentinel_render_blocks("Test Report", [
            {"type": "hero", "title": "Login Flow", "subtitle": "Regression test results"},
            {"type": "test_results"},
            {"type": "divider", "label": "Issues Found"},
            {"type": "issue_card", "issue_id": "abc123"},
            {"type": "context", "issue_id": "abc123"},
            {"type": "callout", "style": "tip", "body": "Consider adding retry logic"}
        ])
    """
    import tempfile, time, os
    result = await _send_command("API_RENDER_BLOCKS", {"title": title, "blocks": blocks}, timeout=30.0)
    html = result.get("html", "")
    if not html:
        return {"success": False, "error": result.get("error", "No HTML returned")}
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-report-{ts}.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return {"path": output_path, "size": len(html)}


# ── Extended AI Tools ──

@mcp.tool()
async def sentinel_get_page_snapshot(
    role: str = "",
    region_top: int = -1,
    region_bottom: int = -1,
    limit: int = 40,
) -> dict[str, Any]:
    """Get a compact map of interactive elements on the current page.

    Returns title, url, and elements with selector, tag, role, text, type, value,
    placeholder, and bounding rect. Only visible elements are returned.
    Selectors are the shortest unique path (IDs, data-testid, stable classes preferred).

    Args:
        role: Filter by ARIA role or tag — e.g. "button", "input", "link", "tab".
              Returns only elements whose role or tag contains this string.
        region_top: Only include elements whose top edge is >= this Y pixel value.
        region_bottom: Only include elements whose top edge is <= this Y pixel value.
                       Use region_top+region_bottom together to scope to a page section.
        limit: Max elements to return (default 40; set lower for even more focused results).

    Tip: Use role="button" to list all buttons, or region_top=0,region_bottom=400 for
    the top portion of the page. Always prefer a filtered call over scanning all 40 elements.
    """
    payload: dict[str, Any] = {"limit": limit}
    if role:
        payload["role"] = role
    if region_top >= 0:
        payload["regionTop"] = region_top
    if region_bottom >= 0:
        payload["regionBottom"] = region_bottom
    return await _send_command("API_GET_PAGE_SNAPSHOT", payload)


@mcp.tool()
async def sentinel_find_element(
    text: str = "",
    role: str = "",
    tag: str = "",
    limit: int = 5,
    include_hidden: bool = False,
) -> dict[str, Any]:
    """Find elements by visible text content, ARIA role, or tag name.

    Returns only visible elements by default. Selectors are compact (shortest unique path).

    Args:
        text: Visible text or aria-label to search for (case-insensitive, partial match)
        role: ARIA role (e.g. "button", "link", "tab", "checkbox")
        tag: HTML tag name (e.g. "button", "input", "select")
        limit: Max results to return (default 5; raise only if you need more candidates)
        include_hidden: Set True to also return hidden/off-screen elements
    """
    return await _send_command("API_FIND_ELEMENT", {
        "text": text, "role": role, "tag": tag,
        "limit": limit, "includeHidden": include_hidden,
    })


@mcp.tool()
async def sentinel_get_text_content(selector: str) -> dict[str, Any]:
    """Read the full text content of an element.

    Args:
        selector: CSS selector for the target element

    Returns exists (bool) and text (str). Use this to verify page state after an action.
    """
    return await _send_command("API_GET_TEXT_CONTENT", {"selector": selector})


@mcp.tool()
async def sentinel_get_element_state(selector: str) -> dict[str, Any]:
    """Get the full state of a form element or interactive widget.

    Args:
        selector: CSS selector for the target element

    Returns: exists, tag, value, checked, disabled, readOnly, visible, text, className, placeholder.
    Use this to read current form values, verify checkbox states, or check if a button is disabled.
    """
    return await _send_command("API_GET_ELEMENT_STATE", {"selector": selector})


@mcp.tool()
async def sentinel_hover(selector: str) -> dict[str, Any]:
    """Trigger mouseover/mouseenter events on an element to reveal hover menus or tooltips.

    Args:
        selector: CSS selector for the target element
    """
    return await _send_command("API_HOVER", {"selector": selector})


@mcp.tool()
async def sentinel_select_option(selector: str, value: str) -> dict[str, Any]:
    """Set the value of a <select> dropdown element and fire change/input events.

    Args:
        selector: CSS selector for the <select> element
        value: The option value to select (the value attribute, not display text)
    """
    return await _send_command("API_SELECT_OPTION", {"selector": selector, "value": value})


@mcp.tool()
async def sentinel_key_sequence(keys: str, selector: str = "") -> dict[str, Any]:
    """Send a keyboard shortcut or key combination to the page or a specific element.

    Args:
        keys: Key combo string — e.g. "Enter", "Escape", "Tab", "Ctrl+S", "Ctrl+Z", "ArrowDown"
        selector: CSS selector for the element to focus first (optional; defaults to active element)
    """
    return await _send_command("API_KEY_SEQUENCE", {"keys": keys, "selector": selector})


@mcp.tool()
async def sentinel_drag(source: str, target: str) -> dict[str, Any]:
    """Perform a drag-and-drop from one element to another using native drag events.

    Args:
        source: CSS selector for the element to drag
        target: CSS selector for the drop target
    """
    return await _send_command("API_DRAG", {"source": source, "target": target})


@mcp.tool()
async def sentinel_wait_for_text(text: str, selector: str = "", timeout: int = 10000) -> dict[str, Any]:
    """Wait until specific text appears anywhere on the page (or within a specific element).

    Args:
        text: The text string to wait for (exact substring match)
        selector: Optional CSS selector to scope the search within
        timeout: Maximum wait time in milliseconds (default 10000)
    """
    return await _send_command("API_WAIT_FOR_TEXT", {"text": text, "selector": selector, "timeout": timeout}, timeout=timeout / 1000 + 5)


@mcp.tool()
async def sentinel_get_network_log() -> dict[str, Any]:
    """Get all captured network requests (XHR and fetch) since the page loaded.

    Returns a list of entries with: url, method, status, error (if failed), duration (ms), timestamp.
    Use this to see what API calls a page makes, catch 4xx/5xx errors, and verify request data.
    Note: Only captures requests made after the Sentinel extension loaded on the page.
    """
    return await _send_command("API_GET_NETWORK_LOG")


@mcp.tool()
async def sentinel_wait_for_network_idle(duration: int = 500, timeout: int = 15000) -> dict[str, Any]:
    """Wait until there are no in-flight network requests for a quiet period.

    Use this after clicking buttons or submitting forms that trigger AJAX requests,
    before taking a screenshot or reading page state. Much more reliable than fixed sleeps.

    Args:
        duration: Milliseconds of network silence required (default 500)
        timeout: Maximum total wait time in milliseconds (default 15000)
    """
    return await _send_command("API_WAIT_FOR_NETWORK_IDLE", {"duration": duration, "timeout": timeout}, timeout=timeout / 1000 + 5)


@mcp.tool()
async def sentinel_get_console_log() -> dict[str, Any]:
    """Get all captured console output (log, warn, error, info, debug) since the page loaded.

    Returns a list of entries with: level, message, timestamp.
    Useful for reading debug output, checking for runtime errors, and understanding app state.
    """
    return await _send_command("API_GET_CONSOLE_LOG")


@mcp.tool()
async def sentinel_save_session(name: str) -> dict[str, Any]:
    """Save the current session to persistent storage.

    Args:
        name: Unique name (e.g. "login-flow")
    """
    return await _send_command("API_SAVE_SESSION", {"name": name})


@mcp.tool()
async def sentinel_load_session(name: str) -> dict[str, Any]:
    """Load a saved session as the current active session.

    Args:
        name: Name of the session to load
    """
    return await _send_command("API_LOAD_SESSION", {"name": name})


@mcp.tool()
async def sentinel_list_sessions() -> dict[str, Any]:
    """List all saved sessions with their names, action counts, and save timestamps."""
    return await _send_command("API_LIST_SESSIONS")


@mcp.tool()
async def sentinel_run_saved_session(name: str, speed: float = 1.0, wait: bool = False) -> dict[str, Any]:
    """Load and replay a previously saved session in the active tab.

    Useful for regression testing — record a workflow once, replay it to verify nothing broke.

    Args:
        name: Name of the session to replay
        speed: Playback speed multiplier (default 1.0; use 2.0 for faster replay)
        wait: If True, block until playback completes and return full test results
              (assertions, summary, step metrics). If False (default), return immediately
              after starting playback. Use wait=True when building test run reports.
    """
    timeout = 330.0 if wait else 30.0
    return await _send_command("API_RUN_SAVED_SESSION", {"name": name, "speed": speed, "wait": wait}, timeout=timeout)


@mcp.tool()
async def sentinel_screenshot_save(output_path: str = "") -> dict[str, Any]:
    """Capture a screenshot and save it to a file. Returns the file path.

    Use this (instead of sentinel_screenshot) when you need to reference the screenshot
    later, compare it, or include it in a report. The file is a JPEG.

    Args:
        output_path: Where to save. Defaults to a timestamped file in the OS temp directory.
    """
    import base64, tempfile, time, os
    result = await _send_command("API_SCREENSHOT")
    data = result.get("screenshot", "")
    if not data:
        return {"success": False, "error": "No screenshot returned"}
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-screenshot-{ts}.jpg")
    with open(output_path, "wb") as f:
        f.write(base64.b64decode(data))
    return {"path": output_path}


@mcp.tool()
async def sentinel_compare_screenshots(before_path: str, output_path: str = "") -> dict[str, Any]:
    """Take an 'after' screenshot and compare pixel-by-pixel to a saved 'before' screenshot.
    Use sentinel_screenshot_save() before an action, then call this after.
    Returns before_path, after_path, change_pct, diff_path (requires Pillow).

    Args:
        before_path: Path from a previous sentinel_screenshot_save() call
        output_path: Where to save the after screenshot (defaults to temp dir)
    """
    import base64, tempfile, time, os
    result = await _send_command("API_SCREENSHOT")
    data = result.get("screenshot", "")
    if not data:
        return {"success": False, "error": "No screenshot returned"}
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    if not output_path:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-screenshot-{ts}.jpg")
    after_bytes = base64.b64decode(data)
    with open(output_path, "wb") as f:
        f.write(after_bytes)

    # Attempt pixel diff with Pillow
    diff_path: str | None = None
    change_pct: float = -1.0
    try:
        from PIL import Image, ImageChops  # type: ignore
        import io
        img_before = Image.open(before_path).convert("RGB")
        img_after = Image.open(output_path).convert("RGB")
        # Resize to match if needed
        if img_before.size != img_after.size:
            img_after = img_after.resize(img_before.size)
        diff = ImageChops.difference(img_before, img_after)
        pixels = list(diff.getdata())
        changed = sum(1 for px in pixels if any(c > 10 for c in px))
        change_pct = round(changed / len(pixels) * 100, 2)
        # Save diff image (amplified)
        diff_amplified = diff.point(lambda x: min(255, x * 8))
        diff_path = os.path.join(tempfile.gettempdir(), f"sentinel-diff-{int(time.time())}.jpg")
        diff_amplified.save(diff_path)
    except ImportError:
        change_pct = -1.0  # Pillow not installed; comparison unavailable

    return {
        "before_path": before_path,
        "after_path": output_path,
        "change_pct": change_pct,
        "diff_path": diff_path,
        "note": "change_pct=-1 means Pillow is not installed; install with: pip install Pillow" if change_pct == -1 else None,
    }


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
async def sentinel_create_guide(steps: list[dict[str, str]], title: str = "Guide", url: str = "") -> dict[str, Any]:
    """Perform a sequence of actions on the current (or a new) tab and export an HTML guide.

    If url is omitted the guide is built on whichever tab is currently active — this is the
    recommended path when the user is already logged in or mid-session, because navigating
    to a fresh URL will lose auth state and session context.

    Args:
        steps: List of action dicts with keys: type, selector, and optionally value and description.
               Example: [{"type": "click", "selector": "#login-btn", "description": "Click the Login button"},
                         {"type": "input", "selector": "#search", "value": "hello", "description": "Type a search query"}]
               The description field is optional but recommended — it becomes the step title in the exported guide.
        title: Guide title
        url: Optional starting URL. Only provide this when you explicitly want to navigate
             to a fresh page first. Leave empty to work on the current tab.
    """
    # Only navigate if a URL was explicitly provided
    nav = None
    if url:
        nav = await _send_command("API_NAVIGATE", {"url": url})

    # Start recording
    await _send_command("API_START_RECORDING")

    # Execute each step — always stop recording even if an exception escapes
    results = []
    try:
        for i, step in enumerate(steps):
            try:
                r = await _send_command("API_INJECT_ACTION", {
                    "type": step.get("type", "click"),
                    "selector": step.get("selector", ""),
                    "value": step.get("value", ""),
                })
                results.append(r)
                # Set step description if provided
                desc = step.get("description", "")
                if desc:
                    try:
                        await _send_command("API_SET_STEP_DESCRIPTION", {"index": i, "description": desc})
                    except Exception:
                        pass  # description is best-effort
                await asyncio.sleep(0.3)  # Brief pause between actions
            except Exception as e:
                results.append({"success": False, "error": str(e)})
    finally:
        # Guaranteed stop — recording must not be left running if anything goes wrong
        await _send_command("API_STOP_RECORDING")

    # Export guide — write to file so the AI never needs to handle raw HTML
    import tempfile, time, os
    guide = await _send_command("API_GENERATE_GUIDE", {"title": title})
    html = guide.get("html", "")
    output_path = ""
    if html:
        ts = int(time.time())
        output_path = os.path.join(tempfile.gettempdir(), f"sentinel-guide-{ts}.html")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
    final_url = (nav.get("url") if nav else None) or url or ""
    return {"url": final_url, "stepResults": results, "path": output_path, "size": len(html)}


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
