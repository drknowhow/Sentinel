<p align="center">
  <img src="icon.png" alt="Sentinel" width="128" height="128">
</p>

<h1 align="center">Sentinel</h1>

<p align="center">
  <strong>Web Application Tester & Guide Creator</strong><br>
  Record web interactions, capture bugs and feature requests, and generate step-by-step visual guides — manually or fully automated via 50+ MCP tools.
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
  <img alt="100% Local" src="https://img.shields.io/badge/Privacy-100%25_Local-16a34a">
</p>

---

## Features

### Record & Replay
Click record and use your web app normally. Sentinel captures every click, keystroke, scroll, drag-and-drop, and navigation with intelligent noise reduction and smart selectors with fallback candidates. Play sessions back at adjustable speed (0.5x–4x) or step through them one at a time with element highlighting and automatic selector recovery.

### Auto-Generate Visual Guides
Turn any recorded session into a polished, standalone HTML guide with embedded screenshots. Edit in the built-in guide editor, add custom sections (notes, warnings, tips, headings), choose internal or client export profiles, and use the block-based renderer for fully custom reports.

### Test with Assertions
Add assertions to any step — check that elements are visible, hidden, contain specific text, or have a CSS class. Configure retry logic for async elements. Run playback and get a detailed test report with pass/fail results, selector recovery details, and flakiness detection across runs.

### Track Bugs & Issues
Enable error tracking to automatically capture console errors, unhandled exceptions, failed network requests, and CSP violations. Issues include severity levels, fingerprinting for duplicate detection, clustering for pattern recognition, and full error context (network logs, console output). Export styled HTML reports or analyze issues via MCP.

### Feature Requests
Create feature requests tied to specific page elements. Inspect an element, describe the enhancement, set priority, and export — all with screenshots and DOM context.

### AI Automation (MCP)
50+ MCP tools let Claude Code, Cursor, Copilot, and other AI assistants control Sentinel programmatically. Navigate pages, query elements, record sessions, take and compare screenshots, drag-and-drop, manage multi-project configurations, and generate custom reports — all hands-free in a single conversation.

### Record Video Clips
Capture short video recordings of your active tab (up to 5 minutes) and download them as WebM files.

### 100% Local & Private
All data stays in your browser. Zero network requests, no analytics, nothing sent to external servers. Your sessions, screenshots, and reports never leave your machine unless you explicitly export them.

---

## Quick Start

### Prerequisites
- Google Chrome or Microsoft Edge (Chromium-based)
- Node.js 18+

### Build & Install

```bash
# Clone the repo
git clone https://github.com/drknowhow/Sentinel.git
cd Sentinel/extension

# Install dependencies and build
npm install
npm run build
```

1. Open `chrome://extensions` in your browser
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/dist` folder
4. Click the Sentinel icon in your toolbar, then **Open Side Panel**

> For detailed setup and usage instructions, see the [User Guide](STARTUP_GUIDE.html).

---

## Project Structure

```
Sentinel/
├── extension/
│   ├── public/              # Static assets, manifest.json, icons
│   └── src/
│       ├── background.ts    # Service worker — state, screenshots, AI logging, WebSocket bridge
│       ├── content.ts       # Content script — recording, playback, inspection, element querying
│       ├── App.tsx           # Main side panel UI
│       ├── EditorApp.tsx     # Guide editor (opens in new tab)
│       ├── components/       # React components (Header, StepList, ErrorFeed, IssueList, AiLog, etc.)
│       ├── hooks/            # Custom hooks (state sync, video recording, guide editor)
│       └── lib/              # Utilities (storage, HTML/report generation, message types)
├── mcp-server/
│   ├── sentinel_mcp.py      # MCP server (50+ tools)
│   ├── launcher.py          # Native messaging launcher
│   └── install_host.py      # Native host registration
├── docs/                    # GitHub Pages site & user guide
├── PRIVACY_POLICY.md         # Privacy policy
└── STARTUP_GUIDE.html        # Quick-start guide
```

---

## Chrome Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab to record actions and capture screenshots |
| `storage` | Save sessions, issues, projects, and preferences locally |
| `scripting` | Inject recording and playback scripts into web pages |
| `downloads` | Save exported guides, reports, and video files |
| `tabs` | Identify the active tab and open the guide editor |
| `sidePanel` | Display the Sentinel UI in Chrome's side panel |
| `tabCapture` | Record video of the active browser tab |
| `alarms` | Schedule periodic tasks (connection health checks) |
| `nativeMessaging` | Communicate with the native launcher to start/stop the MCP server |

---

## Development

```bash
cd extension

# Start dev server with HMR
npm run dev

# Lint
npm run lint

# Production build
npm run build
```

After building, reload the extension at `chrome://extensions` to pick up changes.

---

## Privacy

Sentinel makes **zero network requests**. All data is stored locally via `chrome.storage.local` and never transmitted anywhere. See the full [Privacy Policy](PRIVACY_POLICY.md).

---

## License

MIT
