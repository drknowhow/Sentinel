<p align="center">
  <img src="icon.png" alt="Sentinel" width="128" height="128">
</p>

<h1 align="center">Sentinel</h1>

<p align="center">
  <strong>Web Application Tester & Guide Creator</strong><br>
  Record web interactions, capture bugs, and generate step-by-step visual guides — no code required.
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
Click record and use your web app normally. Sentinel captures every click, keystroke, scroll, and navigation with intelligent noise reduction. Play sessions back at adjustable speed (0.5x–4x) or step through them one at a time with element highlighting.

### Auto-Generate Visual Guides
Turn any recorded session into a polished, standalone HTML guide with embedded screenshots. Reorder steps, add titles and notes, toggle screenshots, and export — ready to share via email, Slack, or your wiki.

### Test with Assertions
Add assertions to any step — check that elements are visible, hidden, contain specific text, or have a CSS class. Run playback and get a clear pass/fail test report with actual vs. expected values.

### Track Bugs & Feature Requests
Enable error tracking to automatically capture console errors, unhandled exceptions, failed network requests, and CSP violations. Annotate errors as bug reports with severity levels, or create feature requests tied to specific page elements. Export everything as a styled HTML report or JSON.

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
│       ├── background.ts    # Service worker — coordinates recording/playback/exports
│       ├── content.ts       # Content script — action capture, playback, error tracking
│       ├── App.tsx           # Main side panel UI
│       ├── EditorApp.tsx     # Guide editor (opens in new tab)
│       ├── components/       # React components (Header, StepList, ErrorFeed, etc.)
│       ├── hooks/            # Custom hooks (state sync, video recording, guide editor)
│       └── lib/              # Utilities (storage, HTML generation, message types)
├── STARTUP_GUIDE.html        # Comprehensive user guide
├── PRIVACY_POLICY.md         # Privacy policy
└── STORE_LISTING.md          # Chrome Web Store listing copy
```

---

## Chrome Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab to record actions and capture screenshots |
| `storage` | Save sessions, issues, and preferences locally |
| `scripting` | Inject recording and playback scripts into web pages |
| `downloads` | Save exported guides, reports, and video files |
| `tabs` | Identify the active tab and open the guide editor |
| `sidePanel` | Display the Sentinel UI in Chrome's side panel |
| `tabCapture` | Record video of the active browser tab |

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
